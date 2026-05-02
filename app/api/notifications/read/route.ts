import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/notifications/read
//
// Body: { ids?: string[] }
//   - omit `ids` to mark every notification for the current user read
//     (the popover's "Mark all read" affordance)
//   - pass specific ids to mark just those (e.g. clicking one opens its
//     deep link and silently flips it read).
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = await request.json().catch(() => ({}));
  const ids: string[] | undefined = Array.isArray(body.ids)
    ? body.ids.filter((x: unknown): x is string => typeof x === "string")
    : undefined;

  const where = {
    userId,
    readAt: null,
    ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
  };

  const result = await prisma.notification.updateMany({
    where,
    data: { readAt: new Date() },
  });

  return NextResponse.json({ ok: true, updated: result.count });
}
