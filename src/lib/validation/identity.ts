// Signup and sign-in rules, shared client and server.
//
// Every rule here already exists as a constraint in migration 0004. That order matters:
// the constraint is what makes the rule *true* — it cannot be forgotten by a future code
// path and cannot race — and these schemas exist so the student reads a sentence instead
// of a Postgres error code (AGENTS.md). If one ever disagrees with 0004, 0004 wins and
// this file is the bug.

import { z } from "zod";

import { env } from "@/lib/env";

// profiles_index_is_7_digits
export const INDEX_NUMBER = /^[0-9]{7}$/;

/** The address 0004 would build for this index. */
export function emailForIndex(indexNumber: string): string {
  return `${indexNumber}@${env.NEXT_PUBLIC_UNIVERSITY_EMAIL_DOMAIN}`.toLowerCase();
}

export const indexNumber = z
  .string()
  .trim()
  .regex(INDEX_NUMBER, { error: "An index number is exactly 7 digits." });

// profiles_email_shape, with the domain pinned to this institution. 0004 enforces the
// shape; the specific domain is configuration, so it is enforced here and at signup.
export const universityEmail = z
  .email({ error: "That is not a valid email address." })
  .trim()
  .toLowerCase()
  .refine((value) => value.endsWith(`@${env.NEXT_PUBLIC_UNIVERSITY_EMAIL_DOMAIN}`), {
    error: `Use your university email, ending in @${env.NEXT_PUBLIC_UNIVERSITY_EMAIL_DOMAIN}.`,
  });

// Supabase Auth's own floor is 6, which is too low for an account that owns an
// attendance record. Not a constraint in 0004 because passwords never reach our tables.
export const password = z
  .string()
  .min(8, { error: "Use at least 8 characters." })
  .max(72, { error: "Passwords are limited to 72 characters." });

// Note what is absent: an email field.
//
// 0004 requires the email prefix to equal the index number (profiles_email_matches_index).
// Asking for both and rejecting the mismatch is the obvious build and the wrong one — it
// invents an error the student then has to understand. Instead the index is the only
// identity typed, and the address is derived from it (D-069), so the mismatch has nowhere
// to happen.
export const signUp = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, { error: "Tell us your full name." })
    .max(120, { error: "That name is too long." }),
  indexNumber,
  password,
  // guid, not uuid. Zod's `uuid()` enforces the RFC 9562 version and variant bits;
  // Postgres's `uuid` type does not, and accepts any 32 hex digits. The pgTAP fixtures
  // are full of ids like `…-0000000000e1`, and the seeded class list will use hand-picked
  // ones too. Validating more strictly than the database means refusing a class the
  // database is perfectly happy to hold.
  classId: z.guid({ error: "Choose your class." }),
});

// One field for both kinds of account. A student types 7 digits; the admin has no index
// number and no profile (0004), so they type the address their account was created with.
// Two labelled fields would make one of them dead weight for everybody.
export const signInIdentifier = z
  .string()
  .trim()
  .toLowerCase()
  .refine((value) => INDEX_NUMBER.test(value) || z.email().safeParse(value).success, {
    error: "Enter your 7-digit index number, or your email address.",
  });

export const signIn = z.object({
  identifier: signInIdentifier,
  // Deliberately not `password`: an account may predate a rule change, and telling
  // someone their *current* password is too short helps nobody at a login form.
  password: z.string().min(1, { error: "Enter your password." }),
});

/** What Supabase Auth is given, whichever of the two the person typed. */
export function emailForIdentifier(identifier: string): string {
  const value = identifier.trim().toLowerCase();
  return INDEX_NUMBER.test(value) ? emailForIndex(value) : value;
}

// Google proves the address and supplies a name, but cannot know which class someone is
// in. This is the gap it leaves — and note there is still no index field: it is read from
// the address Google proved, never typed.
export const completeProfile = signUp.pick({ fullName: true, classId: true });

export type SignUpInput = z.infer<typeof signUp>;
export type SignInInput = z.infer<typeof signIn>;
