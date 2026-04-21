import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// GET /api/words/[id] - Get a single word
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const resolvedParams = await params;

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const word = await prisma.word.findUnique({
    where: { id: resolvedParams.id },
  });

  if (!word) {
    return NextResponse.json({ error: "Word not found" }, { status: 404 });
  }

  // Transform response
  const response = {
    id: word.id,
    word: word.word,
    age_group: word.ageGroup,
    level: word.level,
    category: word.category,
    word_length: word.wordLength,
    hints: word.hints,
    pronunciation: word.pronunciation,
    part_of_speech: word.partOfSpeech,
    definition: word.definition,
    example_sentence: word.exampleSentence,
    heart_word_explanation: word.heartWordExplanation,
    verified: word.verified,
    verified_at: word.verifiedAt,
    verified_by: word.verifiedById,
    created_at: word.createdAt,
    created_by: word.createdById,
    source: word.source,
  };

  return NextResponse.json(response);
}

// Helper to compare values (handles objects like hints)
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  if (typeof a === "object" && typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

// PATCH /api/words/[id] - Update a word
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const resolvedParams = await params;

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch existing word BEFORE updating to track changes
  const existingWord = await prisma.word.findUnique({
    where: { id: resolvedParams.id },
  });

  if (!existingWord) {
    return NextResponse.json({ error: "Word not found" }, { status: 404 });
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
    source,
  } = body;

  const updateData: Record<string, unknown> = {};
  const changes: Record<string, { old: unknown; new: unknown }> = {};

  // Track changes for each field
  if (word !== undefined) {
    const newWord = word.toUpperCase();
    if (newWord !== existingWord.word) {
      changes.word = { old: existingWord.word, new: newWord };
    }
    updateData.word = newWord;
    updateData.wordLength = word.length;
  }
  if (category !== undefined) {
    if (category !== existingWord.category) {
      changes.category = { old: existingWord.category, new: category };
    }
    updateData.category = category;
  }
  if (age_group !== undefined) {
    if (age_group !== existingWord.ageGroup) {
      changes.age_group = { old: existingWord.ageGroup, new: age_group };
    }
    updateData.ageGroup = age_group;
  }
  if (level !== undefined) {
    if (level !== existingWord.level) {
      changes.level = { old: existingWord.level, new: level };
    }
    updateData.level = level;
  }
  if (hints !== undefined) {
    if (!valuesEqual(hints, existingWord.hints)) {
      changes.hints = { old: existingWord.hints, new: hints };
    }
    updateData.hints = hints;
  }
  if (definition !== undefined) {
    const newDef = definition || null;
    if (newDef !== existingWord.definition) {
      changes.definition = { old: existingWord.definition, new: newDef };
    }
    updateData.definition = newDef;
  }
  if (example_sentence !== undefined) {
    const newVal = example_sentence || null;
    if (newVal !== existingWord.exampleSentence) {
      changes.example_sentence = { old: existingWord.exampleSentence, new: newVal };
    }
    updateData.exampleSentence = newVal;
  }
  if (part_of_speech !== undefined) {
    const newVal = part_of_speech || null;
    if (newVal !== existingWord.partOfSpeech) {
      changes.part_of_speech = { old: existingWord.partOfSpeech, new: newVal };
    }
    updateData.partOfSpeech = newVal;
  }
  if (pronunciation !== undefined) {
    const newVal = pronunciation || null;
    if (newVal !== existingWord.pronunciation) {
      changes.pronunciation = { old: existingWord.pronunciation, new: newVal };
    }
    updateData.pronunciation = newVal;
  }
  if (heart_word_explanation !== undefined) {
    const newVal = heart_word_explanation || null;
    if (newVal !== existingWord.heartWordExplanation) {
      changes.heart_word_explanation = { old: existingWord.heartWordExplanation, new: newVal };
    }
    updateData.heartWordExplanation = newVal;
  }
  if (source !== undefined) {
    const newVal = source || null;
    if (newVal !== existingWord.source) {
      changes.source = { old: existingWord.source, new: newVal };
    }
    updateData.source = newVal;
  }

  const updatedWord = await prisma.word.update({
    where: { id: resolvedParams.id },
    data: updateData,
  });

  // Only log activity if there were actual changes
  if (Object.keys(changes).length > 0) {
    await prisma.activityLog.create({
      data: {
        wordId: resolvedParams.id,
        userId: session.user.id,
        action: "edited",
        details: { changes } as Prisma.InputJsonValue,
      },
    });
  }

  // Transform response
  const response = {
    id: updatedWord.id,
    word: updatedWord.word,
    age_group: updatedWord.ageGroup,
    level: updatedWord.level,
    category: updatedWord.category,
    word_length: updatedWord.wordLength,
    hints: updatedWord.hints,
    pronunciation: updatedWord.pronunciation,
    part_of_speech: updatedWord.partOfSpeech,
    definition: updatedWord.definition,
    example_sentence: updatedWord.exampleSentence,
    heart_word_explanation: updatedWord.heartWordExplanation,
    verified: updatedWord.verified,
    verified_at: updatedWord.verifiedAt,
    verified_by: updatedWord.verifiedById,
    created_at: updatedWord.createdAt,
    created_by: updatedWord.createdById,
    source: updatedWord.source,
  };

  return NextResponse.json(response);
}
