import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand, ListObjectsV2Command, HeadBucketCommand } from "@aws-sdk/client-s3";
import type { Readable } from "stream";

// GET /api/storage/test?key=<key>&forcePathStyle=1&prefix=foo&bucket=other&op=list|head|get
//
// Diagnostic endpoint — bearer-token gated. Lets the developer flip SDK
// config knobs at request time without redeploying for each variation.
//
// Query params:
//   key              — object key (required for op=get)
//   bucket           — override S3_BUCKET_NAME
//   prefix           — string to prepend to the key before signing
//   forcePathStyle   — "1"/"true" to force path-style addressing
//   op               — "get" (default) | "list" | "head"
//
// Returns the SDK call result + the env Dailey injected so we can see
// every dimension at once.
export async function GET(request: NextRequest) {
    const auth = request.headers.get("authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    const expected = process.env.IMPORT_API_TOKEN;
    if (!expected || !token || token !== expected) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const op = (sp.get("op") || "get").toLowerCase();
    const rawKey = sp.get("key") || "";
    const prefix = sp.get("prefix") || "";
    const bucket = sp.get("bucket") || process.env.S3_BUCKET_NAME || "";
    const fps = sp.get("forcePathStyle");
    const forcePathStyle = fps === "1" || fps === "true";
    const key = prefix ? `${prefix.replace(/\/$/, "")}/${rawKey}` : rawKey;

    const env = {
        S3_ENDPOINT: process.env.S3_ENDPOINT,
        S3_REGION: process.env.S3_REGION,
        S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
        keyIdLen: process.env.S3_ACCESS_KEY_ID?.length ?? 0,
        secretLen: process.env.S3_SECRET_ACCESS_KEY?.length ?? 0,
        keyIdHead: process.env.S3_ACCESS_KEY_ID?.slice(0, 8),
    };

    if (!env.S3_ENDPOINT || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) {
        return NextResponse.json({ ok: false, error: "S3_* env vars missing", env }, { status: 200 });
    }

    const client = new S3Client({
        region: process.env.S3_REGION || "auto",
        endpoint: process.env.S3_ENDPOINT,
        credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        },
        ...(forcePathStyle ? { forcePathStyle: true } : {}),
    });

    const config = { op, bucket, key, prefix, forcePathStyle };

    try {
        if (op === "list") {
            const res = await client.send(new ListObjectsV2Command({
                Bucket: bucket,
                Prefix: prefix || undefined,
                MaxKeys: 5,
            }));
            return NextResponse.json({
                ok: true, config, env,
                count: res.KeyCount,
                isTruncated: res.IsTruncated,
                keys: res.Contents?.map((c) => c.Key) || [],
            });
        }
        if (op === "head") {
            await client.send(new HeadBucketCommand({ Bucket: bucket }));
            return NextResponse.json({ ok: true, config, env, head: "bucket reachable" });
        }
        // default: get
        if (!rawKey) {
            return NextResponse.json({ ok: false, config, env, error: "?key required for op=get" }, { status: 200 });
        }
        const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const stream = res.Body as Readable;
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
            chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
        }
        const body = Buffer.concat(chunks);
        return NextResponse.json({
            ok: true, config, env,
            bytes: body.length,
            contentType: res.ContentType,
        });
    } catch (err) {
        const e = err as { name?: string; message?: string; $metadata?: unknown; Code?: string };
        return NextResponse.json({
            ok: false,
            config,
            env,
            errorName: e.name,
            errorMessage: e.message,
            errorCode: e.Code,
            metadata: e.$metadata,
        }, { status: 200 });
    }
}
