import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/invites/[token] — validate a pending invite. Returns { email }
// if the token is live, so the accept page can display whose invite this is.
// Public (no session required) — the middleware lets /api/invites/* through.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

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
      { error: "This invite has expired. Ask your admin for a new one." },
      { status: 410 }
    );
  }

  return NextResponse.json({ email: invite.email });
}
