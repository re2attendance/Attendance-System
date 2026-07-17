import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/db/types";
import { env } from "@/lib/env";

/**
 * THE DEFAULT CLIENT. Cookie-bound, carries the user's JWT, RLS-enforced.
 *
 * Every request-scoped read and write in this product goes through here: RSC
 * queries, Server Actions, Route Handlers that act on a user's behalf. If you
 * are reaching for `admin.ts` instead, you are almost certainly designing
 * something wrong — see its header.
 *
 * `getUser()` on this client is the only trustworthy way to identify the
 * caller. `getSession()` reads the cookie and does not verify it, so it can be
 * spoofed; getUser() round-trips to the auth server and validates the JWT.
 * lib/auth/session.ts wraps this so nothing has to remember the distinction.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. This is expected and
            // harmless: middleware refreshes the session on every request, so
            // the write that matters already happened there. Swallowing it here
            // is the documented @supabase/ssr pattern — the alternative is
            // every RSC read throwing on a token refresh.
          }
        },
      },
    },
  );
}
