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
    grade_level: word.gradeLevel,
    level: word.level,
    category: word.category,
    word_length: word.wordLength,
    hints: word.hints,
    pronunciation: word.pronunciation,
    pronunciation_arpabet: word.pronunciationArpabet,
    pronunciation_respelling: word.pronunciationRespelling,
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
    declined: word.declined,
    declined_at: word.declinedAt,
    // Optimistic concurrency token — clients echo this on PATCH so two
    // reviewers editing the same word can't silently overwrite each other.
    version: word.version,
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
    source,
    version: expectedVersion,
  } = body;

  // Optimistic concurrency check — if the client read version N but the
  // row is now at N+1, someone else already saved. Bail out with a 409 so
  // the client can surface a conflict UI instead of blindly overwriting.
  if (
    typeof expectedVersion === "number" &&
    expectedVersion !== existingWord.version
  ) {
    return NextResponse.json(
      {
        error: "This word was edited by someone else while you were making changes",
        code: "version_conflict",
        currentVersion: existingWord.version,
        currentWord: {
          id: existingWord.id,
          word: existingWord.word,
          age_group: existingWord.ageGroup,
          grade_level: existingWord.gradeLevel,
          level: existingWord.level,
          category: existingWord.category,
          hints: existingWord.hints,
          pronunciation: existingWord.pronunciation,
          pronunciation_arpabet: existingWord.pronunciationArpabet,
          pronunciation_respelling: existingWord.pronunciationRespelling,
          part_of_speech: existingWord.partOfSpeech,
          definition: existingWord.definition,
          example_sentence: existingWord.exampleSentence,
          heart_word_explanation: existingWord.heartWordExplanation,
          source: existingWord.source,
          version: existingWord.version,
        },
      },
      { status: 409 }
    );
  }

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
  if (grade_level !== undefined) {
    const newGrade = grade_level ?? null;
    if (newGrade !== existingWord.gradeLevel) {
      changes.grade_level = { old: existingWord.gradeLevel, new: newGrade };
    }
    updateData.gradeLevel = newGrade;
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
  if (pronunciation_arpabet !== undefined) {
    const newVal = pronunciation_arpabet || null;
    if (newVal !== existingWord.pronunciationArpabet) {
      changes.pronunciation_arpabet = { old: existingWord.pronunciationArpabet, new: newVal };
    }
    updateData.pronunciationArpabet = newVal;
  }
  if (pronunciation_respelling !== undefined) {
    const newVal = pronunciation_respelling || null;
    if (newVal !== existingWord.pronunciationRespelling) {
      changes.pronunciation_respelling = { old: existingWord.pronunciationRespelling, new: newVal };
    }
    updateData.pronunciationRespelling = newVal;
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

  // Bump version atomically against the read value. If another writer
  // sneaks in between the pre-fetch above and this update (race window
  // is tiny but possible), updateMany returns 0 rows and we 409.
  const updateResult = await prisma.word.updateMany({
    where: {
      id: resolvedParams.id,
      version: existingWord.version,
    },
    data: {
      ...updateData,
      version: { increment: 1 },
    },
  });

  if (updateResult.count === 0) {
    return NextResponse.json(
      {
        error: "This word was edited by someone else while you were saving",
        code: "version_conflict",
      },
      { status: 409 }
    );
  }

  const updatedWord = await prisma.word.findUnique({
    where: { id: resolvedParams.id },
  });
  if (!updatedWord) {
    return NextResponse.json({ error: "Word disappeared" }, { status: 404 });
  }

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
    version: updatedWord.version,
  };

  return NextResponse.json(response);
}

// DELETE /api/words/[id] - Hard-delete a word.
//
// Distinct from "decline": decline is a soft-delete that survives re-imports
// and stays auditable. Delete is for unambiguous mistakes — duplicate rows
// for the same spelling at the same grade, junk seeds, etc. The cascading
// FKs on WordLease and ActivityLog clean those up automatically, so the
// row goes away entirely.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const resolvedParams = await params;

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await prisma.word.findUnique({
    where: { id: resolvedParams.id },
    select: { id: true, word: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Word not found" }, { status: 404 });
  }

  await prisma.word.delete({ where: { id: resolvedParams.id } });

  return NextResponse.json({ success: true, deleted: existing.word });
}
