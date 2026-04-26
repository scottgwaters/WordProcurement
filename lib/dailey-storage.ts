// Server-side helper for talking to Dailey Storage via the customer-API
// presign path.
//
// Auth uses the project's DAILEY_API_TOKEN env var. Per Dailey's
// 2026-04-25 backend update, the duplicate-row bug that was causing this
// token to arrive at the pod truncated to 24 chars is fixed for existing
// values — confirmed via `dailey env runtime-list`: DAILEY_API_TOKEN
// is now 1327 chars on the pod, intact.
//
// We deliberately don't use email+password runtime login here. Earlier
// in the day's debug cycle that path tripped a 423 lockout when
// DAILEY_PASSWORD on the deployment didn't match, and the lockout
// extended on every subsequent image request. With DAILEY_API_TOKEN
// stable, there's no need.
//
// We deliberately don't use the SDK + S3_* env vars path either —
// despite @aws-sdk/client-s3 being in package.json (per docs, that
// should auto-inject S3_* vars), runtime-list confirms no S3_* vars
// are present in our pod. Filed with Dailey; this path was never
// reaching us.
const DAILEY_API_BASE = process.env.DAILEY_API_URL || "https://os.dailey.cloud/api";
const PROJECT_ID = "fd5c82d9-1fd1-4f27-b10e-dd6ce36f1859";
const PRESIGN_TTL_SECONDS = 3600;
const CACHE_TTL_MS = 50 * 60 * 1000;

type CachedPresign = { url: string; expiresAt: number };
const cache = new Map<string, CachedPresign>();

function getToken(): string {
    const tok = process.env.DAILEY_API_TOKEN?.trim();
    if (!tok) {
        throw new Error(
            "DAILEY_API_TOKEN missing from pod env. Set it via the Dailey dashboard.",
        );
    }
    if (tok.length < 100) {
        // Defense against the env-truncation regression: a real Dailey JWT is
        // 1000+ chars. Anything shorter is the truncated stub from the dup-row
        // bug and won't authenticate. Fail fast with a clear hint.
        throw new Error(
            `DAILEY_API_TOKEN looks truncated (${tok.length} chars; expect ~1327). ` +
            `Likely the duplicate-row env-injection bug. Re-set via dashboard and restart pod.`,
        );
    }
    return tok;
}

/**
 * Ask Dailey's customer API to mint a presigned download URL for the
 * given object key. Cached in-memory for ~50 min so a Review-Queue
 * page render doesn't make 50 API calls per image.
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
