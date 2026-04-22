import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CATEGORIES_BY_WORLD, type WorldId } from "@/lib/worlds";

// GET /api/words/stats — word statistics.
//
// Query params (all optional):
//   ageGroup   — restrict per-world counts to a single age group
//   byWorld    — "1" to include countsByWorld in the response
//   today      — "1" to include verifiedToday (words marked verified since local-midnight UTC)
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const ageGroup = searchParams.get("ageGroup") || undefined;
  const byWorld = searchParams.get("byWorld") === "1";
  const wantToday = searchParams.get("today") === "1";

  // Exclude declined words from every count — they're soft-deleted, so
  // counting them would inflate "total" and mislead the progress bar.
  const [totalWords, verifiedWords, declinedWords, categoryStats] = await Promise.all([
    prisma.word.count({ where: { declined: false } }),
    prisma.word.count({ where: { verified: true, declined: false } }),
    prisma.word.count({ where: { declined: true } }),
    prisma.word.groupBy({
      by: ["category"],
      _count: { category: true },
      where: {
        declined: false,
        ...(ageGroup ? { ageGroup } : {}),
      },
    }),
  ]);

  const categoryCounts: Record<string, number> = {};
  categoryStats.forEach((stat) => {
    categoryCounts[stat.category] = stat._count.category;
  });

  // Per-world counts — sum the category counts that map into each world.
  // Cheaper than a separate groupBy because we already have categoryStats.
  let countsByWorld: Record<WorldId, number> | undefined;
  if (byWorld) {
    countsByWorld = {
      animals: 0,
      food: 0,
      nature: 0,
      space: 0,
      objects: 0,
      magic: 0,
      sight: 0,
      feelings: 0,
    };
    for (const [worldId, cats] of Object.entries(CATEGORIES_BY_WORLD) as [
      WorldId,
      string[],
    ][]) {
      for (const cat of cats) {
        countsByWorld[worldId] += categoryCounts[cat] ?? 0;
      }
    }
  }

  // "Today" = server local-day boundary. Good enough for a progress signal;
  // we're not trying to match any specific user's timezone.
  let verifiedToday: number | undefined;
  if (wantToday) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    verifiedToday = await prisma.word.count({
      where: { verified: true, verifiedAt: { gte: startOfDay } },
    });
  }

  return NextResponse.json({
    totalWords,
    verifiedWords,
    unverifiedWords: totalWords - verifiedWords,
    declinedWords,
    categoryCounts,
    ...(countsByWorld ? { countsByWorld } : {}),
    ...(verifiedToday !== undefined ? { verifiedToday } : {}),
  });
}
