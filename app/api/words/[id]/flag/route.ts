import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/*
  Flag a word for another reviewer's attention. Not a verification action —
  flagged words remain in "pending" review status but are surfaced so a second
  pair of eyes can look at them before approving.

  We use the activity_log for persistence instead of a dedicated column so this
  ships without a schema migration. A word is "currently flagged" if the most
  recent row in activity_log for that word with action in ('flagged', 'unflagged')
  has action='flagged'.
*/
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const resolvedParams = await params;

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const flagged: boolean = body.flagged !== false; // default true
  const reason: string | undefined = typeof body.reason === "string" && body.reason.length > 0
    ? body.reason
    : undefined;

  // Ensure the word exists before logging
  const word = await prisma.word.findUnique({ where: { id: resolvedParams.id } });
  if (!word) {
    return NextResponse.json({ error: "Word not found" }, { status: 404 });
  }

  await prisma.activityLog.create({
    data: {
      wordId: resolvedParams.id,
      userId: session.user.id,
      action: flagged ? "flagged" : "unflagged",
      details: reason ? { reason } : undefined,
    },
  });

  return NextResponse.json({ ok: true, flagged });
}
