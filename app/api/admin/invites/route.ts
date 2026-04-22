import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const INVITE_TTL_DAYS = 7;

// GET /api/admin/invites — list pending (unused, unexpired) invites.
export async function GET() {
  const { error } = await requireAdmin();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const invites = await prisma.inviteToken.findMany({
    where: { usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { email: true } },
    },
  });

  // Token is included so the admin can re-copy the invite link from the
  // pending-invites list. Endpoint is already admin-gated; the token
  // confers no extra access the admin doesn't already have.
  return NextResponse.json({ invites });
}

// POST /api/admin/invites — create a new invite for an email.
//
// Returns the signup link in the response. Since we don't have email wired
// yet, the admin UI shows this link with a copy button; the admin emails
// it manually. Swap to a transactional provider later by calling the
// email service here after token creation.
export async function POST(request: NextRequest) {
  const { session, error } = await requireAdmin();
  if (error || !session) {
    return NextResponse.json(
      { error: error?.message ?? "Unauthorized" },
      { status: error?.status ?? 401 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "A valid email address is required" },
      { status: 400 }
    );
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return NextResponse.json(
      { error: "A user with that email already exists" },
      { status: 409 }
    );
  }

  // Invalidate any still-pending invites for this email so old links
  // from a prior re-invite can't be redeemed.
  await prisma.inviteToken.updateMany({
    where: { email, usedAt: null },
    data: { expiresAt: new Date() },
  });

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  const invite = await prisma.inviteToken.create({
    data: {
      email,
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
