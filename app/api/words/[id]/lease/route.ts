import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Leases last this long before a heartbeat must extend them. Kept short
// so abandoned tabs (closed browser, network dropped) release quickly.
const LEASE_TTL_MS = 3 * 60 * 1000; // 3 minutes

// POST /api/words/[id]/lease — acquire or extend a soft lock on the word.
// Returns 200 on success, 409 if someone else holds an unexpired lease.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: wordId } = await params;
  const userId = session.user.id;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LEASE_TTL_MS);

  const existing = await prisma.wordLease.findUnique({
    where: { wordId },
    include: { user: { select: { email: true } } },
  });

  if (existing && existing.userId !== userId && existing.expiresAt > now) {
    // Someone else has it and their lease hasn't expired.
    return NextResponse.json(
      {
        error: "This word is being edited by another reviewer",
        heldBy: existing.user.email,
        expiresAt: existing.expiresAt,
      },
      { status: 409 }
    );
  }

  const lease = await prisma.wordLease.upsert({
    where: { wordId },
    create: { wordId, userId, expiresAt },
    update: { userId, acquiredAt: now, expiresAt },
  });

  return NextResponse.json({ lease });
}

// DELETE /api/words/[id]/lease — release the lease if it's mine.
// No-ops (and returns 200) if the lease isn't held by me so the client
// can call this on every unmount without worrying about stale state.
//
// Also accepts sendBeacon payloads (body might be empty or blob), so we
// don't inspect the body at all — the URL is the only thing that matters.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: wordId } = await params;
  await prisma.wordLease.deleteMany({
    where: { wordId, userId: session.user.id },
  });

  return NextResponse.json({ success: true });
}
