// Environment access, validated once at module load.
//
// This exists because of a specific failure that already cost this project time: Vercel's
// "paste .env" flow created the Supabase key clipped, and every check that asked only
// "is it set?" passed. The app built, deployed, and failed at the login form with
// "email and password do not match" — a message about the wrong thing entirely.
//
// So these schemas check shape, not presence. A truncated publishable key does not start
// with `sb_publishable_`; a clipped URL is not a URL. Failing at boot with the name of the
// offending variable is worth a great deal more than failing later somewhere unrelated.

import { z } from "zod";

const publicEnv = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({
    error: "must be the project URL, e.g. https://<ref>.supabase.co",
  }),
  // The modern key format. The legacy anon JWT (`eyJ…`) still works against Supabase but
  // is deliberately rejected here: D-027 moved this project onto publishable keys, and
  // silently accepting the old one would let the two drift apart unnoticed.
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().startsWith("sb_publishable_", {
    error: "must be a modern publishable key, not the legacy anon JWT (D-027)",
  }),
  NEXT_PUBLIC_UNIVERSITY_EMAIL_DOMAIN: z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, {
    error: "must be a bare domain, e.g. upsamail.edu.gh — no scheme, no @",
  }),
});

// Referenced by their full names rather than destructured from process.env, because
// Next.js inlines NEXT_PUBLIC_* by literal text substitution at build time. A dynamic
// lookup would be replaced with nothing at all in the browser bundle.
const parsed = publicEnv.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_UNIVERSITY_EMAIL_DOMAIN: process.env.NEXT_PUBLIC_UNIVERSITY_EMAIL_DOMAIN,
});

if (!parsed.success) {
  const problems = parsed.error.issues
    .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Environment is not usable:\n${problems}`);
}

export const env = parsed.data;
