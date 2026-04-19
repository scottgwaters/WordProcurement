import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateHints } from "@/lib/claude";
import type { AgeGroup } from "@/lib/types";

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { word, category, ageGroup } = body;

  if (!word || !category || !ageGroup) {
    return NextResponse.json(
      { error: "Missing required fields: word, category, ageGroup" },
      { status: 400 }
    );
  }

  // Validate age group
  if (!["4-6", "7-9", "10-12"].includes(ageGroup)) {
    return NextResponse.json(
      { error: "Invalid age group. Must be 4-6, 7-9, or 10-12" },
      { status: 400 }
    );
  }

  try {
    const hints = await generateHints(word, category, ageGroup as AgeGroup);
    return NextResponse.json(hints);
  } catch (error) {
    console.error("Error generating hints:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to generate hints",
      },
      { status: 500 }
    );
  }
}
