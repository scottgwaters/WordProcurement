import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/words/[id]/image/job
//
// Returns the most recent image_job row for the word so the UI can show
// its current state (pending / claimed / done / failed) plus the prompt
// the worker fed into Flux on the previous run. Used both for status
// polling while a job is in flight and for showing what was tried last
// time when the panel first mounts.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const job = await prisma.imageJob.findFirst({
    where: { wordId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ job });
}
