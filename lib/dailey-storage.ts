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

// Runtime token refresh. DAILEY_API_TOKEN gets truncated to 24 chars by
// Dailey's env-injection on new pod starts (the original 1327-char JWT
// arrives mangled), so we can't use the env-baked token directly. Use the
// short, intact DAILEY_EMAIL + DAILEY_PASSWORD to login at runtime and
// hold the resulting JWT in memory.
let cachedToken: { value: string; expiresAt: number } | null = null;
let loginFailedUntil = 0;
let lastLoginError = "";
const TOKEN_REFRESH_TTL_MS = 50 * 60 * 1000;

async function refreshToken(): Promise<string> {
    const now = Date.now();
    if (now < loginFailedUntil) {
        throw new Error(
            `Dailey login circuit-broken until ${new Date(loginFailedUntil).toISOString()}: ${lastLoginError}`,
        );
    }
    const email = process.env.DAILEY_EMAIL?.trim();
    const password = process.env.DAILEY_PASSWORD;
    if (!email || !password) {
        throw new Error("Dailey credentials missing — need DAILEY_EMAIL and DAILEY_PASSWORD");
    }
    const res = await fetch(`${DAILEY_API_BASE}/customers/login`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Dailey-Source": "word-procurement",
        },
        body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        lastLoginError = `${res.status} ${body.slice(0, 200)}`;
        // Circuit-break on 423 (lockout) honoring server's wait-N-minutes hint.
        if (res.status === 423) {
            const m = body.match(/(\d+)\s*minute/);
            const mins = m ? parseInt(m[1], 10) : 15;
            loginFailedUntil = now + (mins + 1) * 60 * 1000;
        } else if (res.status === 401 || res.status === 403) {
            loginFailedUntil = now + 2 * 60 * 1000;
        } else {
            loginFailedUntil = now + 30 * 1000;
        }
        console.error(`[dailey-login] ${lastLoginError} (circuit-break ${(loginFailedUntil - now) / 1000}s)`);
        throw new Error(`Dailey login failed: ${lastLoginError}`);
    }
    const data = (await res.json()) as { access_token?: string; token?: string };
    const tok = data.access_token || data.token;
    if (!tok) throw new Error("Dailey login returned no token");
    cachedToken = { value: tok, expiresAt: now + TOKEN_REFRESH_TTL_MS };
    return tok;
}

async function getToken(): Promise<string> {
    if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
    return refreshToken();
}

/**
 * Ask Dailey's customer API to mint a presigned download URL for the given
 * object key. Cached in-memory for ~50 min to avoid round-tripping per image.
 */
export async function presignDownload(key: string): Promise<string> {
    const cached = cache.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.url;

    const token = await getToken();
    const res = await fetch(
        `${DAILEY_API_BASE}/projects/${PROJECT_ID}/storage/presign-download`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Dailey-Source": "word-procurement",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ key, expires_in_seconds: PRESIGN_TTL_SECONDS }),
        },
    );
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        // Drop the cached token on 401 so the NEXT request re-logins (subject
        // to circuit breaker). Don't retry inline — that's how lockouts happen.
        if (res.status === 401) cachedToken = null;
        console.error(`[dailey-presign] ${res.status} key=${key} body=${body.slice(0, 200)}`);
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
