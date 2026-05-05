import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { presignDownload, audioKeyForWord } from "@/lib/dailey-storage";

// GET /api/words/<id>/audio
//
// 302-redirects to a fresh presigned URL for the word's .wav clip in
// Dailey storage. Public — no session required — so the WP review UI can
// stream audio with a plain <audio src=...> tag and so the iOS app could
// (eventually) fetch by id. Mirrors /api/words/[id]/image; same 30-min
// browser cache and same 404-on-failure contract.
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const word = await prisma.word.findUnique({
        where: { id },
        select: { id: true },
    });
    if (!word) {
        return new NextResponse(null, { status: 404 });
    }

    try {
        const url = await presignDownload(audioKeyForWord(word));
        const res = NextResponse.redirect(url, 302);
        res.headers.set("Cache-Control", "public, max-age=1800");
        return res;
    } catch {
        return new NextResponse(null, { status: 404 });
    }
}
