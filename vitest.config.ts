import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirrors the `@/*` path in tsconfig.json. Hand-written rather than pulled from
    // tsconfig by a plugin: one alias is not worth another dependency.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // src/lib/env.ts validates the environment at import and throws if it is unusable,
    // which is the behaviour we want in the app and would otherwise make every unit test
    // fail on an unrelated error. These are syntactically valid stand-ins; no test asserts
    // against them, and nothing here reaches a real Supabase project.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      NEXT_PUBLIC_UNIVERSITY_EMAIL_DOMAIN: "upsamail.edu.gh",
    },
  },
});
