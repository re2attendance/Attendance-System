// Signup identity rules, shared client and server.
//
// Every rule here already exists as a constraint in migration 0004. That is deliberate and
// the order matters: the database constraint is what makes the rule *true* — it cannot be
// forgotten by a future code path and cannot race — and these schemas exist so the student
// gets a sentence instead of a Postgres error code (AGENTS.md).
//
// If one of these ever disagrees with 0004, 0004 wins and this file is the bug.

import { z } from "zod";

import { env } from "@/lib/env";

// profiles_index_is_7_digits
export const INDEX_NUMBER = /^[0-9]{7}$/;

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

// Supabase Auth's own minimum is 6, which is too low for an account that owns an
// attendance record. Not a constraint in 0004 because passwords never reach our tables.
export const password = z
  .string()
  .min(8, { error: "Use at least 8 characters." })
  .max(72, { error: "Passwords are limited to 72 characters." });

// profiles_email_matches_index — "the first 7 digits of the email must match the entered
// student ID" (build plan §6). The check that stops a student registering under someone
// else's index while typing their own into the form.
export const signUp = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(1, { error: "Tell us your full name." })
      .max(120, { error: "That name is too long." }),
    indexNumber,
    email: universityEmail,
    password,
    // guid, not uuid. Zod's `uuid()` enforces the RFC 9562 version and variant bits;
    // Postgres's `uuid` type does not, and accepts any 32 hex digits. The pgTAP fixtures
    // are full of ids like `…-0000000000e1`, and the seeded class list will use
    // hand-picked ones too. Validating more strictly than the database means rejecting a
    // class the database is perfectly happy to hold.
    classId: z.guid({ error: "Choose your class." }),
  })
  .refine((value) => value.email.split("@")[0] === value.indexNumber, {
    path: ["email"],
    error: "Your email must begin with your index number.",
  });

export const signIn = z.object({
  email: universityEmail,
  // Deliberately not `password`: an existing account may predate a rule change, and
  // telling someone their *current* password is too short at the login form helps nobody.
  password: z.string().min(1, { error: "Enter your password." }),
});

export type SignUpInput = z.infer<typeof signUp>;
export type SignInInput = z.infer<typeof signIn>;
