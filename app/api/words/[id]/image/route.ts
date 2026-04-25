import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { imageKeyForWord, presignDownload } from "@/lib/dailey-storage";

// GET /api/words/<id>/image
// Looks up the word, computes its R2 object key, presigns a download URL via
// Dailey, and 302-redirects the browser to it. Image keys are deterministic
// from word.id + word.category, so we don't need a DB column for them — the
// generator pipeline writes to the same key shape this route reads.
//
// If the word's image hasn't been generated yet, the redirect succeeds but
// R2 returns 404 to the client. The <img> tag's onError handles that.
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const word = await prisma.word.findUnique({
        where: { id },
        select: { id: true, category: true },
    });
    if (!word) {
        return NextResponse.json({ error: "Word not found" }, { status: 404 });
    }

    try {
        const url = await presignDownload(imageKeyForWord(word));
        // Tell the browser to keep this redirect for 30 min — that beats the
        // server-side presign cache TTL (50 min) so the redirect target is
        // still a valid signed URL when the browser uses it. Without this,
        // every Previous/Next navigation makes a fresh server roundtrip even
        // for words the reviewer has already seen this session.
        const res = NextResponse.redirect(url, 302);
        res.headers.set("Cache-Control", "private, max-age=1800");
        return res;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json(
            { error: "Failed to presign image URL", detail: message },
            { status: 500 },
        );
    }
}
