// Server-side helper for presigning Dailey Storage object URLs.
//
// Uses the S3-compatible credentials (S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY,
// S3_SESSION_TOKEN, S3_ENDPOINT, S3_BUCKET_NAME, S3_KEY_PREFIX) injected
// via the project's storage envFrom. We previously routed through Dailey's
// customer-API presign endpoint with DAILEY_API_TOKEN, but that endpoint
// returned 401 even with a freshly-issued token. The SDK path is what
// Dailey's docs recommend and survives the upcoming per-project R2
// migration unchanged (S3_KEY_PREFIX becomes empty, code stays the same).
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const PRESIGN_TTL_SECONDS = 3600;
const CACHE_TTL_MS = 50 * 60 * 1000;

// HACK: Dailey injects S3_KEY_PREFIX="scottwaters/word-procurement/" (legacy
// form) but the actual stored objects live under "<project-id>/". Verified
// via Dailey's own MCP `storage_presign_download` 2026-04-28 — its URL uses
// the project-id prefix and resolves to the real file. Filed back; remove
// this constant and use process.env.S3_KEY_PREFIX once Dailey fixes the
// env-var injection (or once we're moved to per-project R2 buckets, where
// the prefix becomes empty entirely).
const STORAGE_KEY_PREFIX = "fd5c82d9-1fd1-4f27-b10e-dd6ce36f1859/";

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
    const prefix = STORAGE_KEY_PREFIX;
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

/**
 * Build the canonical R2 object key for a word's audio clip. Unlike images,
 * sight + heart words each get their own clip (the spoken word is unique
 * even if the illustration is shared).
 */
export function audioKeyForWord(word: { id: string }): string {
    return `audio/${word.id}.wav`;
}

/**
 * R2 key for a hint clip. One file per (word, tier) — overwritten on rewrite,
 * so the URL stays stable even when the hint text changes.
 */
export type HintTier = "easy" | "medium" | "hard";
export function hintAudioKeyForWord(wordId: string, tier: HintTier): string {
    return `audio/hints/${wordId}_${tier}.wav`;
}

/**
 * Server-side PutObject for streaming a binary blob into R2. Used by the
 * audio bulk-upload endpoint, which receives the .wav body over HTTP and
 * forwards it to storage in one hop. Returns the full key (including the
 * STORAGE_KEY_PREFIX) so callers can log it.
 */
export async function putObject(
    key: string,
    body: Buffer | Uint8Array,
    contentType: string,
): Promise<{ full_key: string; bucket: string }> {
    const bucket = process.env.S3_BUCKET_NAME;
    const prefix = STORAGE_KEY_PREFIX;
    if (!bucket) throw new Error("S3_BUCKET_NAME missing from pod env");
    const fullKey = prefix + key;
    await makeS3Client().send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: fullKey,
            Body: body,
            ContentType: contentType,
        }),
    );
    cache.delete(key);
    return { full_key: fullKey, bucket };
}

/**
 * Mint a presigned PUT URL the worker can stream the generated PNG into.
 * The caller (the Python image worker) must `Content-Type: image/png` on
 * the upload — anything else and S3 will sign-mismatch.
 */
export async function presignUpload(key: string): Promise<{ url: string; full_key: string; bucket: string }> {
    const bucket = process.env.S3_BUCKET_NAME;
    const prefix = STORAGE_KEY_PREFIX;
    if (!bucket) throw new Error("S3_BUCKET_NAME missing from pod env");
    const fullKey = prefix + key;
    const url = await getSignedUrl(
        makeS3Client(),
        new PutObjectCommand({ Bucket: bucket, Key: fullKey, ContentType: "image/png" }),
        { expiresIn: 600 },
    );
    return { url, full_key: fullKey, bucket };
}

/**
 * Drop the cached download URL for a key after a fresh upload, so the next
 * /api/words/<id>/image request mints a brand-new presign instead of
 * 302-ing browsers at the stale (but-still-valid) URL pointing at the old
 * object content. R2 rewrites the object atomically on PUT, but some
 * browser/cache layers will keep showing the prior bytes from the cached
 * redirect target until the URL itself rotates.
 */
export function invalidatePresignCache(key: string): void {
    cache.delete(key);
}

/**
 * Delete the object outright. Currently unused but handy if we ever want a
 * "clear image and revert to placeholder" affordance on the panel.
 */
export async function deleteObject(key: string): Promise<void> {
    const bucket = process.env.S3_BUCKET_NAME;
    if (!bucket) throw new Error("S3_BUCKET_NAME missing from pod env");
    await makeS3Client().send(
        new DeleteObjectCommand({ Bucket: bucket, Key: STORAGE_KEY_PREFIX + key }),
    );
    cache.delete(key);
}
