import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/words/duplicates?word=DRAGON&excludeId=<id>
//
// Returns every other word row with the same spelling (case-insensitive)
// so the reviewer can see e.g. "DRAGON also exists in ages 10-12 / magic
// category". Used to surface cross-tier inconsistencies when editing.
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const word = (searchParams.get("word") || "").trim();
  const excludeId = searchParams.get("excludeId") || undefined;

  if (!word) {
    return NextResponse.json({ duplicates: [] });
  }

  const duplicates = await prisma.word.findMany({
    where: {
      word: { equals: word },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: {
      id: true,
      word: true,
      ageGroup: true,
      gradeLevel: true,
      level: true,
      category: true,
      verified: true,
    },
    orderBy: [{ gradeLevel: "asc" }, { level: "asc" }],
  });

  return NextResponse.json({ duplicates });
}
