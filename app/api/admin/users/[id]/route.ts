import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// DELETE /api/admin/users/[id] — remove a user account.
//
// Safety rails:
// - Admins cannot delete themselves (avoids self-lockout)
// - The last remaining admin cannot be deleted (keeps the system accessible)
// - Users with review history (verified/created words or activity log
//   entries) are blocked from deletion so audit trail stays intact. The
//   admin can still revoke a fresh, zero-activity invite-mistake without
//   orphaning data.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdmin();
  if (error || !session) {
    return NextResponse.json(
      { error: error?.message ?? "Unauthorized" },
      { status: error?.status ?? 401 }
    );
  }

  const { id } = await params;

  if (id === session.user.id) {
    return NextResponse.json(
      { error: "You cannot delete your own account" },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      isAdmin: true,
      _count: {
        select: {
          words: true,
          verifiedWords: true,
          activityLogs: true,
        },
      },
    },
  });

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (target.isAdmin) {
    const adminCount = await prisma.user.count({ where: { isAdmin: true } });
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "Cannot delete the last admin" },
        { status: 400 }
      );
    }
  }

  const hasActivity =
    target._count.words > 0 ||
    target._count.verifiedWords > 0 ||
    target._count.activityLogs > 0;

  if (hasActivity) {
    return NextResponse.json(
      {
        error:
          "This user has review history and can't be deleted. Deleting would orphan their verified/created words and audit trail.",
      },
      { status: 409 }
    );
  }

  // Any invites this user issued get cleaned up alongside them — those are
  // unused tokens and have no historical value.
  await prisma.$transaction([
    prisma.inviteToken.deleteMany({ where: { createdById: id } }),
    prisma.user.delete({ where: { id } }),
  ]);

  return NextResponse.json({ success: true });
}
