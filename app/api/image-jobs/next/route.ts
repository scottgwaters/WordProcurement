import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { presignUpload, imageKeyForWord } from "@/lib/dailey-storage";

// POST /api/image-jobs/next
//
// Bearer-auth'd worker endpoint: atomically claim the oldest pending job,
// flip its status to 'claimed', and return everything the worker needs to
// render and upload — word details, the active flag note (if any), the
// curator's per-image note, the chosen style, and a presigned PUT URL
// for the PNG. Returns { job: null } when the queue is empty so the
// poller can sleep.
//
// Auth: reuses IMPORT_API_TOKEN (defense-in-depth — middleware also
// validates it). Same token, same trust level: "I'm a trusted CLI/worker
// running in someone's terminal."
//
// Why POST not GET: the call mutates state (UPDATE status='claimed'),
// so GET would be misleading and bad for any cache between us and the
// caller.
export async function POST(request: NextRequest) {
  const bearer = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!bearer || bearer !== process.env.IMPORT_API_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Atomic-claim: updateMany returns 0 when someone else got there first,
  // and the JS-side findFirst+update would race. We race-safely pick by
  // selecting first to know the id, then UPDATEing with a status guard.
  // MySQL's REPEATABLE READ + the status guard makes this safe; if two
  // workers ever run, the loser sees count=0 and retries on next tick.
  const candidate = await prisma.imageJob.findFirst({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!candidate) {
    return NextResponse.json({ job: null });
  }
  const claim = await prisma.imageJob.updateMany({
    where: { id: candidate.id, status: "pending" },
    data: { status: "claimed", claimedAt: new Date() },
  });
  if (claim.count === 0) {
    // Another worker beat us. Tell the caller to retry immediately.
    return NextResponse.json({ job: null, retry: true });
  }

  const job = await prisma.imageJob.findUnique({
    where: { id: candidate.id },
    include: {
      word: {
        select: {
          id: true,
          word: true,
          category: true,
          ageGroup: true,
          gradeLevel: true,
          partOfSpeech: true,
          definition: true,
          exampleSentence: true,
        },
      },
    },
  });
  if (!job) {
    return NextResponse.json({ job: null });
  }

  // Pull the active flag note (if any) so the worker can append it to the
  // prompt — that's where curators write things like "previous version
  // showed an adult, want a kid" or "image looked spooky, please redo".
  const latestFlag = await prisma.activityLog.findFirst({
    where: {
      wordId: job.wordId,
      action: { in: ["flagged", "unflagged"] },
    },
    orderBy: { createdAt: "desc" },
    select: { action: true, details: true },
  });
  const flagNote =
    latestFlag?.action === "flagged" &&
    latestFlag.details &&
    typeof latestFlag.details === "object" &&
    !Array.isArray(latestFlag.details) &&
    typeof (latestFlag.details as { note?: unknown }).note === "string"
      ? ((latestFlag.details as { note?: string }).note as string)
      : null;

  // Mint the upload URL up front so the worker doesn't need a second
  // round-trip to get one. 10-minute TTL covers slow generations.
  const objectKey = imageKeyForWord(job.word);
  let upload;
  try {
    upload = await presignUpload(objectKey);
  } catch (err) {
    // Roll the claim back so another tick can pick it up.
    await prisma.imageJob.update({
      where: { id: job.id },
      data: { status: "pending", claimedAt: null },
    });
    return NextResponse.json(
      { error: `presign failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    job: {
      id: job.id,
      word: job.word,
      prompt_note: job.promptNote,
      style: job.style,
      flag_note: flagNote,
      created_at: job.createdAt,
    },
    upload: {
      url: upload.url,
      key: objectKey,
      bucket: upload.bucket,
    },
  });
}
