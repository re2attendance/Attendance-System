import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

/**
 * Import boundaries are enforced here, not by vibes (structure doc, "Conventions").
 *
 * The one that matters: lib/supabase/admin.ts holds the service-role client and
 * bypasses RLS, which is this system's actual security boundary (§8). It is
 * reachable only from jobs/* and app/api/cron/*. Everything else — every page,
 * every Server Action, every query — goes through the cookie-bound client that
 * carries the user's JWT.
 *
 * Most of these paths do not exist yet. That is the point: the rules land in
 * Phase 1 so there is never a window in which they could be violated, and so
 * Phase 2 onward cannot introduce the mistake in the first place.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),

  {
    plugins: { boundaries },
    settings: {
      "boundaries/dependency-nodes": ["import", "dynamic-import", "require"],
      "boundaries/include": ["src/**/*.{ts,tsx}"],
      // Order matters: the first matching pattern wins, so the narrow,
      // privileged elements are declared before the broad ones.
      "boundaries/elements": [
        {
          type: "supabase-admin",
          mode: "full",
          pattern: "src/lib/supabase/admin.ts",
        },
        {
          // ADR-001 removed Prisma. This stays as a tripwire: if anyone
          // reintroduces a privileged Prisma client, it is fenced from birth.
          type: "prisma",
          mode: "full",
          pattern: "src/db/prisma.ts",
        },
        { type: "cron", mode: "full", pattern: "src/app/api/cron/**/*" },
        { type: "jobs", mode: "full", pattern: "src/jobs/**/*" },
        {
          type: "attendance-rules",
          mode: "full",
          pattern: "src/features/attendance/rules/**/*",
        },
        {
          // A feature has TWO entry points, and the split is forced by Next's
          // module graph (ADR-013): index.ts is client-safe, server.ts is the
          // surface that carries `server-only`. A barrel that mixes them drags
          // next/headers into a browser bundle.
          type: "feature-index",
          mode: "full",
          pattern: "src/features/*/{index,server}.ts",
          capture: ["feature"],
        },
        {
          type: "feature-internal",
          mode: "full",
          pattern: "src/features/*/**/*",
          capture: ["feature"],
        },
        { type: "app", mode: "full", pattern: "src/app/**/*" },
        { type: "components", mode: "full", pattern: "src/components/**/*" },
        { type: "lib", mode: "full", pattern: "src/lib/**/*" },
        { type: "db", mode: "full", pattern: "src/db/**/*" },
      ],
    },
    rules: {
      "boundaries/element-types": [
        "error",
        {
          default: "allow",
          rules: [
            {
              from: ["*"],
              disallow: ["supabase-admin", "prisma"],
              message:
                "The service-role client bypasses RLS. It is importable only from jobs/* and app/api/cron/*. In a request path, use lib/supabase/server.ts, which carries the user's JWT and is RLS-enforced.",
            },
            {
              from: ["jobs", "cron", "supabase-admin"],
              allow: ["supabase-admin", "prisma"],
            },
            {
              from: ["attendance-rules"],
              disallow: [
                "app",
                "components",
                "feature-index",
                "feature-internal",
                "lib",
                "db",
                "jobs",
                "cron",
              ],
              message:
                "features/attendance/rules/* is a library: pure, no I/O, no clock, no app imports. deriveStatus must stay a pure function of its inputs — it is the single source of truth for status and is shared by the server and the client preview.",
            },
            {
              from: ["feature-internal", "feature-index"],
              disallow: [["feature-internal", { feature: "!${from.feature}" }]],
              message:
                "Import another feature only through its index.ts (its public surface), never its internals.",
            },
          ],
        },
      ],
    },
  },

  {
    // The token mirror and its verifier are the one sanctioned home for hex
    // literals outside globals.css. tokens.test.ts proves they agree.
    files: ["src/lib/tokens.ts", "src/lib/contrast.ts"],
    rules: {},
  },
]);

export default eslintConfig;
