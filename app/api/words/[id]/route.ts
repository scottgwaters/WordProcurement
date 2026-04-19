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

  const updateData: Record<string, unknown> = {};

  if (word !== undefined) {
    updateData.word = word.toUpperCase();
    updateData.wordLength = word.length;
  }
  if (category !== undefined) updateData.category = category;
  if (age_group !== undefined) updateData.ageGroup = age_group;
  if (level !== undefined) updateData.level = level;
  if (hints !== undefined) updateData.hints = hints;
  if (definition !== undefined) updateData.definition = definition || null;
  if (example_sentence !== undefined) updateData.exampleSentence = example_sentence || null;
  if (part_of_speech !== undefined) updateData.partOfSpeech = part_of_speech || null;
  if (pronunciation !== undefined) updateData.pronunciation = pronunciation || null;
  if (heart_word_explanation !== undefined) updateData.heartWordExplanation = heart_word_explanation || null;

  const updatedWord = await prisma.word.update({
    where: { id: resolvedParams.id },
    data: updateData,
  });

  // Log activity
  await prisma.activityLog.create({
    data: {
      wordId: resolvedParams.id,
      userId: session.user.id,
      action: "edited",
      details: updateData as Prisma.InputJsonValue,
    },
  });

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
