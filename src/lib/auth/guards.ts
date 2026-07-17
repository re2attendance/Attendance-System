import "server-only";

import { forbidden } from "next/navigation";

import { can, isAdmin, isInstructor, type Action, type Scope } from "./permissions";
import { requireUser, type CurrentUser } from "./session";

/**
 * Route guards. Convenience, not security — see permissions.ts and ADR-005.
 *
 * These stop a student from *landing* on the admin page. They do not stop a
 * student from *reading admin data*, because they were never what was stopping
 * that: RLS is, and it does not consult this file.
 */

export async function requireRole(action: Action, scope?: Scope): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user, action, scope)) forbidden();
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!isAdmin(user)) forbidden();
  return user;
}

export async function requireInstructor(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!isInstructor(user) && !isAdmin(user)) forbidden();
  return user;
}

/**
 * Where this user's app starts.
 *
 * Ordered by authority, so someone holding several roles lands on the most
 * capable surface. The one case that matters is the rep, who is also a student
 * (§4): they get the verify queue because that is the job they logged in to do
 * — reporting their own attendance is two taps from anywhere.
 */
export function homePathFor(user: CurrentUser): string {
  if (isAdmin(user)) return "/admin";
  if (isInstructor(user)) return "/instructor";
  // A LIVE appointment, not the user_roles marker. Someone whose term as rep
  // ended is a student again, and should land on Today rather than on a queue
  // they can no longer work.
  if (user.repSectionIds.length > 0) return "/rep";
  return "/student/today";
}
