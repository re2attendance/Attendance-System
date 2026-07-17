"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { homePathFor } from "@/lib/auth/guards";
import { getUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { authedAction } from "@/lib/safe-action";
import { createClient } from "@/lib/supabase/server";
import { acceptInviteSchema, createInvitationSchema } from "./schemas";
import { generateToken, hashToken, inviteExpiry } from "./tokens";

/**
 * Create an invitation.
 *
 * The insert is RLS-enforced: invitations_admin lets admin do anything, and
 * invitations_instructor lets an instructor invite reps and students into their
 * own sections and nothing else — notably not an admin (0011). So this action
 * does not re-check who may invite whom; the database does, and it is tested.
 *
 * Returns the accept URL. Phase 9 emails it; until then it is shown to whoever
 * created the invitation, which is a real workflow (read it out, paste it into
 * WhatsApp) and not a placeholder.
 */
export const createInvitation = authedAction
  .metadata({
    name: "create-invitation",
    audit: { action: "invitation.created", entityType: "invitation" },
  })
  .inputSchema(createInvitationSchema)
  .action(async ({ parsedInput, ctx }) => {
    // The plaintext exists in this function and in the returned URL. It is
    // never written anywhere.
    const token = generateToken();

    const { data, error } = await ctx.supabase
      .from("invitations")
      .insert({
        institution_id: ctx.user.institutionId,
        email: parsedInput.email,
        role: parsedInput.role,
        scope_type: parsedInput.scopeType,
        scope_id: parsedInput.scopeId,
        token_hash: hashToken(token),
        expires_at: inviteExpiry().toISOString(),
        invited_by: ctx.user.id,
      })
      .select("id, email, role, expires_at")
      .single();

    if (error) {
      // 42501 is RLS refusing — an instructor trying to mint an admin, or to
      // invite into someone else's section. The database already made the
      // decision; this only translates it into something a person can read.
      if (error.code === "42501") {
        throw new AppError("You cannot create that invitation.");
      }
      throw new AppError(`Could not create the invitation: ${error.message}`);
    }

    revalidatePath("/admin/users");

    return {
      id: data.id,
      email: data.email,
      role: data.role,
      expiresAt: data.expires_at,
      acceptUrl: `${env.NEXT_PUBLIC_SITE_URL}/invite/${token}`,
    };
  });

/**
 * Accept an invitation: create the account, then claim the grant.
 *
 * NOT via safe-action — like login, this is the action that makes someone
 * authenticated, so it cannot begin by requiring it.
 *
 * Two steps, in this order, and the order matters:
 *
 *   1. signUp() with the ANON key creates the auth user and returns a session.
 *      Deliberately not the service-role client: admin.ts is fenced to jobs and
 *      cron, and this needed no exception.
 *   2. accept_invitation() runs as that brand-new user (auth.uid() is them) and
 *      creates the profile + role grants from the invitation.
 *
 * Step 2 can fail after step 1 succeeds — a race with someone else opening the
 * same link, or a mismatched email. That leaves an auth user with no profile,
 * which getUser() throws on rather than silently treating as logged-out. The
 * alternative (create the profile first) is not available: profiles.id
 * references auth.users, so the account must exist first. Handled below by
 * signing them back out, so they land on the invite page with an error rather
 * than in a broken half-session.
 */
export async function acceptInvitation(input: unknown) {
  const parsed = acceptInviteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Check the form and try again." };
  }

  const supabase = await createClient();

  const { data: invitation } = await supabase
    .rpc("get_invitation_by_token_hash", {
      p_token_hash: hashToken(parsed.data.token),
    })
    .maybeSingle();

  if (!invitation || !invitation.is_valid) {
    return {
      error:
        "This invitation link is no longer valid. Ask whoever invited you to send a new one.",
    };
  }

  // The email comes from the INVITATION, never from the form. A form field
  // would let whoever holds the link attach the grant to an address of their
  // choosing — and an invitation is a role grant.
  const { error: signUpError } = await supabase.auth.signUp({
    email: invitation.email,
    password: parsed.data.password,
  });

  if (signUpError) {
    if (signUpError.message.toLowerCase().includes("already registered")) {
      return {
        error:
          "An account already exists for this email. Sign in instead, and ask an administrator to add the role.",
      };
    }
    return { error: signUpError.message };
  }

  const { error: acceptError } = await supabase.rpc("accept_invitation", {
    p_token_hash: hashToken(parsed.data.token),
    p_full_name: parsed.data.fullName,
  });

  if (acceptError) {
    // The account now exists with no profile. Sign them out so they are not
    // stranded in a session getUser() will throw on, and tell them plainly.
    await supabase.auth.signOut();
    return {
      error:
        "Your account was created but the invitation could not be claimed — it may have just been used. Ask for a new invitation.",
    };
  }

  const user = await getUser();
  revalidatePath("/", "layout");
  redirect(user ? homePathFor(user) : "/login");
}
