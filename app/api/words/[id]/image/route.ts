import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/words/<id>/image
// 302-redirects to the word's PNG hosted on scottgwaters.com. Sight and
// heart words share a single illustration.
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

    const filename =
        word.category === "sight_words" || word.category === "heart_words"
            ? "sight-word.png"
            : `${word.id}.png`;
    const url = `https://scottgwaters.com/wordnauts/${filename}`;
    const res = NextResponse.redirect(url, 302);
    res.headers.set("Cache-Control", "public, max-age=1800");
    return res;
}
