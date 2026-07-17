import { z } from "zod";

/**
 * One schema per form, used by React Hook Form AND the Server Action.
 *
 * That sharing is the point: the client-side check is a courtesy that saves a
 * round-trip, and the server-side parse is the one that counts. Two schemas
 * would drift, and the drift would always favour the client — which is exactly
 * the thing §8 says never to trust.
 */

export const emailSchema = z
  .string()
  .min(1, "Enter your email address.")
  .email("That does not look like an email address.")
  .transform((v) => v.trim().toLowerCase());

/**
 * Length only, deliberately.
 *
 * Composition rules ("one uppercase, one symbol") push people towards
 * Password1! and towards writing it down — NIST 800-63B has recommended
 * against them since 2017. Length is the thing that actually helps, and
 * Supabase Auth handles the hashing.
 *
 * 8 is Supabase's own default minimum; raising it here without raising it
 * there would produce a client-side error the server disagrees with.
 */
export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Passwords are limited to 72 characters."); // bcrypt truncates past 72

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
  /**
   * Where to go after signing in. Validated as a relative path in the action —
   * an unchecked `next` is an open-redirect: a link to our login page that
   * bounces to an attacker's clone, with our domain in the address bar.
   */
  next: z.string().optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "The two passwords do not match.",
    path: ["confirmPassword"],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/**
 * Is this a safe place to send someone after login?
 *
 * Only same-origin relative paths. Rejects absolute URLs, protocol-relative
 * `//evil.com` (which browsers treat as absolute), and anything with a
 * backslash — some parsers normalise `\` to `/` and disagree about the host.
 */
export function safeNextPath(next: string | undefined | null): string | null {
  if (!next) return null;
  if (!next.startsWith("/")) return null;
  if (next.startsWith("//")) return null;
  if (next.includes("\\")) return null;
  return next;
}
