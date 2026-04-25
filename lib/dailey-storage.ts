// Server-side helper for talking to Dailey's storage API. The deployment
// authenticates with a long-lived DAILEY_API_TOKEN env var (mint via the
// `dailey` CLI; same scope as the user's own token).
//
// Why this lives here instead of being inlined in the route: image-bearing
// pages render multiple <img> tags pointing at /api/words/<id>/image, each
// triggering a presign. Without caching we'd hit Dailey's API on every
// thumbnail render. The in-memory cache keeps presigned URLs for ~50 min
// (presigns themselves are 1h; we leave a 10 min buffer).

const DAILEY_API_BASE = process.env.DAILEY_API_URL || "https://os.dailey.cloud/api";
const PROJECT_ID = "fd5c82d9-1fd1-4f27-b10e-dd6ce36f1859";

const PRESIGN_TTL_SECONDS = 3600;     // ask Dailey for max-life URLs
const CACHE_TTL_MS = 50 * 60 * 1000;  // re-presign before R2's URL actually expires

type CachedPresign = { url: string; expiresAt: number };
const cache = new Map<string, CachedPresign>();

function getToken(): string {
    const tok = process.env.DAILEY_API_TOKEN?.trim();
    if (!tok) {
        throw new Error(
            "DAILEY_API_TOKEN not set — image presigns won't work. " +
            "Set it via `dailey env set DAILEY_API_TOKEN=<token>` " +
            "(get the token value from `cat ~/Library/Preferences/dailey-nodejs/config.json`).",
        );
    }
    return tok;
}

/**
 * Return a presigned GET URL for the given object key in the project bucket.
 * Cached so a page rendering 50 word cards doesn't make 50 Dailey API calls.
 */
export async function presignDownload(key: string): Promise<string> {
    const cached = cache.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
        console.log(`[presign] cache hit: ${key}`);
        return cached.url;
    }

    const tokenLen = process.env.DAILEY_API_TOKEN?.trim().length ?? 0;
    console.log(`[presign] cache miss: ${key} (token len: ${tokenLen})`);

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
        console.error(`[presign] Dailey API ${res.status}: ${body.slice(0, 200)}`);
        // Don't cache failures — a transient 500 shouldn't blackhole the key
        // for the next 50 minutes.
        throw new Error(`Dailey presign failed: ${res.status} ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as { download_url?: string; url?: string };
    const url = data.download_url || data.url;
    if (!url) {
        console.error(`[presign] no URL in response: ${JSON.stringify(data).slice(0, 200)}`);
        throw new Error("Dailey presign returned no URL");
    }

    console.log(`[presign] ok: ${key}`);
    cache.set(key, { url, expiresAt: now + CACHE_TTL_MS });
    return url;
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
