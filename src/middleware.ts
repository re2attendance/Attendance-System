import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

/**
 * Session refresh + coarse route protection. NOTHING ELSE.
 *
 * ADR-005: this file is UX, not a security boundary. It exists so users do not
 * land on pages that would be empty, and so their session does not expire
 * mid-lecture. Every piece of data it appears to protect is independently
 * protected by RLS at the database, and every write re-checks authorisation in
 * safe-action.
 *
 * That is not defensive over-documentation. Next.js middleware has a history of
 * auth-bypass CVEs, and structurally a middleware check guards a ROUTE, not
 * DATA — a Server Action or Route Handler does not pass through the page route
 * it appears to sit behind. If this file were the boundary, the boundary would
 * be one header away from gone.
 *
 * So the rule for anything added here: if deleting this file would expose data,
 * the design is wrong. Fix RLS, not the middleware.
 *
 * Deliberately NOT here: fetching roles from the database. Middleware runs on
 * every request including every asset; a query here is a query on the hot path
 * for no security benefit, because the pages themselves check properly. The
 * only question asked is "are you logged in at all", which the refreshed
 * session already answers.
 */

const PUBLIC_ROUTES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/invite",
  "/auth/callback",
  "/auth/confirm",
];

function isPublic(pathname: string) {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  // /dev/* is the design reference (§14 Phase 1). It ships in the tree on
  // purpose and renders no user data — a reference that only exists on a branch
  // stops being true by week three.
  if (pathname.startsWith("/dev/")) return response;

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Come back to where they were trying to go. A student who tapped a
    // "session opened" notification and got bounced to login should land on the
    // session, not the dashboard.
    url.search = "";
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  // Signed in and looking at the login page: send them home rather than showing
  // a form that would sign them in as themselves again.
  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files.
     *
     * The session refresh must run on real navigations, but running it on every
     * .svg is a round-trip to the auth server for a file that has no session.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
