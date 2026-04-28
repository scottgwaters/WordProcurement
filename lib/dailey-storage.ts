// Server-side helper for presigning Dailey Storage object URLs.
//
// Uses the S3-compatible credentials (S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY,
// S3_SESSION_TOKEN, S3_ENDPOINT, S3_BUCKET_NAME, S3_KEY_PREFIX) injected
// via the project's storage envFrom. We previously routed through Dailey's
// customer-API presign endpoint with DAILEY_API_TOKEN, but that endpoint
// returned 401 even with a freshly-issued token. The SDK path is what
// Dailey's docs recommend and survives the upcoming per-project R2
// migration unchanged (S3_KEY_PREFIX becomes empty, code stays the same).
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const PRESIGN_TTL_SECONDS = 3600;
const CACHE_TTL_MS = 50 * 60 * 1000;

type CachedPresign = { url: string; expiresAt: number };
const cache = new Map<string, CachedPresign>();

function makeS3Client(): S3Client {
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    const sessionToken = process.env.S3_SESSION_TOKEN;
    const endpoint = process.env.S3_ENDPOINT;
    const region = process.env.S3_REGION || "auto";
    if (!accessKeyId || !secretAccessKey || !endpoint) {
        throw new Error(
            "S3 credentials missing from pod env (S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY / S3_ENDPOINT). " +
            "Check storage envFrom on the deployment.",
        );
    }
    return new S3Client({
        region,
        endpoint,
        forcePathStyle: true,
        credentials: { accessKeyId, secretAccessKey, sessionToken },
    });
}

/**
 * Mint a presigned download URL for the given object key. Cached
 * in-memory for ~50 min so a Review-Queue page render doesn't sign 50
 * URLs per image. Key is the logical key (e.g. "words/<id>.png");
 * S3_KEY_PREFIX is prepended internally.
 */
export async function presignDownload(key: string): Promise<string> {
    const cached = cache.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.url;

    const bucket = process.env.S3_BUCKET_NAME;
    const prefix = process.env.S3_KEY_PREFIX ?? "";
    if (!bucket) throw new Error("S3_BUCKET_NAME missing from pod env");

    try {
        const url = await getSignedUrl(
            makeS3Client(),
            new GetObjectCommand({ Bucket: bucket, Key: prefix + key }),
            { expiresIn: PRESIGN_TTL_SECONDS },
        );
        cache.set(key, { url, expiresAt: now + CACHE_TTL_MS });
        return url;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[s3-presign] failed key=${key} bucket=${bucket} prefix=${prefix} err=${message}`);
        throw err;
    }
}

/**
 * Build the canonical R2 object key for a word. Sight + heart words share
 * a single illustration; every other category gets a per-word PNG.
 */
export function imageKeyForWord(word: { id: string; category: string }): string {
    if (word.category === "sight_words" || word.category === "heart_words") {
        return "shared/sight-word.png";
    }
    return `words/${word.id}.png`;
}
