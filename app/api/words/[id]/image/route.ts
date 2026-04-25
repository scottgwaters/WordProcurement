import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { imageKeyForWord, presignDownload } from "@/lib/dailey-storage";

// GET /api/words/<id>/image
// Looks up the word, asks Dailey's customer API to presign a download URL
// for its R2 object, and 302-redirects the browser to it. Image keys are
// deterministic from word.id + word.category — no DB column needed.
//
// If the word's image hasn't been generated yet, the redirect succeeds but
// R2 returns 404 to the client. The <img onError> handler hides the slot.
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
        const res = NextResponse.redirect(url, 302);
        // 30-min browser cache on the redirect — beats the server-side cache
        // (50 min) so the cached redirect's target is still valid when used.
        res.headers.set("Cache-Control", "private, max-age=1800");
        return res;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[img] ${word.id} presign failed: ${message}`);
        return NextResponse.json(
            { error: "Failed to presign image URL", detail: message },
            { status: 500 },
        );
    }
}
