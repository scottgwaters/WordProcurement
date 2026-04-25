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
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
        console.log(`[img] ${id} unauthorized (no session)`);
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const word = await prisma.word.findUnique({
        where: { id },
        select: { id: true, category: true },
    });
    if (!word) {
        console.log(`[img] ${id} word not found in DB`);
        return NextResponse.json({ error: "Word not found" }, { status: 404 });
    }

    const key = imageKeyForWord(word);
    console.log(`[img] ${id} word=${word.category} key=${key}`);

    try {
        const url = await presignDownload(key);
        // 302 so the browser refetches against R2 directly. The presigned URL
        // includes its own expiry; we don't add cache-control headers here.
        return NextResponse.redirect(url, 302);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[img] ${id} presign error: ${message}`);
        return NextResponse.json(
            { error: "Failed to presign image URL", detail: message },
            { status: 500 },
        );
    }
}
