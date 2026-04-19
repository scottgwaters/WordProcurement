import Anthropic from "@anthropic-ai/sdk";
import type { GeneratedHints, AgeGroup } from "./types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function generateHints(
  word: string,
  category: string,
  ageGroup: AgeGroup
): Promise<GeneratedHints> {
  const ageDescription = {
    "4-6": "4-6 year olds (kindergarten to 1st grade)",
    "7-9": "7-9 year olds (2nd to 4th grade)",
    "10-12": "10-12 year olds (5th to 7th grade)",
  }[ageGroup];

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `Generate hints for the word "${word}" (category: ${category}) for a kids word-guessing game aimed at ${ageDescription}.

Provide:
1. Three hints at different difficulty levels (easy, medium, hard) that help kids guess the word
2. A simple, kid-friendly definition
3. An example sentence using the word
4. The part of speech (noun, verb, adjective, etc.)

Important guidelines:
- Easy hint: Very direct, often includes visual or sensory descriptions a young child would understand
- Medium hint: Moderately helpful, gives context without being too obvious
- Hard hint: More subtle, may use synonyms or indirect references
- All hints should be age-appropriate and educational
- Do not include the word itself in any hint
- Definition should be simple enough for the target age group

Respond with ONLY valid JSON in this exact format:
{
  "hints": {
    "easy": "easy hint here",
    "medium": "medium hint here",
    "hard": "hard hint here"
  },
  "definition": "simple definition here",
  "example_sentence": "example sentence here",
  "part_of_speech": "noun/verb/adjective/etc"
}`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  try {
    // Parse the JSON response
    const parsed = JSON.parse(content.text) as GeneratedHints;
    return parsed;
  } catch {
    throw new Error(`Failed to parse Claude response: ${content.text}`);
  }
}
