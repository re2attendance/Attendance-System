// The server client, for Server Components, Server Actions and Route Handlers.
//
// A new client per request, never a module-level singleton: it closes over this request's
// cookies, and sharing one across requests would serve one user's session to another.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { env } from "@/lib/env";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
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
            // Server Components cannot set cookies. This is the expected path there, not
            // an error: src/proxy.ts refreshes the session on every request, so the
            // tokens this call would have written are already being persisted.
          }
        },
      },
    },
  );
}
