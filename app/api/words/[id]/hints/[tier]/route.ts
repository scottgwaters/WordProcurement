import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    presignDownload,
    hintAudioKeyForWord,
    type HintTier,
} from "@/lib/dailey-storage";

const TIERS: HintTier[] = ["easy", "medium", "hard"];

// GET /api/words/<id>/hints/<tier>
//
// 302-redirects to a fresh presigned URL for the (word, tier) hint clip.
// Public — same contract as /api/words/[id]/audio so the WP review UI and
// (eventually) the iOS app can stream it with a plain <audio> tag. 30-min
// browser cache, 404 if the object is missing.
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string; tier: string }> },
) {
    const { id, tier } = await params;
    if (!TIERS.includes(tier as HintTier)) {
        return new NextResponse(null, { status: 404 });
    }
    const word = await prisma.word.findUnique({
        where: { id },
        select: { id: true },
    });
    if (!word) {
        return new NextResponse(null, { status: 404 });
    }

    try {
        const url = await presignDownload(hintAudioKeyForWord(id, tier as HintTier));
        const res = NextResponse.redirect(url, 302);
        res.headers.set("Cache-Control", "public, max-age=1800");
        return res;
    } catch {
        return new NextResponse(null, { status: 404 });
    }
}
