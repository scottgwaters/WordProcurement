import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// Fields that are conceptually "about the word" rather than "about this age
// variant" — editing them on the grouped page fans out to every row with
// the same spelling. Example sentence is shared by default because most
// words read fine across age tiers; per-variant sentences are still
// possible via the single-word edit page.
const SHARED_FIELDS = [
  "definition",
  "partOfSpeech",
  "pronunciation",
  "exampleSentence",
  "heartWordExplanation",
  "category",
  "source",
] as const;

type SharedField = (typeof SHARED_FIELDS)[number];

// GET /api/words/group/[word] — every row matching this spelling.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ word: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { word: wordParam } = await params;
  const word = decodeURIComponent(wordParam).toUpperCase();

  const variants = await prisma.word.findMany({
    where: { word },
    orderBy: [{ ageGroup: "asc" }, { level: "asc" }],
  });

  if (variants.length === 0) {
    return NextResponse.json({ error: "No variants found" }, { status: 404 });
  }

  return NextResponse.json({
    word,
    variants: variants.map(transform),
  });
}

// PATCH /api/words/group/[word] — atomic bulk update. Body shape:
//   {
//     shared?:   { definition?, partOfSpeech?, pronunciation?, exampleSentence?, heartWordExplanation?, category?, source? },
//     variants?: [{ id, version, level?, hints?, ageGroup? }]
//   }
//
// Shared fields fan out to every matching row. Per-variant fields apply
// only to the matching row. All updates run in a single transaction; any
// version mismatch on any row fails the whole thing with 409 so partial
// writes don't leave the group inconsistent.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ word: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { word: wordParam } = await params;
  const word = decodeURIComponent(wordParam).toUpperCase();
  const body = await request.json();

  const existing = await prisma.word.findMany({ where: { word } });
  if (existing.length === 0) {
    return NextResponse.json({ error: "No variants found" }, { status: 404 });
  }
  const byId = new Map(existing.map((w) => [w.id, w]));

  // Build shared-field updates (snake_case → camelCase on the fly).
  const sharedInput: Record<string, unknown> = body.shared ?? {};
  const sharedUpdate: Record<string, unknown> = {};
  const sharedKeyMap: Record<string, SharedField> = {
    definition: "definition",
    part_of_speech: "partOfSpeech",
    pronunciation: "pronunciation",
    example_sentence: "exampleSentence",
    heart_word_explanation: "heartWordExplanation",
    category: "category",
    source: "source",
  };
  for (const [apiKey, dbKey] of Object.entries(sharedKeyMap)) {
    if (apiKey in sharedInput) {
      const val = sharedInput[apiKey];
      sharedUpdate[dbKey] = val === "" ? null : val;
    }
  }

  // Validate per-variant payloads.
  const variantInputs: Array<{
    id: string;
    version?: number;
    level?: number;
    hints?: Prisma.InputJsonValue;
    ageGroup?: string;
  }> = Array.isArray(body.variants) ? body.variants : [];

  for (const v of variantInputs) {
    if (!byId.has(v.id)) {
      return NextResponse.json(
        { error: `Variant ${v.id} is not part of this word group` },
        { status: 400 }
      );
    }
  }

  // Single transaction: shared fan-out first, then per-variant updates.
  // Each update asserts the version so concurrent editors get a 409.
  try {
    const operations: Prisma.PrismaPromise<unknown>[] = [];

    if (Object.keys(sharedUpdate).length > 0) {
      operations.push(
        prisma.word.updateMany({
          where: { word },
          data: {
            ...sharedUpdate,
            version: { increment: 1 },
          },
        })
      );
    }

    for (const v of variantInputs) {
      const data: Record<string, unknown> = { version: { increment: 1 } };
      if (v.level !== undefined) data.level = v.level;
      if (v.hints !== undefined) data.hints = v.hints;
      if (v.ageGroup !== undefined) data.ageGroup = v.ageGroup;
      // Only include the update if there's actually something to change
      // beyond the bump. The shared fan-out already covers shared fields.
      const hasVariantChange = Object.keys(data).length > 1;
      if (!hasVariantChange) continue;

      if (typeof v.version === "number") {
        operations.push(
          prisma.word.updateMany({
            where: { id: v.id, version: v.version },
            data,
          })
        );
      } else {
        operations.push(
          prisma.word.update({
            where: { id: v.id },
            data,
          })
        );
      }
    }

    // Activity log: one entry per variant that changed (including the
    // shared-fan-out implicit change). Keeps the per-row audit trail.
    const changedIds = new Set<string>();
    if (Object.keys(sharedUpdate).length > 0) {
      existing.forEach((w) => changedIds.add(w.id));
    }
    variantInputs.forEach((v) => changedIds.add(v.id));
    for (const id of changedIds) {
      operations.push(
        prisma.activityLog.create({
          data: {
            wordId: id,
            userId: session.user.id,
            action: "edited",
            details: {
              shared: sharedUpdate,
              via: "group",
            } as Prisma.InputJsonValue,
          },
        })
      );
    }

    const results = await prisma.$transaction(operations);

    // Any updateMany that expected a version and got 0 rows = conflict.
    const conflict = results.some(
      (r) =>
        typeof r === "object" &&
        r !== null &&
        "count" in (r as Record<string, unknown>) &&
        (r as { count: number }).count === 0
    );
    if (conflict) {
      return NextResponse.json(
        {
          error:
            "One or more variants were edited elsewhere while you were saving. Reload and try again.",
          code: "version_conflict",
        },
        { status: 409 }
      );
    }
  } catch (err) {
    console.error("Grouped PATCH failed", err);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }

  const fresh = await prisma.word.findMany({
    where: { word },
    orderBy: [{ ageGroup: "asc" }, { level: "asc" }],
  });
  return NextResponse.json({ word, variants: fresh.map(transform) });
}

function transform(w: {
  id: string;
  word: string;
  ageGroup: string;
  level: number;
  category: string;
  wordLength: number;
  hints: Prisma.JsonValue;
  pronunciation: string | null;
  partOfSpeech: string | null;
  definition: string | null;
  exampleSentence: string | null;
  heartWordExplanation: string | null;
  verified: boolean;
  verifiedAt: Date | null;
  verifiedById: string | null;
  createdAt: Date;
  createdById: string | null;
  source: string | null;
  version: number;
}) {
  return {
    id: w.id,
    word: w.word,
    age_group: w.ageGroup,
    level: w.level,
    category: w.category,
    word_length: w.wordLength,
    hints: w.hints,
    pronunciation: w.pronunciation,
    part_of_speech: w.partOfSpeech,
    definition: w.definition,
    example_sentence: w.exampleSentence,
    heart_word_explanation: w.heartWordExplanation,
    verified: w.verified,
    verified_at: w.verifiedAt,
    verified_by: w.verifiedById,
    created_at: w.createdAt,
    created_by: w.createdById,
    source: w.source,
    version: w.version,
  };
}
