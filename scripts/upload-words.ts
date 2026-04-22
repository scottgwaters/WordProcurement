/**
 * Upload words to the deployed WordProcurement app
 *
 * Usage:
 *   1. Login to the app first at https://wordprocurement.dailey.cloud/login
 *   2. Copy your session cookie from browser DevTools
 *   3. Run: COOKIE="your-session-cookie" npx tsx scripts/upload-words.ts
 */

import * as fs from "fs";
import * as path from "path";

const API_URL = process.env.API_URL || "https://word-procurement.dailey.cloud";
const COOKIE = process.env.COOKIE;

interface WordsFile {
  version: number;
  last_updated: string;
  words: Array<{
    id: string;
    word: string;
    age_group: string;
    level: number;
    category: string;
    word_length: number;
    hints?: object;
    pronunciation?: string;
    part_of_speech?: string;
    definition?: string;
    example_sentence?: string;
    heart_word_explanation?: string;
    verified?: boolean;
    verified_date?: string;
  }>;
}

async function main() {
  if (!COOKIE) {
    console.error("Error: COOKIE environment variable is required");
    console.error("1. Login at https://wordprocurement.dailey.cloud/login");
    console.error("2. Open DevTools > Application > Cookies");
    console.error("3. Copy the 'authjs.session-token' cookie value");
    console.error("4. Run: COOKIE='authjs.session-token=xxx' npx tsx scripts/upload-words.ts");
    process.exit(1);
  }

  // Read the words file
  const wordFilePath = path.join(
    __dirname,
    "../../../Wordnauts/Wordnauts/Wordnauts/Resources/answer_words.json"
  );

  if (!fs.existsSync(wordFilePath)) {
    console.error(`Word file not found at: ${wordFilePath}`);
    process.exit(1);
  }

  console.log("Reading words from:", wordFilePath);
  const fileContent = fs.readFileSync(wordFilePath, "utf-8");
  const wordsData: WordsFile = JSON.parse(fileContent);

  console.log(`Found ${wordsData.words.length} words to upload`);

  // Upload in chunks to avoid timeout
  const chunkSize = 500;
  let totalImported = 0;
  let totalErrors = 0;

  for (let i = 0; i < wordsData.words.length; i += chunkSize) {
    const chunk = wordsData.words.slice(i, i + chunkSize);
    console.log(`Uploading chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(wordsData.words.length / chunkSize)}...`);

    // Override verified to false - words need human review
    const wordsToUpload = chunk.map((word) => ({
      ...word,
      verified: false,
    }));

    try {
      const response = await fetch(`${API_URL}/api/import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cookie": COOKIE,
        },
        body: JSON.stringify({ words: wordsToUpload }),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(`Error: ${response.status} - ${text}`);
        totalErrors += chunk.length;
        continue;
      }

      const result = await response.json();
      totalImported += result.imported || 0;
      totalErrors += result.errors || 0;
      console.log(`  Imported: ${result.imported}, Errors: ${result.errors}`);
    } catch (error) {
      console.error(`Request failed:`, error);
      totalErrors += chunk.length;
    }
  }

  console.log("\nUpload complete!");
  console.log(`  Total words: ${wordsData.words.length}`);
  console.log(`  Imported: ${totalImported}`);
  console.log(`  Errors: ${totalErrors}`);
}

main().catch(console.error);
