import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { presignDownload, imageKeyForWord } from "@/lib/dailey-storage";

// GET /api/words/<id>/image
//
// 302-redirects to a fresh presigned URL for the word's PNG in Dailey
// storage. Public — no session required — so the Wordnauts iOS app can
// load images via AsyncImage with just a word ID. The presigned URL
// lasts 1 hour; this redirect endpoint mints a new one each call (with
// a server-side ~50min cache in `dailey-storage.ts` so most calls are
// cheap). Sight + heart words share a single illustration.
//
// On any failure (unknown word, missing object, presign error) returns
// 404 with no body so the iOS AsyncImage hits .failure and silently
// hides the slot rather than rendering a broken image.
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const word = await prisma.word.findUnique({
        where: { id },
        select: { id: true, category: true },
    });
    if (!word) {
        return new NextResponse(null, { status: 404 });
    }

    try {
        const url = await presignDownload(imageKeyForWord(word));
        const res = NextResponse.redirect(url, 302);
        // Browser cache the redirect for 30 min — well under the 1hr
        // presign TTL so a stale-but-cached redirect can't outlive the
        // signed URL it points at.
        res.headers.set("Cache-Control", "public, max-age=1800");
        return res;
    } catch {
        return new NextResponse(null, { status: 404 });
    }
}
