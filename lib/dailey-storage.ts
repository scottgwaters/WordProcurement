// Server-side helper for talking to Dailey Storage via the customer-API
// presign path.
//
// Dailey's storage product no longer auto-injects raw S3_* credentials
// (per `dailey platform info`: "Upload and download access is issued
// through presigned URLs instead of shared credentials"). The supported
// integration is: hit POST /projects/<id>/storage/presign-download with a
// Bearer token, get back a 1-hour signed R2 URL, redirect the browser
// (or fetch+stream) to it.
//
// Auth uses the project's DAILEY_API_TOKEN env var, which Dailey's
// env-bundle now correctly preserves at full length (~1327 chars for the
// JWT). Earlier in the project's history this same path was blocked by an
// env-truncation bug (token arrived at the pod as 24 chars); per the
// 2026-04-25 backend update that bug appears resolved for pre-existing
// long values.
const DAILEY_API_BASE = process.env.DAILEY_API_URL || "https://os.dailey.cloud/api";
const PROJECT_ID = "fd5c82d9-1fd1-4f27-b10e-dd6ce36f1859";
const PRESIGN_TTL_SECONDS = 3600;
const CACHE_TTL_MS = 50 * 60 * 1000;  // refresh before R2's URL expires

type CachedPresign = { url: string; expiresAt: number };
const cache = new Map<string, CachedPresign>();

function getToken(): string {
    const tok = process.env.DAILEY_API_TOKEN?.trim();
    if (!tok) {
        throw new Error(
            "DAILEY_API_TOKEN missing. The pod needs a Dailey access token " +
            "to mint presigned download URLs. Set it via the Dailey dashboard.",
        );
    }
    return tok;
}

/**
 * Ask Dailey's customer API to mint a presigned download URL for the given
 * object key. Cached in-memory for ~50 min to avoid round-tripping per image.
 */
export async function presignDownload(key: string): Promise<string> {
    const cached = cache.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.url;

    const res = await fetch(
        `${DAILEY_API_BASE}/projects/${PROJECT_ID}/storage/presign-download`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Dailey-Source": "word-procurement",
                Authorization: `Bearer ${getToken()}`,
            },
            body: JSON.stringify({ key, expires_in_seconds: PRESIGN_TTL_SECONDS }),
        },
    );
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        const tokLen = process.env.DAILEY_API_TOKEN?.length ?? 0;
        console.error(`[dailey-presign] ${res.status} key=${key} tokLen=${tokLen} body=${body.slice(0, 200)}`);
        throw new Error(`Dailey presign failed: ${res.status} ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as { download_url?: string; url?: string };
    const url = data.download_url || data.url;
    if (!url) throw new Error("Dailey presign returned no URL");

    cache.set(key, { url, expiresAt: now + CACHE_TTL_MS });
    return url;
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
