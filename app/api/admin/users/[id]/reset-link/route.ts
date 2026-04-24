import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const RESET_TTL_DAYS = 7;

// POST /api/admin/users/[id]/reset-link
//
// Generate a single-use password-reset link for an existing user. We reuse
// the InviteToken table (and the /invite/[token] accept flow) because the
// flow is identical: the link lets someone set a password for an email.
// When the accept endpoint sees an existing user it updates the password
// instead of creating a new account.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAdmin();
  if (error || !session) {
    return NextResponse.json(
      { error: error?.message ?? "Unauthorized" },
      { status: error?.status ?? 401 },
    );
  }

  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Invalidate any still-pending invites for this email so the previous
  // link can't be used to sidestep the new reset.
  await prisma.inviteToken.updateMany({
    where: { email: user.email, usedAt: null },
    data: { expiresAt: new Date() },
  });

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + RESET_TTL_DAYS * 24 * 60 * 60 * 1000);

  const invite = await prisma.inviteToken.create({
    data: {
      email: user.email,
      token,
      createdById: session.user.id,
      expiresAt,
    },
  });

  const origin = request.headers.get("origin") ?? request.nextUrl.origin;
  const link = `${origin}/invite/${token}`;

  return NextResponse.json({
    invite: {
      id: invite.id,
      email: invite.email,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
    },
    link,
  });
}
