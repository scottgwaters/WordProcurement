import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isAuthPage = req.nextUrl.pathname === "/login";
  const isSetupPage = req.nextUrl.pathname === "/setup";
  const isAuthApi = req.nextUrl.pathname.startsWith("/api/auth");
  const isSetupApi = req.nextUrl.pathname === "/api/setup";

  // Allow auth and setup API routes
  if (isAuthApi || isSetupApi) {
    return NextResponse.next();
  }

  // Allow setup page (it checks internally if setup is needed)
  if (isSetupPage) {
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
