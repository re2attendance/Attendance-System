import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/db/types";
import { env, serverEnv } from "@/lib/env";

/**
 * THE SERVICE-ROLE CLIENT. BYPASSES RLS ENTIRELY.
 *
 * This is the one file in the codebase that can read and write every row
 * belonging to every student in the university. RLS is this product's security
 * boundary (§8, ADR-005); this client is outside it.
 *
 * Reachable ONLY from `src/jobs/*` and `src/app/api/cron/*`. That is enforced,
 * not requested — eslint.config.mjs fences it, and the rule was verified in
 * Phase 1 by importing this from a page and watching the lint fail. (The first
 * version of that rule silently matched nothing, which is why it gets verified
 * rather than trusted.)
 *
 * Three independent locks, because being wrong here is unrecoverable:
 *   1. `import 'server-only'` — a client bundle importing this fails the build.
 *   2. the ESLint boundary — app/* cannot import it at all.
 *   3. serverEnv() throws if it is somehow evaluated in a browser.
 *
 * If you want this in a page or a Server Action, you want lib/supabase/server.ts.
 * The question to ask is "whose data is this, and did they ask for it?" — if
 * there is a user in the answer, their JWT should be doing the work. The
 * legitimate uses are the ones with no user at all:
 *
 *   · close-sessions writes absences for students who are not logged in
 *   · generate-sessions creates rows nobody requested
 *   · the invite flow creates an auth user for someone who has no account yet
 *   · the notification queue reads across users to send mail
 *
 * Its power still stops at the triggers: audit_log and
 * attendance_rule_snapshots reject UPDATE and DELETE for everyone, service_role
 * included (0010). A trigger is not RLS and does not care who you are.
 */
export function createAdminClient() {
  const { SUPABASE_SERVICE_ROLE_KEY } = serverEnv();

  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        // No session, ever. This client is not a user and must not pick one up
        // from anywhere — persisting or refreshing a session here would let a
        // request's identity leak into a role that ignores RLS.
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );
}
