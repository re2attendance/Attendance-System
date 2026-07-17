import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Invitation tokens.
 *
 * §8: "Invitation tokens: hashed at rest, single-use, expiring, scoped."
 *
 * The plaintext token exists in exactly two places and never a third: the URL
 * we email, and the browser of whoever opens it. The database stores only a
 * hash, so a leaked database yields no working invitations — which matters more
 * here than it looks, because an invitation is a role grant. A readable
 * `invitations` table with an admin invite in it is an admin account.
 */

/** 32 random bytes, base64url. ~256 bits — not guessable, and URL-safe. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * SHA-256, not bcrypt.
 *
 * Deliberate, and the opposite of the right answer for passwords. Slow hashing
 * exists to defend low-entropy secrets against offline guessing — a human
 * password has maybe 30 bits and needs the work factor. This token has 256 bits
 * of real randomness, so brute force is not on the table and bcrypt would buy
 * nothing but latency on a lookup that must be indexed.
 *
 * Deterministic hashing is also what makes the lookup possible at all: bcrypt
 * salts each hash, so finding a row would mean scanning every invitation and
 * comparing one at a time.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Constant-time comparison, for anywhere two hashes are compared in code.
 *
 * The database lookup is by indexed equality and is not the threat; this is for
 * the paths that compare in JS, where `===` short-circuits on the first
 * differing byte and leaks the prefix through timing.
 */
export function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Invitations expire in 7 days. Long enough to survive a weekend. */
export const INVITE_TTL_DAYS = 7;

export function inviteExpiry(): Date {
  return new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}
