import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/words/[id]/decline
// Body: { declined: boolean }
//
// Soft-deletes a word (or un-declines one). Declined words are hidden from
// the review queue and survive re-imports. The underlying row stays in the
// database so the audit trail is preserved.
//
// Implicit behavior: declining a word also clears `verified` (if a word
// was verified by mistake and now needs to be declined, a single Decline
// click is enough — you don't have to un-verify first).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const declined: boolean = body.declined !== false; // default true

  const existing = await prisma.word.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Word not found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.word.update({
      where: { id },
      data: declined
        ? {
            declined: true,
            declinedAt: new Date(),
            verified: false,
            verifiedAt: null,
            verifiedById: null,
          }
        : {
            declined: false,
            declinedAt: null,
          },
    }),
    prisma.activityLog.create({
      data: {
        wordId: id,
        userId: session.user.id,
        action: declined ? "declined" : "undeclined",
      },
    }),
  ]);

  return NextResponse.json({ success: true, declined });
}
