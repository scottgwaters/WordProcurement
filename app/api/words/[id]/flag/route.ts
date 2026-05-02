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

// GET — return the most recent flag's reasons + note so the reviewer can see
// what was previously flagged before deciding to update or remove the flag.
// Returns { flagged: false } when the word's current state is unflagged.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const latest = await prisma.activityLog.findFirst({
    where: { wordId: id, action: { in: ["flagged", "unflagged"] } },
    orderBy: { createdAt: "desc" },
    select: { action: true, details: true, createdAt: true, userId: true },
  });
  if (!latest || latest.action !== "flagged") {
    return NextResponse.json({ flagged: false });
  }
  const details = (latest.details ?? {}) as { reasons?: unknown; note?: unknown };
  const reasons = Array.isArray(details.reasons)
    ? details.reasons.filter((r): r is string => typeof r === "string")
    : [];
  const note = typeof details.note === "string" ? details.note : "";
  return NextResponse.json({
    flagged: true,
    reasons,
    note,
    flagged_at: latest.createdAt,
    flagged_by: latest.userId,
  });
}

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

  // New shape: { reasons: string[], note?: string }. Legacy shape: { reason?: string }.
  const ALLOWED_REASONS = new Set(["image", "word_details"]);
  const reasons: string[] = Array.isArray(body.reasons)
    ? body.reasons.filter((r: unknown): r is string => typeof r === "string" && ALLOWED_REASONS.has(r))
    : [];
  const note: string | undefined =
    typeof body.note === "string" && body.note.trim().length > 0
      ? body.note.trim()
      : typeof body.reason === "string" && body.reason.trim().length > 0
        ? body.reason.trim()
        : undefined;

  // Ensure the word exists before logging
  const word = await prisma.word.findUnique({ where: { id: resolvedParams.id } });
  if (!word) {
    return NextResponse.json({ error: "Word not found" }, { status: 404 });
  }

  const details =
    flagged && (reasons.length > 0 || note)
      ? { reasons, ...(note ? { note } : {}) }
      : undefined;

  await prisma.activityLog.create({
    data: {
      wordId: resolvedParams.id,
      userId: session.user.id,
      action: flagged ? "flagged" : "unflagged",
      details,
    },
  });

  return NextResponse.json({ ok: true, flagged });
}
