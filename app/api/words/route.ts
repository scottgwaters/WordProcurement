import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CATEGORIES_BY_WORLD, type WorldId } from "@/lib/worlds";

// GET /api/words - List words with optional filters
export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const world = searchParams.get("world");
  const ageGroup = searchParams.get("ageGroup");
  const gradeLevel = searchParams.get("gradeLevel");
  const ungraded = searchParams.get("ungraded") === "true";
  const level = searchParams.get("level");
  const verified = searchParams.get("verified");
  const flagged = searchParams.get("flagged");
  const declined = searchParams.get("declined");
  const search = searchParams.get("search");
  const excludeLeased = searchParams.get("excludeLeased") === "1";
  const page = parseInt(searchParams.get("page") || "0");
  const pageSize = parseInt(searchParams.get("pageSize") || "50");

  // Flag state is derived from activity_log, not a column. Build a map of
  // wordId → flagged (boolean) by scanning the flag/unflag history newest
  // first; the first row seen for each wordId is its current state. Scoped
  // to a single list endpoint so volume stays bounded.
  const flagRows = await prisma.activityLog.findMany({
    where: { action: { in: ["flagged", "unflagged"] } },
    orderBy: { createdAt: "desc" },
    select: { wordId: true, action: true },
  });
  const flaggedIds = new Set<string>();
  const seenFlag = new Set<string>();
  for (const row of flagRows) {
    if (seenFlag.has(row.wordId)) continue;
    seenFlag.add(row.wordId);
    if (row.action === "flagged") flaggedIds.add(row.wordId);
  }

  const where: {
    category?: string | { in: string[] };
    ageGroup?: string;
    gradeLevel?: string | null;
    level?: number;
    verified?: boolean;
    declined?: boolean;
    word?: { contains: string };
    id?: { in?: string[]; notIn?: string[] };
  } = {};

  if (world && world in CATEGORIES_BY_WORLD) {
    where.category = { in: CATEGORIES_BY_WORLD[world as WorldId] };
  }
  if (ageGroup) where.ageGroup = ageGroup;
  if (ungraded) {
    where.gradeLevel = null;
  } else if (gradeLevel) {
    where.gradeLevel = gradeLevel;
  }
  if (level) where.level = parseInt(level);
  if (verified !== null) where.verified = verified === "true";
  if (search) where.word = { contains: search };

  // Declined words are hidden by default so the normal review/listing
  // workflows don't surface them again. Pass declined=true to see the
  // declined pool (for un-declining), or declined=all to show everything.
  if (declined === "true") {
    where.declined = true;
  } else if (declined !== "all") {
    where.declined = false;
  }

  // When the caller asks for flagged-only, restrict to the set we just built.
  if (flagged === "true") {
    const ids = Array.from(flaggedIds);
    where.id = ids.length > 0 ? { in: ids } : { in: ["__none__"] };
  }

  // Soft-lock filter: when the caller asks (e.g. the review queue),
  // exclude words that another reviewer is currently editing so two
  // people don't land on the same word. Our own leases pass through.
  if (excludeLeased) {
    const otherLeases = await prisma.wordLease.findMany({
      where: {
        expiresAt: { gt: new Date() },
        NOT: { userId: session.user.id },
      },
      select: { wordId: true },
    });
    if (otherLeases.length > 0) {
      where.id = { ...(where.id ?? {}), notIn: otherLeases.map((l) => l.wordId) };
    }
  }

  const [words, total] = await Promise.all([
    prisma.word.findMany({
      where,
      orderBy: { word: "asc" },
      skip: page * pageSize,
      take: pageSize,
    }),
    prisma.word.count({ where }),
  ]);

  // Transform to match expected field names (snake_case for frontend)
  const transformedWords = words.map((w) => ({
    id: w.id,
    word: w.word,
    age_group: w.ageGroup,
    grade_level: w.gradeLevel,
    level: w.level,
    category: w.category,
    word_length: w.wordLength,
    hints: w.hints,
    pronunciation: w.pronunciation,
    pronunciation_arpabet: w.pronunciationArpabet,
    pronunciation_respelling: w.pronunciationRespelling,
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
    flagged: flaggedIds.has(w.id),
    declined: w.declined,
  }));

  return NextResponse.json({
    words: transformedWords,
    total,
    page,
    pageSize,
  });
}

// POST /api/words - Create a new word
export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    word,
    category,
    age_group,
    grade_level,
    level,
    hints,
    definition,
    example_sentence,
    part_of_speech,
    pronunciation,
    pronunciation_arpabet,
    pronunciation_respelling,
    heart_word_explanation,
  } = body;

  if (!word || !category || !age_group || !level) {
    return NextResponse.json(
      { error: "Missing required fields: word, category, age_group, level" },
      { status: 400 }
    );
  }

  const newWord = await prisma.word.create({
    data: {
      word: word.toUpperCase(),
      category,
      ageGroup: age_group,
      gradeLevel: grade_level ?? null,
      level,
      wordLength: word.length,
      hints: hints || null,
      definition: definition || null,
      exampleSentence: example_sentence || null,
      partOfSpeech: part_of_speech || null,
      pronunciation: pronunciation || null,
      pronunciationArpabet: pronunciation_arpabet || null,
      pronunciationRespelling: pronunciation_respelling || null,
      heartWordExplanation: heart_word_explanation || null,
      verified: false,
      createdById: session.user.id,
    },
  });

  // Log activity
  await prisma.activityLog.create({
    data: {
      wordId: newWord.id,
      userId: session.user.id,
      action: "created",
    },
  });

  // Transform response
  const response = {
    id: newWord.id,
    word: newWord.word,
    age_group: newWord.ageGroup,
    grade_level: newWord.gradeLevel,
    level: newWord.level,
    category: newWord.category,
    word_length: newWord.wordLength,
    hints: newWord.hints,
    pronunciation: newWord.pronunciation,
    pronunciation_arpabet: newWord.pronunciationArpabet,
    pronunciation_respelling: newWord.pronunciationRespelling,
    part_of_speech: newWord.partOfSpeech,
    definition: newWord.definition,
    example_sentence: newWord.exampleSentence,
    heart_word_explanation: newWord.heartWordExplanation,
    verified: newWord.verified,
    verified_at: newWord.verifiedAt,
    verified_by: newWord.verifiedById,
    created_at: newWord.createdAt,
    created_by: newWord.createdById,
    source: newWord.source,
  };

  return NextResponse.json(response, { status: 201 });
}
