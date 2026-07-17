import { z } from "zod";

/**
 * Environment, validated at boot.
 *
 * §13 wants `.env.example` fully documented; this is the other half — the thing
 * that makes a missing variable fail the process on startup instead of
 * surfacing as `undefined` three screens deep, at 09:00, for 300 people.
 *
 * Two schemas, deliberately. Next inlines `process.env.NEXT_PUBLIC_*` into the
 * client bundle at build time and leaves everything else server-side, so a
 * single schema parsed in one place would either leak the service-role key into
 * the browser or fail to validate on the client. Splitting them is what makes
 * the boundary a type error rather than a habit.
 */

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
});

/* Referenced explicitly, not by index. Next's build-time inlining replaces
   `process.env.NEXT_PUBLIC_FOO` as a literal string — it cannot see through
   `process.env[key]`, so a loop here would compile to undefined in the browser
   and the failure would look like a config problem rather than a bundler one. */
export const env = clientSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

/**
 * Server-only environment. Throws if called from the browser.
 *
 * A function rather than a constant so it is evaluated on use: a module-level
 * `serverSchema.parse(...)` would run wherever this file is imported, and one
 * accidental client import would either crash the browser or — worse — succeed
 * and ship the service-role key.
 *
 * This is belt to lib/supabase/admin.ts's braces. That file has
 * `import 'server-only'` and an ESLint fence; this throws at runtime if both
 * are somehow defeated. The service-role key bypasses RLS, which is this
 * product's entire security boundary, so it gets three independent locks.
 */
export function serverEnv() {
  if (typeof window !== "undefined") {
    throw new Error(
      "serverEnv() was called in the browser. This reads SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS and must never leave the server.",
    );
  }

  return serverSchema.parse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    NODE_ENV: process.env.NODE_ENV,
  });
}
