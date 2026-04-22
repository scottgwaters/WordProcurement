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
  // Invite links are emailed to recipients who do not yet have accounts,
  // so the token page and its validation/accept APIs must be reachable
  // without a session.
  const isInvitePage = pathname.startsWith("/invite/");
  const isInviteApi = pathname.startsWith("/api/invites/");

  // Allow auth and setup API routes
  if (isAuthApi || isSetupApi) {
    return NextResponse.next();
  }

  // Allow /api/import when it carries a valid bearer token (defense-in-depth alongside route handler check)
  if (isImportApi) {
    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const expected = process.env.IMPORT_API_TOKEN;
    if (bearer && expected && bearer === expected) {
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
