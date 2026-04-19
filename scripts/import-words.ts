/**
 * Import script for existing words from Wordnauts iOS app
 *
 * Usage:
 *   npx tsx scripts/import-words.ts
 *
 * Environment variables required:
 *   DATABASE_URL
 *
 * This script reads the answer_words.json file from the iOS app
 * and imports all words into the MySQL database.
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

// Load environment variables
import { config } from "dotenv";
config({ path: ".env.local" });

const prisma = new PrismaClient();

interface WordEntry {
  id: string;
  word: string;
  age_group: "4-6" | "7-9" | "10-12";
  level: 1 | 2 | 3;
  category: string;
  word_length: number;
  heart_word_explanation: string | null;
  language: string;
  hints: {
    easy: string;
    medium: string;
    hard: string;
  };
  verified: boolean;
  verified_date: string | null;
}

interface WordsFile {
  version: number;
  last_updated: string;
  words: WordEntry[];
}

async function main() {
  // Path to the iOS app's word file
  const wordFilePath = path.join(
    __dirname,
    "../../../Wordnauts/Wordnauts/Resources/answer_words.json"
  );

  if (!fs.existsSync(wordFilePath)) {
    console.error(`Word file not found at: ${wordFilePath}`);
    console.error("Make sure the Wordnauts iOS app is in the same directory.");
    process.exit(1);
  }

  console.log("Reading words from:", wordFilePath);
  const fileContent = fs.readFileSync(wordFilePath, "utf-8");
  const wordsData: WordsFile = JSON.parse(fileContent);

  console.log(`Found ${wordsData.words.length} words to import`);

  // Import words using upsert
  let imported = 0;
  let errors = 0;
  const batchSize = 50;

  for (let i = 0; i < wordsData.words.length; i += batchSize) {
    const batch = wordsData.words.slice(i, i + batchSize);

    try {
      await prisma.$transaction(
        batch.map((w) =>
          prisma.word.upsert({
            where: { id: w.id },
            create: {
              id: w.id,
              word: w.word,
              ageGroup: w.age_group,
              level: w.level,
              category: w.category,
              wordLength: w.word_length,
              hints: w.hints,
              heartWordExplanation: w.heart_word_explanation,
              verified: w.verified,
              verifiedAt: w.verified_date ? new Date(w.verified_date) : null,
              source: "initial_import",
            },
            update: {
              word: w.word,
              ageGroup: w.age_group,
              level: w.level,
              category: w.category,
              wordLength: w.word_length,
              hints: w.hints,
              heartWordExplanation: w.heart_word_explanation,
              verified: w.verified,
              verifiedAt: w.verified_date ? new Date(w.verified_date) : null,
            },
          })
        )
      );

      imported += batch.length;
      process.stdout.write(
        `\rImported: ${imported}/${wordsData.words.length} words...`
      );
    } catch (error) {
      console.error(`\nError importing batch ${i / batchSize + 1}:`, error);
      errors += batch.length;
    }
  }

  console.log("\n");
  console.log("Import complete!");
  console.log(`  Total words: ${wordsData.words.length}`);
  console.log(`  Imported: ${imported}`);
  console.log(`  Errors: ${errors}`);
}

main()
  .catch((error) => {
    console.error("Import failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
