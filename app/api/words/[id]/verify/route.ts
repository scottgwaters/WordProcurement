import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const resolvedParams = await params;

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { verified } = body;

  if (typeof verified !== "boolean") {
    return NextResponse.json(
      { error: "Missing required field: verified (boolean)" },
      { status: 400 }
    );
  }

  // Verifying a word also clears any declined state — changing a previous
  // decline to an approve should move the row fully into the verified pool
  // in one click, not leave it stuck as "declined AND verified".
  const updatedWord = await prisma.word.update({
    where: { id: resolvedParams.id },
    data: {
      verified,
      verifiedAt: verified ? new Date() : null,
      verifiedById: verified ? session.user.id : null,
      ...(verified ? { declined: false, declinedAt: null } : {}),
    },
  });

  // Log activity
  await prisma.activityLog.create({
    data: {
      wordId: resolvedParams.id,
      userId: session.user.id,
      action: verified ? "verified" : "rejected",
    },
  });

  // Transform response
  const response = {
    id: updatedWord.id,
    word: updatedWord.word,
    age_group: updatedWord.ageGroup,
    grade_level: updatedWord.gradeLevel,
    level: updatedWord.level,
    category: updatedWord.category,
    word_length: updatedWord.wordLength,
    hints: updatedWord.hints,
    pronunciation: updatedWord.pronunciation,
    pronunciation_arpabet: updatedWord.pronunciationArpabet,
    pronunciation_respelling: updatedWord.pronunciationRespelling,
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
