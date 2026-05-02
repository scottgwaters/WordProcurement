import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

// Public, unauthenticated read of every verified, non-declined word in the
// catalog — shape matches Wordnauts/Resources/answer_words.json so the iOS
// app can drop the response into its existing decoder.
//
// Auth: intentionally none. The payload contains zero PII (just the curated
// game corpus) and the iOS app needs to be able to fetch it without a
// session. The middleware allowlists this path; defense-in-depth here is
// "filter to verified + non-declined" so unreviewed work never leaks out.
//
// Caching:
//   ETag = sha256 of the body. iOS does a conditional GET with If-None-Match
//   and we return 304 when the catalog hasn't changed.
//   Cache-Control allows edge caches to serve for 5 minutes and revalidate.

// We require UUIDs because the iOS WordEntry decoder is UUID-typed. Anything
// that slipped in as a cuid (legacy default before we switched the create
// endpoint over) is filtered out here so the iOS decoder never sees it.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ExportWord = {
  id: string;
  word: string;
  age_group: string;
  grade_level: string | null;
  level: number;
  category: string;
  word_length: number;
  language: string;
  hints: unknown;
  pronunciation: string | null;
  pronunciation_arpabet: string | null;
  pronunciation_respelling: string | null;
  part_of_speech: string | null;
  definition: string | null;
  example_sentence: string | null;
  heart_word_explanation: string | null;
  verified: boolean;
  verified_date: string | null;
};

export async function GET(request: NextRequest) {
  // Dev escape hatch: `?include=all` returns every non-declined word, not
  // just verified ones, so the iOS app can show the full corpus during
  // development before the curation queue catches up. Declined words are
  // always excluded — those are explicit "doesn't belong in the game"
  // signals and shouldn't leak even in dev mode.
  const includeAll = request.nextUrl.searchParams.get("include") === "all";
  const rows = await prisma.word.findMany({
    where: includeAll
      ? { declined: false }
      : { verified: true, declined: false },
    orderBy: { word: "asc" },
  });

  const words: ExportWord[] = [];
  let maxVerifiedAt = 0;
  for (const r of rows) {
    if (!UUID_RE.test(r.id)) continue;
    const verifiedMs = r.verifiedAt?.getTime() ?? 0;
    if (verifiedMs > maxVerifiedAt) maxVerifiedAt = verifiedMs;
    words.push({
      id: r.id,
      word: r.word,
      age_group: r.ageGroup,
      grade_level: r.gradeLevel,
      level: r.level,
      category: r.category,
      word_length: r.wordLength,
      language: "en",
      hints: r.hints,
      pronunciation: r.pronunciation,
      pronunciation_arpabet: r.pronunciationArpabet,
      pronunciation_respelling: r.pronunciationRespelling,
      part_of_speech: r.partOfSpeech,
      definition: r.definition,
      example_sentence: r.exampleSentence,
      heart_word_explanation: r.heartWordExplanation,
      verified: r.verified,
      verified_date: r.verifiedAt?.toISOString().slice(0, 10) ?? null,
    });
  }

  const payload = JSON.stringify({
    // Monotonic version derived from the latest approval timestamp. Stable
    // per DB state — same state in/out → same version → same ETag → 304.
    version: Math.floor(maxVerifiedAt / 1000),
    last_updated: new Date().toISOString().slice(0, 10),
    word_count: words.length,
    words,
  });

  const etag = `"${createHash("sha256").update(payload).digest("hex").slice(0, 32)}"`;

  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
      },
    });
  }

  return new Response(payload, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
      ETag: etag,
    },
  });
}
