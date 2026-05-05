import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audioKeyForWord, putObject } from "@/lib/dailey-storage";

// PUT /api/words/<id>/audio/upload
//
// Streams a raw .wav body into R2 at audio/<id>.wav. Bearer-auth using the
// same token pair as /api/import (IMPORT_API_TOKEN / WP_IMPORT_TOKEN), so
// the bulk uploader script can run without a NextAuth cookie. Falls back
// to a session check if no bearer is supplied so the route stays usable
// from the in-app UI if we ever wire one.
//
// Mirrors the /api/import auth pattern exactly — see the comment in
// app/api/import/route.ts for why we accept either env-var name.
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
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

    const { id } = await params;
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
            audioKeyForWord(word),
            body,
            "audio/wav",
        );
        return NextResponse.json({
            success: true,
            id,
            bytes: body.length,
            bucket,
            key: full_key,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[audio-upload] id=${id} failed: ${message}`);
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
}
