// Session refresh on every request.
//
// **This file is `proxy.ts`, not `middleware.ts`.** Next.js 16 renamed the convention and
// the exported function; every Supabase SSR guide still shows `middleware.ts`, and that
// file is silently ignored here — no error, just an app where sessions expire and users
// are logged out mid-lecture. See node_modules/next/dist/docs/01-app/02-guides/upgrading/
// version-16.md. The `proxy` runtime is nodejs and cannot be configured to edge.
//
// Auth tokens are short-lived. Without something refreshing them on each request, a
// Server Component reads an expired token and treats a signed-in student as a stranger.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Written to both: the request, so anything rendering later in this same pass
          // sees the refreshed session, and the response, so the browser keeps it.
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser(), not getSession(). getSession() reads the cookie and believes it; getUser()
  // asks the Auth server whether the token is genuine. On a system whose whole purpose is
  // that the client cannot be trusted, the difference is the point.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Everything except static assets and image files. Those never need a session, and
  // refreshing on each one would triple the auth traffic for no benefit.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
