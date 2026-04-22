import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Category groups by world — mirrors lib/worlds.ts. When the caller filters
// by `world`, translate to the set of categories that route to that world.
const CATEGORIES_BY_WORLD: Record<string, string[]> = {
  sight:    ["sight_words", "heart_words"],
  animals:  ["animals", "family", "people"],
  food:     ["food", "body"],
  nature:   ["nature", "weather", "sports"],
  space:    ["space", "science"],
  objects:  ["objects", "clothing", "transport", "home"],
  magic:    ["concepts", "adventure", "music_arts", "magic"],
  feelings: ["feelings"],
};

// GET /api/words - List words with optional filters
export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const category = searchParams.get("category");
  const world = searchParams.get("world");
  const ageGroup = searchParams.get("ageGroup");
  const level = searchParams.get("level");
  const verified = searchParams.get("verified");
  const search = searchParams.get("search");
  const page = parseInt(searchParams.get("page") || "0");
  const pageSize = parseInt(searchParams.get("pageSize") || "50");

  const where: {
    category?: string | { in: string[] };
    ageGroup?: string;
    level?: number;
    verified?: boolean;
    word?: { contains: string };
  } = {};

  if (world && CATEGORIES_BY_WORLD[world]) {
    where.category = { in: CATEGORIES_BY_WORLD[world] };
  } else if (category) {
    where.category = category;
  }
  if (ageGroup) where.ageGroup = ageGroup;
  if (level) where.level = parseInt(level);
  if (verified !== null) where.verified = verified === "true";
  if (search) where.word = { contains: search };

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
    level,
    hints,
    definition,
    example_sentence,
    part_of_speech,
    pronunciation,
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
      level,
      wordLength: word.length,
      hints: hints || null,
      definition: definition || null,
      exampleSentence: example_sentence || null,
      partOfSpeech: part_of_speech || null,
      pronunciation: pronunciation || null,
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
    level: newWord.level,
    category: newWord.category,
    word_length: newWord.wordLength,
    hints: newWord.hints,
    pronunciation: newWord.pronunciation,
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
