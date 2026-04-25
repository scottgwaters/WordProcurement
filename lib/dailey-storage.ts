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
const TOKEN_REFRESH_TTL_MS = 50 * 60 * 1000;

type CachedPresign = { url: string; expiresAt: number };
const cache = new Map<string, CachedPresign>();

// Runtime-refreshed Dailey access token. We can't use DAILEY_API_TOKEN from
// env because Dailey's env-injection path silently truncates long JWT values
// (1327-char tokens arrive as 24-char fragments to the pod). Instead we log
// in at runtime with email+password the same way the dailey CLI does, cache
// the resulting JWT in-memory, and refresh before it expires. Bug filed
// with Dailey — see dailey-env-truncation-bug.md in the Wordnauts repo.
let cachedToken: { value: string; expiresAt: number } | null = null;
// Circuit breaker: if a login attempt fails with a lockout or bad-creds
// response, remember the failure so every incoming image request doesn't
// re-hammer /customers/login. Without this, a wrong password floods Dailey's
// auth endpoint, trips their 423 lockout, and every subsequent request
// extends the lockout window.
let loginFailedUntil = 0;
let lastLoginError = "";

async function refreshToken(): Promise<string> {
    const now = Date.now();
    if (now < loginFailedUntil) {
        throw new Error(
            `Dailey login circuit-broken until ${new Date(loginFailedUntil).toISOString()} — last error: ${lastLoginError}`,
        );
    }
    const email = process.env.DAILEY_EMAIL?.trim();
    const password = process.env.DAILEY_PASSWORD;
    if (!email || !password) {
        throw new Error(
            "Dailey credentials missing. Set DAILEY_EMAIL and DAILEY_PASSWORD " +
            "env vars on the deployment.",
        );
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
        // 423 is "locked out, try again in N minutes" — honor the hint if
        // Dailey provides one, otherwise back off for 15 min.
        if (res.status === 423) {
            const minMatch = body.match(/(\d+)\s*minute/);
            const mins = minMatch ? parseInt(minMatch[1], 10) : 15;
            loginFailedUntil = now + (mins + 1) * 60 * 1000;
        } else if (res.status === 401 || res.status === 403) {
            // Bad creds (probably). Pause 2 min so we don't burn through to 423.
            loginFailedUntil = now + 2 * 60 * 1000;
        } else {
            loginFailedUntil = now + 30 * 1000;
        }
        console.error(`[dailey-login] ${lastLoginError} (circuit-break until ${new Date(loginFailedUntil).toISOString()})`);
        throw new Error(`Dailey login failed: ${lastLoginError}`);
    }
    const data = (await res.json()) as { access_token?: string; token?: string };
    const tok = data.access_token || data.token;
    if (!tok) throw new Error("Dailey login returned no access token");
    cachedToken = { value: tok, expiresAt: now + TOKEN_REFRESH_TTL_MS };
    return tok;
}

async function getToken(): Promise<string> {
    if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
    return refreshToken();
}

/**
 * Return a presigned GET URL for the given object key in the project bucket.
 * Cached so a page rendering 50 word cards doesn't make 50 Dailey API calls.
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
    // No auto-retry on 401 here. If the token is bad, the circuit breaker in
    // refreshToken() handles backoff. Retrying mid-request turned into a
    // login-flood loop and tripped Dailey's rate limiter.
    if (!res.ok) {
        // On a 401 from the presign endpoint, drop the cached token so the
        // next request gets a fresh one via refreshToken() (subject to the
        // circuit breaker). Don't retry inline.
        if (res.status === 401) cachedToken = null;

        const body = await res.text().catch(() => "");
        // Don't cache failures — a transient 500 shouldn't blackhole the key
        // for the next 50 minutes.
        throw new Error(`Dailey presign failed: ${res.status} ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as { download_url?: string; url?: string };
    const url = data.download_url || data.url;
    if (!url) throw new Error("Dailey presign returned no URL");

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
