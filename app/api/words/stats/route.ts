import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/words/stats - Get word statistics
export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [totalWords, verifiedWords, categoryStats] = await Promise.all([
    prisma.word.count(),
    prisma.word.count({ where: { verified: true } }),
    prisma.word.groupBy({
      by: ["category"],
      _count: { category: true },
    }),
  ]);

  const categoryCounts: Record<string, number> = {};
  categoryStats.forEach((stat) => {
    categoryCounts[stat.category] = stat._count.category;
  });

  return NextResponse.json({
    totalWords,
    verifiedWords,
    unverifiedWords: totalWords - verifiedWords,
    categoryCounts,
  });
}
