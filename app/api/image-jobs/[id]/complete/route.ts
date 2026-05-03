import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidatePresignCache, imageKeyForWord } from "@/lib/dailey-storage";

// POST /api/image-jobs/[id]/complete
//
// Worker reports the outcome of a generation attempt. On success the PNG
// is already live in R2 (the worker just streamed it via the presigned
// PUT); we record what was used so the curator's panel can show it, drop
// the cached download presign so the next /image redirect serves the
// fresh bytes, and write a notification for the requester.
//
// Body: { ok: true, final_prompt: string, text_warning?: string }
//   or  { ok: false, error: string }
//
// Auth: bearer (same token as worker enqueue side).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const bearer = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  const tokens = [process.env.IMPORT_API_TOKEN, process.env.WP_IMPORT_TOKEN].filter(
    (t): t is string => typeof t === "string" && t.length > 0,
  );
  if (!bearer || !tokens.some((t) => t === bearer)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const ok = body.ok === true;

  const job = await prisma.imageJob.findUnique({
    where: { id },
    include: { word: { select: { id: true, word: true, category: true } } },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (ok) {
    const finalPrompt =
      typeof body.final_prompt === "string" ? body.final_prompt.slice(0, 4000) : null;
    const textWarning =
      typeof body.text_warning === "string" && body.text_warning.length > 0
        ? body.text_warning.slice(0, 500)
        : null;
    await prisma.imageJob.update({
      where: { id },
      data: {
        status: "done",
        completedAt: new Date(),
        finalPrompt,
        textWarning,
        errorMessage: null,
      },
    });
    // Drop the cached presigned download URL so /api/words/<id>/image
    // mints a fresh one on the next request and the new PNG is served
    // immediately. Without this, the redirect cache could hand out a
    // URL that R2 still serves the old bytes through any intermediary
    // CDN cache for the remaining presign TTL.
    invalidatePresignCache(imageKeyForWord(job.word));

    await prisma.notification.create({
      data: {
        userId: job.requestedById,
        kind: "image_done",
        message: `Image ready for ${job.word.word}`,
        link: `/words/${job.wordId}`,
      },
    });
  } else {
    const errorMessage =
      typeof body.error === "string" ? body.error.slice(0, 1000) : "Worker reported failure";
    await prisma.imageJob.update({
      where: { id },
      data: {
        status: "failed",
        completedAt: new Date(),
        errorMessage,
      },
    });
    await prisma.notification.create({
      data: {
        userId: job.requestedById,
        kind: "image_failed",
        message: `Image generation failed for ${job.word.word}: ${errorMessage.slice(0, 200)}`,
        link: `/words/${job.wordId}`,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
