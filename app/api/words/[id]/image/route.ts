import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchObject, imageKeyForWord } from "@/lib/dailey-storage";

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
        const { body, contentType } = await fetchObject(imageKeyForWord(word));
        // Stream the bytes back to the browser. Cache aggressively — image
        // contents for a given word.id never change (re-generations land at
        // the same key and overwrite), so the browser can hold these for
        // a long time. 30 min is conservative; can extend to 24h once stable.
        return new NextResponse(body as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": contentType || "image/png",
                "Cache-Control": "private, max-age=1800",
            },
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[img] ${word.id} fetch failed: ${message}`);
        return NextResponse.json(
            { error: "Failed to fetch image", detail: message },
            { status: 500 },
        );
    }
}
