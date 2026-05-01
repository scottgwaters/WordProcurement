import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

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
//
// Auth: session for human reviewers; bearer IMPORT_API_TOKEN for batch
// cleanup runs (e.g. duplicate sweeps). Bearer-auth runs skip the
// activity_log entry since they have no userId — the declined/declinedAt
// columns plus the source-of-truth plan file in the repo cover the audit.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const expectedToken = process.env.IMPORT_API_TOKEN;
  const tokenOk = !!expectedToken && !!bearer && bearer === expectedToken;

  let userId: string | null = null;
  if (!tokenOk) {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = session.user.id;
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const declined: boolean = body.declined !== false; // default true

  const existing = await prisma.word.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Word not found" }, { status: 404 });
  }

  const ops: Prisma.PrismaPromise<unknown>[] = [
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
  ];
  if (userId) {
    ops.push(
      prisma.activityLog.create({
        data: {
          wordId: id,
          userId,
          action: declined ? "declined" : "undeclined",
        },
      })
    );
  }
  await prisma.$transaction(ops);

  return NextResponse.json({ success: true, declined });
}
