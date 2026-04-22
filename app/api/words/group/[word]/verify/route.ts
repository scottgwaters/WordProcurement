import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/words/group/[word]/verify
// Body: { verified: boolean, variantIds?: string[] }
// When variantIds is omitted, flips every variant with this spelling.
// When provided, flips only those specific variant rows — used when some
// variants are ready and others still need work.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ word: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { word: wordParam } = await params;
  const word = decodeURIComponent(wordParam).toUpperCase();
  const body = await request.json().catch(() => ({}));
  const verified = Boolean(body.verified);
  const variantIds: string[] | undefined = Array.isArray(body.variantIds)
    ? body.variantIds
    : undefined;

  const where: { word: string; id?: { in: string[] } } = { word };
  if (variantIds && variantIds.length > 0) {
    where.id = { in: variantIds };
  }

  const targets = await prisma.word.findMany({
    where,
    select: { id: true },
  });
  if (targets.length === 0) {
    return NextResponse.json({ error: "No variants found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.word.updateMany({
      where,
      data: {
        verified,
        verifiedAt: verified ? new Date() : null,
        verifiedById: verified ? session.user.id : null,
        version: { increment: 1 },
      },
    }),
    ...targets.map((t) =>
      prisma.activityLog.create({
        data: {
          wordId: t.id,
          userId: session.user.id,
          action: verified ? "verified" : "rejected",
          details: { via: "group" },
        },
      })
    ),
  ]);

  return NextResponse.json({ success: true, updated: targets.length });
}
