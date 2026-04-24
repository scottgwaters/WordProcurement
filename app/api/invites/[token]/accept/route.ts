import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// POST /api/invites/[token]/accept — redeem an invite token by setting a
// password. Creates a new User (non-admin) and marks the invite used.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const invite = await prisma.inviteToken.findUnique({ where: { token } });
  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  if (invite.usedAt) {
    return NextResponse.json(
      { error: "This invite has already been used" },
      { status: 410 }
    );
  }
  if (invite.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "This invite has expired" },
      { status: 410 }
    );
  }

  // If a user already exists for this email, treat the invite as a
  // password reset (admin-issued via /api/admin/users/[id]/reset-link).
  // Otherwise create a new non-admin user.
  const existing = await prisma.user.findUnique({ where: { email: invite.email } });
  const hashed = await bcrypt.hash(password, 12);

  if (existing) {
    await prisma.$transaction([
      prisma.inviteToken.update({
        where: { id: invite.id },
        data: { usedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: existing.id },
        data: { password: hashed },
      }),
    ]);
    return NextResponse.json({ success: true, email: existing.email, reset: true });
  }

  const [, user] = await prisma.$transaction([
    prisma.inviteToken.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.create({
      data: {
        email: invite.email,
        password: hashed,
        isAdmin: false,
      },
      select: { id: true, email: true },
    }),
  ]);

  return NextResponse.json({ success: true, email: user.email });
}
