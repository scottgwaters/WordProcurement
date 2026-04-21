import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/words/[id]/activity - Get activity history for a specific word
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const resolvedParams = await params;

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const activities = await prisma.activityLog.findMany({
    where: { wordId: resolvedParams.id },
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: { email: true },
      },
    },
  });

  // Transform to include user email
  const response = activities.map((a) => ({
    id: a.id,
    word_id: a.wordId,
    user_id: a.userId,
    user_email: a.user?.email || null,
    action: a.action,
    details: a.details,
    created_at: a.createdAt,
  }));

  return NextResponse.json(response);
}
