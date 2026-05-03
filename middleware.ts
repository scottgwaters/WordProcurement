import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;
  const isAuthPage = pathname === "/login";
  const isSetupPage = pathname === "/setup";
  const isAuthApi = pathname.startsWith("/api/auth");
  const isSetupApi = pathname === "/api/setup";
  const isImportApi = pathname === "/api/import";
  const isStorageTestApi = pathname === "/api/storage/test";
  // Decline endpoint accepts the same bearer for batch cleanup runs
  // (duplicate sweeps, etc.) — auth is enforced in-handler too.
  const isDeclineApi =
    /^\/api\/words\/[^/]+\/decline$/.test(pathname);
  // Image-job worker endpoints. The local Python poller carries
  // IMPORT_API_TOKEN to claim/complete jobs; in-handler bearer check
  // re-validates so the middleware bypass is never load-bearing on its own.
  const isImageWorkerApi =
    pathname === "/api/image-jobs/next" ||
    /^\/api\/image-jobs\/[^/]+\/complete$/.test(pathname);
  // Per-word image redirect is intentionally public — the Wordnauts iOS
  // app loads images by word ID with no session, and the underlying
  // presigned URL is itself short-lived and unguessable.
  const isWordImageApi =
    /^\/api\/words\/[^/]+\/image$/.test(pathname);
  // Public read of the verified word catalog — the iOS app fetches this on
  // launch to pick up newly approved words without requiring an app update.
  // Filtered to verified + non-declined inside the handler, no PII present.
  const isWordsExportApi = pathname === "/api/words/export";
  // Invite links are emailed to recipients who do not yet have accounts,
  // so the token page and its validation/accept APIs must be reachable
  // without a session.
  const isInvitePage = pathname.startsWith("/invite/");
  const isInviteApi = pathname.startsWith("/api/invites/");

  // Allow auth and setup API routes
  if (isAuthApi || isSetupApi) {
    return NextResponse.next();
  }

  // Allow /api/import and /api/storage/test when they carry a valid bearer
  // token (defense-in-depth alongside route handler check). The storage-test
  // endpoint is a developer diagnostic that needs to be curl-able from
  // outside a browser session.
  if (isImportApi || isStorageTestApi || isDeclineApi || isImageWorkerApi) {
    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    // Accept either token name. Two values exist on the project (one
    // legacy, one the curator set locally); both are the same trust level
    // — "I'm a trusted CLI/worker, not a browser session." Coalescing them
    // here removes the silent-redirect foot-gun when the two drift.
    const tokens = [process.env.IMPORT_API_TOKEN, process.env.WP_IMPORT_TOKEN].filter(
      (t): t is string => typeof t === "string" && t.length > 0,
    );
    if (bearer && tokens.some((t) => t === bearer)) {
      return NextResponse.next();
    }
  }

  // Allow setup page (it checks internally if setup is needed)
  if (isSetupPage) {
    return NextResponse.next();
  }

  // Allow invite flow: /invite/[token] page and /api/invites/[token] endpoints
  // (token validation + accept). Authorization is enforced in-handler by
  // matching the token, not by the session.
  if (isInvitePage || isInviteApi) {
    return NextResponse.next();
  }

  // Allow public image redirects (no auth — iOS app needs them).
  if (isWordImageApi) {
    return NextResponse.next();
  }

  // Allow public catalog export (no auth — iOS app fetches on launch).
  if (isWordsExportApi) {
    return NextResponse.next();
  }

  // Redirect logged-in users from login page to dashboard
  if (isAuthPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Redirect unauthenticated users to login
  if (!isAuthPage && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
