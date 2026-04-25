import { NextRequest, NextResponse } from "next/server";
import { fetchObject } from "@/lib/dailey-storage";

// GET /api/storage/test?key=<key>
//
// Diagnostic endpoint for the storage→R2 path. Auth is bearer-token
// (IMPORT_API_TOKEN, same as /api/import) so it's curl-able from a
// developer terminal without a browser session. middleware.ts permits
// this path past the NextAuth redirect when the bearer matches.
//
// Returns the SDK call result as JSON so I can iterate on credential /
// SDK config / key shape without you needing to refresh the Review Queue.
//
// Strip this whole route once images are confirmed working in production
// — it exposes nothing sensitive (no body bytes, just length and metadata)
// but it's still a debug surface that doesn't belong long-term.
export async function GET(request: NextRequest) {
    const auth = request.headers.get("authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    const expected = process.env.IMPORT_API_TOKEN;
    if (!expected || !token || token !== expected) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const key = request.nextUrl.searchParams.get("key");
    if (!key) {
        return NextResponse.json(
            { error: "Missing ?key=<storage-key>" },
            { status: 400 },
        );
    }

    try {
        const { body, contentType } = await fetchObject(key);
        return NextResponse.json({
            ok: true,
            key,
            bytes: body.length,
            contentType,
        });
    } catch (err) {
        const e = err as { name?: string; message?: string; $metadata?: unknown; stack?: string };
        return NextResponse.json(
            {
                ok: false,
                key,
                errorName: e.name,
                errorMessage: e.message,
                metadata: e.$metadata,
                stack: e.stack?.split("\n").slice(0, 6).join("\n"),
                env: {
                    S3_ENDPOINT: process.env.S3_ENDPOINT,
                    S3_REGION: process.env.S3_REGION,
                    S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
                    keyIdLen: process.env.S3_ACCESS_KEY_ID?.length ?? 0,
                    secretLen: process.env.S3_SECRET_ACCESS_KEY?.length ?? 0,
                    keyIdHead: process.env.S3_ACCESS_KEY_ID?.slice(0, 8),
                },
            },
            { status: 200 },  // 200 even on R2 error so curl shows the body
        );
    }
}
