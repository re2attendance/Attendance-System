"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { homePathFor } from "@/lib/auth/guards";
import { getUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { authedAction } from "@/lib/safe-action";
import { createClient } from "@/lib/supabase/server";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  safeNextPath,
} from "./schemas";

/**
 * Sign in.
 *
 * NOT via safe-action, and this is the one legitimate exception: that chain
 * begins with "the caller must be authenticated", and this is the action that
 * makes them so. It is small enough to read in full, which is the price of
 * living outside the chain.
 */
export async function login(input: unknown) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Check the form and try again." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Deliberately the same message for "no such account" and "wrong password".
    // Distinguishing them turns this form into an account-enumeration oracle:
    // an attacker learns which of 10,000 students exist by watching which
    // message comes back.
    //
    // §11.7 wants errors that say what happened and what to do. This is the one
    // place that rule loses to a stronger one, and "check them and try again"
    // is the most we can honestly say.
    return {
      error: "That email and password do not match. Check them and try again.",
    };
  }

  const user = await getUser();
  if (!user) {
    return {
      error: "Signed in, but your profile could not be loaded. Contact an administrator.",
    };
  }

  const next = safeNextPath(parsed.data.next);
  revalidatePath("/", "layout");
  redirect(next ?? homePathFor(user));
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

/**
 * Send a password-reset link.
 *
 * Always reports success, even for an address with no account — same
 * enumeration argument as login. The person who owns the address finds out; a
 * stranger probing addresses learns nothing.
 */
export async function requestPasswordReset(input: unknown) {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Enter a valid email address." };
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/reset-password`,
  });

  return { ok: true };
}

/**
 * Set a new password.
 *
 * Uses safe-action: by the time someone lands here they hold a recovery session
 * from the emailed link, so they ARE authenticated. The chain applies normally
 * and this is audited like anything else.
 */
export const resetPassword = authedAction
  .metadata({
    name: "reset-password",
    audit: { action: "auth.password_reset", entityType: "profile" },
  })
  .inputSchema(resetPasswordSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { error } = await ctx.supabase.auth.updateUser({
      password: parsedInput.password,
    });

    if (error) {
      throw new AppError(
        error.message ||
          "That password could not be set. Try a longer one, or request a new link.",
      );
    }

    return { id: ctx.user.id };
  });
