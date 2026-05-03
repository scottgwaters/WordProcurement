import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

interface WordEntry {
  id: string;
  word: string;
  age_group: string;
  grade_level?: string;
  level: number;
  category: string;
  word_length: number;
  hints?: {
    easy?: string;
    medium?: string;
    hard?: string;
  };
  pronunciation?: string;
  pronunciation_arpabet?: string;
  pronunciation_respelling?: string;
  part_of_speech?: string;
  definition?: string;
  example_sentence?: string;
  heart_word_explanation?: string;
  verified?: boolean;
  verified_date?: string;
}

export async function POST(request: NextRequest) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  // Mirror middleware.ts: accept either IMPORT_API_TOKEN or WP_IMPORT_TOKEN.
  // Both names are valid bearer tokens; checking only one created a silent-401
  // when the curator's local WP_IMPORT_TOKEN matched the server's WP_IMPORT_TOKEN
  // but not its IMPORT_API_TOKEN.
  const expectedTokens = [process.env.IMPORT_API_TOKEN, process.env.WP_IMPORT_TOKEN]
    .filter((t): t is string => typeof t === "string" && t.length > 0);
  const tokenOk = !!bearer && expectedTokens.some((t) => t === bearer);

  if (!tokenOk) {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
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
                gradeLevel: w.grade_level ?? null,
                level: w.level,
                category: w.category,
                wordLength: w.word_length,
                hints: w.hints ? (w.hints as Prisma.InputJsonValue) : Prisma.JsonNull,
                pronunciation: w.pronunciation || null,
                pronunciationArpabet: w.pronunciation_arpabet || null,
                pronunciationRespelling: w.pronunciation_respelling || null,
                partOfSpeech: w.part_of_speech || null,
                definition: w.definition || null,
                exampleSentence: w.example_sentence || null,
                heartWordExplanation: w.heart_word_explanation || null,
                verified: w.verified || false,
                verifiedAt: w.verified_date ? new Date(w.verified_date) : null,
                source: "bulk_import",
              },
              // Content-only update. Review status fields — `verified`,
              // `verifiedAt`, `declined`, `declinedAt` — are deliberately
              // NOT touched on existing rows so bulk imports don't clobber
              // manual approvals or declines made through the review UI.
              // Use /api/words/[id]/verify or /api/words/[id]/decline to
              // change those states.
              update: {
                word: w.word.toUpperCase(),
                ageGroup: w.age_group,
                ...(w.grade_level !== undefined && { gradeLevel: w.grade_level }),
                level: w.level,
                category: w.category,
                wordLength: w.word_length,
                hints: w.hints ? (w.hints as Prisma.InputJsonValue) : Prisma.JsonNull,
                pronunciation: w.pronunciation || null,
                pronunciationArpabet: w.pronunciation_arpabet || null,
                pronunciationRespelling: w.pronunciation_respelling || null,
                partOfSpeech: w.part_of_speech || null,
                definition: w.definition || null,
                exampleSentence: w.example_sentence || null,
                heartWordExplanation: w.heart_word_explanation || null,
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
