import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// DELETE /api/admin/invites/[id] — revoke a pending invite.
// Revocation = hard delete. A new invite can be issued immediately after.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const { id } = await params;
  const invite = await prisma.inviteToken.findUnique({ where: { id } });
  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  if (invite.usedAt) {
    return NextResponse.json(
      { error: "Invite already accepted — revoke the user instead" },
      { status: 400 }
    );
  }

  await prisma.inviteToken.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
