import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/words/<id>/audio/verify
//
// Independent gate from text verification — see schema comment on
// Word.audioVerified. Mirrors /api/words/[id]/verify exactly except for
// the field names. Body: { audioVerified: boolean }.
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await auth();
    const { id } = await params;

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { audioVerified } = body;

    if (typeof audioVerified !== "boolean") {
        return NextResponse.json(
            { error: "Missing required field: audioVerified (boolean)" },
            { status: 400 },
        );
    }

    const updatedWord = await prisma.word.update({
        where: { id },
        data: {
            audioVerified,
            audioVerifiedAt: audioVerified ? new Date() : null,
            audioVerifiedById: audioVerified ? session.user.id : null,
        },
    });

    await prisma.activityLog.create({
        data: {
            wordId: id,
            userId: session.user.id,
            action: audioVerified ? "audio_verified" : "audio_unverified",
        },
    });

    return NextResponse.json({
        id: updatedWord.id,
        audio_verified: updatedWord.audioVerified,
        audio_verified_at: updatedWord.audioVerifiedAt,
        audio_verified_by: updatedWord.audioVerifiedById,
    });
}
