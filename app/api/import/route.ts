import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface WordEntry {
  id: string;
  word: string;
  age_group: string;
  level: number;
  category: string;
  word_length: number;
  hints?: {
    easy?: string;
    medium?: string;
    hard?: string;
  };
  pronunciation?: string;
  part_of_speech?: string;
  definition?: string;
  example_sentence?: string;
  heart_word_explanation?: string;
  verified?: boolean;
  verified_date?: string;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const words: WordEntry[] = body.words;

    if (!Array.isArray(words)) {
      return NextResponse.json(
        { error: "Invalid format: expected { words: [...] }" },
        { status: 400 }
      );
    }

    let imported = 0;
    let errors = 0;
    const batchSize = 50;

    for (let i = 0; i < words.length; i += batchSize) {
      const batch = words.slice(i, i + batchSize);

      try {
        await prisma.$transaction(
          batch.map((w) =>
            prisma.word.upsert({
              where: { id: w.id },
              create: {
                id: w.id,
                word: w.word.toUpperCase(),
                ageGroup: w.age_group,
                level: w.level,
                category: w.category,
                wordLength: w.word_length,
                hints: w.hints || null,
                pronunciation: w.pronunciation || null,
                partOfSpeech: w.part_of_speech || null,
                definition: w.definition || null,
                exampleSentence: w.example_sentence || null,
                heartWordExplanation: w.heart_word_explanation || null,
                verified: w.verified || false,
                verifiedAt: w.verified_date ? new Date(w.verified_date) : null,
                source: "bulk_import",
              },
              update: {
                word: w.word.toUpperCase(),
                ageGroup: w.age_group,
                level: w.level,
                category: w.category,
                wordLength: w.word_length,
                hints: w.hints || null,
                pronunciation: w.pronunciation || null,
                partOfSpeech: w.part_of_speech || null,
                definition: w.definition || null,
                exampleSentence: w.example_sentence || null,
                heartWordExplanation: w.heart_word_explanation || null,
                verified: w.verified || false,
                verifiedAt: w.verified_date ? new Date(w.verified_date) : null,
              },
            })
          )
        );
        imported += batch.length;
      } catch (error) {
        console.error(`Error importing batch:`, error);
        errors += batch.length;
      }
    }

    return NextResponse.json({
      success: true,
      total: words.length,
      imported,
      errors,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: "Import failed" },
      { status: 500 }
    );
  }
}
