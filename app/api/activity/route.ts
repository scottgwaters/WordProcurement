import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/activity - Get recent activity
export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get("limit") || "10");

  const activities = await prisma.activityLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      word: {
        select: { word: true },
      },
    },
  });

  // Transform to match expected format
  const response = activities.map((a) => ({
    id: a.id,
    word_id: a.wordId,
    user_id: a.userId,
    action: a.action,
    details: a.details,
    created_at: a.createdAt,
    words: a.word ? { word: a.word.word } : null,
  }));

  return NextResponse.json(response);
}
