"use server";

import { redirect } from "next/navigation";

import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import {
  completeProfile as completeProfileSchema,
  emailForIdentifier,
  emailForIndex,
  signInIdentifier,
  signIn as signInSchema,
  signUp as signUpSchema,
} from "@/lib/validation/identity";

export type ActionResult = { error?: string; sent?: boolean } | undefined;

// Validated again here, with the same schema the form used. The client copy exists for
// the message; this copy is the one that counts, because the client is hostile by
// assumption (AGENTS.md) and a form is trivially bypassed.

export async function signInWithPassword(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = signInSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Check your index number and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: emailForIdentifier(parsed.data.identifier),
    password: parsed.data.password,
  });

  if (error) {
    // Deliberately one message for "no such account" and "wrong password". Distinguishing
    // them tells an outsider which index numbers are registered, which is a roster of who
    // attends this university, leaked from a login form.
    return { error: "That index number and password do not match." };
  }

  redirect("/dashboard");
}

export async function signUpWithPassword(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    indexNumber: formData.get("indexNumber"),
    password: formData.get("password"),
    classId: formData.get("classId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details." };
  }

  const { fullName, indexNumber, password, classId } = parsed.data;
  const email = emailForIndex(indexNumber);

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Read back by the profile-creation step after the address is confirmed. Not
      // trusted as-is: the profile row is still written against 0004's constraints, so a
      // tampered index or class cannot produce an identity the database would refuse.
      data: { full_name: fullName, index_number: indexNumber, class_id: classId },
    },
  });

  if (error) {
    // Supabase returns the same shape whether or not the address is already registered,
    // and we keep it that way — see the note above about leaking the roster.
    return { error: "We could not create that account. Check your details and try again." };
  }

  redirect(`/check-email?to=${encodeURIComponent(email)}`);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}

/**
 * Finishes an account that authenticated before it had a profile: one created outside the
 * signup form, or one whose stored details no longer satisfy the schema — a class that has
 * since been deleted, say.
 */
export async function completeProfile(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) redirect("/sign-in");

  const parsed = completeProfileSchema.safeParse({
    fullName: formData.get("fullName"),
    classId: formData.get("classId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details." };
  }

  // The index comes from the confirmed address, never from the form. Typing it would reopen
  // exactly the mismatch that 0004 forbids and that D-069 designed away.
  const indexNumber = user.email.split("@")[0];

  const { error } = await supabase.from("profiles").insert({
    id: user.id,
    full_name: parsed.data.fullName,
    index_number: indexNumber,
    email: user.email,
    class_id: parsed.data.classId,
  });

  if (error) {
    return {
      error:
        "We could not finish setting up your account. Your index number may already be registered.",
    };
  }

  redirect("/dashboard");
}

/**
 * Sends a reset link, and says the same thing whether or not the account exists.
 *
 * A form that confirms "no account with that index number" is a lookup tool for who
 * attends this university, usable by anyone, one guess at a time.
 */
export async function requestPasswordReset(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = signInIdentifier.safeParse(formData.get("identifier"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check that index number." };
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(emailForIdentifier(parsed.data), {
    redirectTo: `${env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
  });

  return { sent: true };
}
