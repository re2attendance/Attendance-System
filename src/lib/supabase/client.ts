import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/db/types";
import { env } from "@/lib/env";

/**
 * The browser client. Carries the user's JWT from the cookie, so every query it
 * makes is RLS-enforced — it can only ever see what the policies allow.
 *
 * Use this only where the browser genuinely needs to talk to the database:
 * Realtime subscriptions (the rep queue) and TanStack Query surfaces. Reads
 * belong in `features/<x>/queries.ts` on the server, and writes belong in a
 * Server Action via safe-action, where the auth → zod → authz → audit chain
 * runs. A read here skips nothing dangerous; a write here skips the audit.
 */
export function createClient() {
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
