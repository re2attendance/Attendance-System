import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/db/types";
import { env } from "@/lib/env";

/**
 * Refreshes the auth session on every request and returns both the response
 * carrying the refreshed cookies and the verified user.
 *
 * Server Components cannot set cookies, so this is the only place a rotated
 * refresh token can actually be written back. Skip it and sessions expire
 * mid-use: a student's app logs them out while they are standing in the lecture
 * hall with two minutes of present-window left.
 *
 * getUser(), never getSession(). getSession() decodes the cookie without
 * verifying it, so anything derived from it is attacker-controlled. getUser()
 * round-trips to the auth server and validates the JWT. In middleware — the one
 * place that runs before every route — the difference is the whole point.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Written to the request first so anything downstream in THIS request
          // sees the fresh token, then to a new response so the browser keeps
          // it. Missing either half is the classic @supabase/ssr bug: the
          // session appears to work and then randomly does not.
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user, supabase };
}
