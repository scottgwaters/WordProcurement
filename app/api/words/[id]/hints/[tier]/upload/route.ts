import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
    hintAudioKeyForWord,
    putObject,
    type HintTier,
} from "@/lib/dailey-storage";

const TIERS: HintTier[] = ["easy", "medium", "hard"];

// PUT /api/words/<id>/hints/<tier>/upload
//
// Streams a raw .wav body into R2 at audio/hints/<id>_<tier>.wav. Mirrors
// /api/words/<id>/audio/upload exactly — same bearer auth, same in-handler
// session fallback. Used by scripts/upload_hints.py to push the Kokoro
// batch up to Dailey storage.
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; tier: string }> },
) {
    const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const expectedTokens = [process.env.IMPORT_API_TOKEN, process.env.WP_IMPORT_TOKEN]
        .filter((t): t is string => typeof t === "string" && t.length > 0);
    const tokenOk = !!bearer && expectedTokens.some((t) => t === bearer);

    if (!tokenOk) {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
    }

    const { id, tier } = await params;
    if (!TIERS.includes(tier as HintTier)) {
        return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }
    const word = await prisma.word.findUnique({
        where: { id },
        select: { id: true },
    });
    if (!word) {
        return NextResponse.json({ error: "Word not found" }, { status: 404 });
    }

    const body = Buffer.from(await request.arrayBuffer());
    if (body.length === 0) {
        return NextResponse.json({ error: "Empty body" }, { status: 400 });
    }

    try {
        const { full_key, bucket } = await putObject(
            hintAudioKeyForWord(id, tier as HintTier),
            body,
            "audio/wav",
        );
        return NextResponse.json({
            success: true,
            id,
            tier,
            bytes: body.length,
            bucket,
            key: full_key,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[hint-audio-upload] id=${id} tier=${tier} failed: ${message}`);
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
}
