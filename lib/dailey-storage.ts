// Server-side helper for talking to Dailey Storage.
//
// Dailey Storage is S3-compatible. Per docs.dailey.cloud/docs/storage, when
// an app has `@aws-sdk/client-s3` in its package.json, Dailey auto-provisions
// scoped R2 credentials as env vars on every deploy:
//     S3_ENDPOINT, S3_REGION, S3_BUCKET_NAME, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
// Each project is isolated by a bucket prefix; our credentials can only
// read/write under our own prefix.
//
// Earlier this file went through two other auth strategies, both of which
// fought bugs in Dailey's customer-API:
//   1. DAILEY_API_TOKEN env var — silently truncated from 1327 chars to 24
//      during pod env injection, so every presign 401'd.
//   2. Runtime login with DAILEY_EMAIL + DAILEY_PASSWORD — ate a 423 lockout
//      when the password was rejected, extending the lockout on every
//      subsequent image request.
// Switching to direct S3 signing skips both. The SDK signs URLs locally
// with static access keys; no round-trip to Dailey auth, nothing to lock
// out, nothing to truncate.
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "stream";

const PRESIGN_TTL_SECONDS = 3600;     // signed URLs valid 1h
const CACHE_TTL_MS = 50 * 60 * 1000;  // refresh before the URL actually expires

// Dailey stores each project's objects under a `<project-id>/` prefix inside
// the shared `dailey-os` bucket. The docs imply the injected S3 credentials
// translate user-supplied keys into the prefixed physical path transparently
// — but in practice the SDK hits `dailey-os/<key>` without the prefix and
// gets 404. So we prepend it ourselves. Same project ID used by the `dailey`
// CLI when uploading via presign.
const PROJECT_PREFIX = "fd5c82d9-1fd1-4f27-b10e-dd6ce36f1859";

type CachedPresign = { url: string; expiresAt: number };
const cache = new Map<string, CachedPresign>();

let s3Client: S3Client | null = null;
function getClient(): S3Client {
    if (s3Client) return s3Client;
    const endpoint = process.env.S3_ENDPOINT;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    if (!endpoint || !accessKeyId || !secretAccessKey) {
        throw new Error(
            "Dailey S3 credentials missing. The pod should receive S3_ENDPOINT, " +
            "S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY automatically when " +
            "@aws-sdk/client-s3 is in package.json. If this fails, redeploy " +
            "to trigger auto-provisioning.",
        );
    }
    console.log(
        `[s3-init] endpoint=${endpoint} region=${process.env.S3_REGION || "auto"} ` +
        `bucket=${process.env.S3_BUCKET_NAME || "?"} keyIdLen=${accessKeyId.length} ` +
        `secretLen=${secretAccessKey.length} keyIdHead=${accessKeyId.slice(0, 8)} ` +
        `secretHead=${secretAccessKey.slice(0, 4)}`,
    );
    s3Client = new S3Client({
        region: process.env.S3_REGION || "auto",
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: true, // R2 requires path-style addressing
        // AWS SDK v3 adds `x-amz-checksum-mode=ENABLED` to every GetObject by
        // default. Cloudflare R2 doesn't support that part of the SigV4
        // checksum extension, so the canonical-request strings diverge and
        // R2 rejects the signature with SignatureDoesNotMatch. WHEN_REQUIRED
        // turns off the optional header so the request signs cleanly.
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
    });
    return s3Client;
}

function getBucket(): string {
    const bucket = process.env.S3_BUCKET_NAME;
    if (!bucket) throw new Error("S3_BUCKET_NAME not set");
    return bucket;
}

export async function presignDownload(key: string): Promise<string> {
    const cached = cache.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.url;

    const bucket = getBucket();
    const physicalKey = `${PROJECT_PREFIX}/${key}`;
    const url = await getSignedUrl(
        getClient(),
        new GetObjectCommand({ Bucket: bucket, Key: physicalKey }),
        { expiresIn: PRESIGN_TTL_SECONDS },
    );
    // One-line trace per cache-miss so we can see whether S3_* env vars are
    // wired correctly and what R2 path we're actually hitting. Strip once
    // images are confirmed rendering.
    console.log(`[s3] bucket=${bucket} key=${physicalKey} fullUrl=${url}`);

    cache.set(key, { url, expiresAt: now + CACHE_TTL_MS });
    return url;
}

/**
 * Server-side fetch of an object's bytes plus its content-type. Used as a
 * fallback when the presigned-URL path can't be made to work (e.g. R2
 * rejects the SDK's signature with SignatureDoesNotMatch). Streams through
 * our server, so bytes cost bandwidth here rather than flowing browser↔R2
 * directly — fine for 150KB images at low traffic.
 */
export async function fetchObject(key: string): Promise<{
    body: Buffer;
    contentType: string | undefined;
}> {
    const physicalKey = `${PROJECT_PREFIX}/${key}`;
    const res = await getClient().send(
        new GetObjectCommand({ Bucket: getBucket(), Key: physicalKey }),
    );
    const stream = res.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
    }
    return {
        body: Buffer.concat(chunks),
        contentType: res.ContentType,
    };
}

/**
 * Build the canonical R2 object key for a word. Sight + heart words share a
 * single illustration (see image-gen/generate.py SHARED_CATEGORIES); every
 * other category gets a per-word PNG keyed by the word UUID.
 */
export function imageKeyForWord(word: { id: string; category: string }): string {
    if (word.category === "sight_words" || word.category === "heart_words") {
        return "shared/sight-word.png";
    }
    return `words/${word.id}.png`;
}
