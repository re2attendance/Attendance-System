import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import type { Database } from "@/db/types";
import { createClient } from "@/lib/supabase/server";

export type AppRole = Database["public"]["Enums"]["app_role"];
export type RoleScopeType = Database["public"]["Enums"]["role_scope_type"];

export type RoleGrant = {
  role: AppRole;
  scopeType: RoleScopeType;
  scopeId: string | null;
};

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  institutionId: string;
  matricNumber: string | null;
  avatarPath: string | null;
  status: Database["public"]["Enums"]["profile_status"];
  /** Additive and scoped (§4). A user is Student AND Course Rep at once. */
  roles: RoleGrant[];
};

/**
 * The signed-in user, or null.
 *
 * `cache()` dedupes this per request: a page, its layout, and three components
 * can each ask who the user is and it costs one round-trip. Without it, every
 * `requireUser()` in a tree is another call to the auth server.
 *
 * getUser(), never getSession(). getSession() reads the cookie and does not
 * verify the JWT, so anything built on it trusts a value the client can edit.
 * This is the only place in the app that answers "who is this", so it is the
 * only place that distinction has to be got right.
 */
export const getUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // RLS-enforced: profiles_read_own means this returns their row and no one
  // else's, and user_roles_read_own the same. Even if this query were wrong, it
  // could not read someone else's identity.
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, institution_id, matric_number, avatar_path, status")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("user_roles").select("role, scope_type, scope_id").eq("user_id", user.id),
  ]);

  // An auth.users row with no profile. Real, and worth being loud about rather
  // than treating as logged-out: it means the invite flow half-completed, and
  // silently bouncing them to /login would loop forever — they have a valid
  // session, so login would send them straight back.
  if (!profile) {
    throw new Error(
      `Authenticated user ${user.id} has no profile row. The invite flow did not complete. See docs/RUNBOOK.md.`,
    );
  }

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    institutionId: profile.institution_id,
    matricNumber: profile.matric_number,
    avatarPath: profile.avatar_path,
    status: profile.status,
    roles: (roles ?? []).map((r) => ({
      role: r.role,
      scopeType: r.scope_type,
      scopeId: r.scope_id,
    })),
  };
});

/**
 * The signed-in user, or redirect to login.
 *
 * A convenience, not a gate. It does not protect data — RLS does. What it
 * protects is the experience of a page rendering an empty shell to someone who
 * is not logged in.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}
