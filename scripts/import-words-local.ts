/**
 * One-off: imports words using an absolute path and DATABASE_URL from env.
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";

const WORD_FILE = "/Users/scottwaters/Documents/Programming/Wordnauts/Wordnauts/Wordnauts/Resources/answer_words.json";

const prisma = new PrismaClient();

async function main() {
  const data = JSON.parse(fs.readFileSync(WORD_FILE, "utf-8"));
  console.log(`Found ${data.words.length} words to import`);

  let imported = 0;
  let errors = 0;
  const batchSize = 50;

  for (let i = 0; i < data.words.length; i += batchSize) {
    const batch = data.words.slice(i, i + batchSize);
    try {
      await prisma.$transaction(
        batch.map((w: any) =>
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
              verified: w.verified ?? false,
              verifiedAt: w.verified_date ? new Date(w.verified_date) : null,
              source: "bulk_import",
            },
            update: {
              word: w.word,
              ageGroup: w.age_group,
              level: w.level,
              category: w.category,
              wordLength: w.word_length,
              hints: w.hints,
              heartWordExplanation: w.heart_word_explanation,
              verified: w.verified ?? false,
              verifiedAt: w.verified_date ? new Date(w.verified_date) : null,
            },
          })
        )
      );
      imported += batch.length;
      process.stdout.write(`\rImported: ${imported}/${data.words.length}`);
    } catch (e) {
      console.error(`\nBatch ${i / batchSize + 1} failed:`, e);
      errors += batch.length;
    }
  }

  console.log(`\nDone. imported=${imported} errors=${errors}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
