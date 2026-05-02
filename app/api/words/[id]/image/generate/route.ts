import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/words/[id]/image/generate
//
// Curator-initiated image regeneration. Drops a row into image_jobs at
// status='pending'; the local Python worker polls /api/image-jobs/next and
// processes them. The route only enqueues — it does not block on
// generation. UI shows progress by polling /api/words/[id]/image/job.
//
// Body: { prompt_note?: string, style?: string }
//   prompt_note — free-form text the curator typed for THIS attempt.
//                 Examples: "two of them, side by side", "softer colors",
//                 "no humans". Worker appends to the category template.
//   style       — optional dropdown pick: "default" | "watercolor" | "sticker" | "soft3d".
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const word = await prisma.word.findUnique({ where: { id }, select: { id: true } });
  if (!word) {
    return NextResponse.json({ error: "Word not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const promptNote: string | null =
    typeof body.prompt_note === "string" && body.prompt_note.trim().length > 0
      ? body.prompt_note.trim().slice(0, 1000)
      : null;
  const style: string | null =
    typeof body.style === "string" && body.style.trim().length > 0
      ? body.style.trim().slice(0, 50)
      : null;

  // If there's already a pending or claimed job for this word, return that
  // one instead of stacking duplicates — the curator probably double-clicked.
  const existing = await prisma.imageJob.findFirst({
    where: { wordId: id, status: { in: ["pending", "claimed"] } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    return NextResponse.json({ job: existing, reused: true });
  }

  const job = await prisma.imageJob.create({
    data: {
      wordId: id,
      promptNote,
      style,
      status: "pending",
      requestedById: session.user.id,
    },
  });

  return NextResponse.json({ job, reused: false }, { status: 201 });
}
