import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// GET /api/activity - Get activity with filters and pagination
export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get("limit") || "10");
  const page = parseInt(searchParams.get("page") || "1");
  const wordId = searchParams.get("wordId");
  const action = searchParams.get("action");
  const userId = searchParams.get("userId");

  // Build where clause
  const where: Prisma.ActivityLogWhereInput = {};
  if (wordId) where.wordId = wordId;
  if (action) where.action = action;
  if (userId) where.userId = userId;

  // Get total count for pagination
  const total = await prisma.activityLog.count({ where });

  const activities = await prisma.activityLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: (page - 1) * limit,
    include: {
      word: {
        select: { word: true },
      },
      user: {
        select: { email: true },
      },
    },
  });

  // Transform to include user email
  const items = activities.map((a) => ({
    id: a.id,
    word_id: a.wordId,
    user_id: a.userId,
    user_email: a.user?.email || null,
    action: a.action,
    details: a.details,
    created_at: a.createdAt,
    words: a.word ? { word: a.word.word } : null,
  }));

  return NextResponse.json({
    items,
    pagination: {
      page,
      pageSize: limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
