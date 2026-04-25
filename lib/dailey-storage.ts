// Server-side helper for talking to Dailey Storage.
//
// Dailey Storage is S3-compatible. Per docs.dailey.cloud/docs/storage, when
// an app has @aws-sdk/client-s3 in its package.json, Dailey auto-provisions
// scoped R2 credentials as env vars on every deploy:
//     S3_ENDPOINT, S3_REGION, S3_BUCKET_NAME, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
// Each project is isolated by a bucket prefix; our credentials can only
// read/write under our own prefix, and the prefix is enforced transparently
// at the storage layer — so we sign with `Key: 'words/foo.png'` (no project
// id in the path) and the storage layer maps it to the physical
// `<project-id>/words/foo.png`.
//
// This file deliberately matches the docs example as closely as possible —
// no `forcePathStyle`, no checksum overrides, no manual prefix mangling.
// Each of those was added defensively in earlier iterations and each was
// suspected of contributing to the SignatureDoesNotMatch loop. Starting
// from the canonical config and only adding back what's demonstrably
// required.
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import type { Readable } from "stream";

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
    });
    return s3Client;
}

function getBucket(): string {
    const bucket = process.env.S3_BUCKET_NAME;
    if (!bucket) throw new Error("S3_BUCKET_NAME not set");
    return bucket;
}

/**
 * Server-side fetch of an object's bytes plus its content-type. Streams
 * through our server, so bytes cost bandwidth here rather than flowing
 * browser↔R2 directly — fine for 150KB images at low traffic.
 */
export async function fetchObject(key: string): Promise<{
    body: Buffer;
    contentType: string | undefined;
}> {
    const res = await getClient().send(
        new GetObjectCommand({ Bucket: getBucket(), Key: key }),
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
