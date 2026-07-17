import type { AppRole, CurrentUser, RoleScopeType } from "./session";

/**
 * can(user, action, scope) — MIRRORS RLS. NEVER REPLACES IT.
 *
 * This exists for one job: letting the UI hide a button the user cannot use.
 * It is not access control. Every question it answers is answered again, for
 * real, by a policy in 0011 when the query runs.
 *
 * **If can() and RLS disagree, RLS is right and can() is the bug.** The drift is
 * always a UI defect — a button that 403s, or a button that should have been
 * there — and never a data breach, because the database does not consult this
 * file. That asymmetry is what makes duplicating the logic acceptable: the
 * copy cannot fail open.
 *
 * Two things this deliberately does NOT do:
 *
 *   · check appointment periods. auth_is_active_rep_for_section() does that in
 *     the database against now(). Reproducing time-window logic here would put
 *     a clock in the UI layer, and the UI's clock is the one thing §5 says not
 *     to trust. A rep whose appointment expired mid-session sees a button that
 *     stops working; that is the correct failure.
 *   · check the conflict-of-interest rule. Hiding "Approve" on your own record
 *     is cosmetic; the RLS policy is what stops it, and it is tested.
 */

export type Action =
  | "course.manage"
  | "section.manage"
  | "session.manage"
  | "attendance.decide"
  | "calendar.declare.section"
  | "calendar.declare.institution"
  | "rep.appoint"
  | "user.manage"
  | "report.export"
  | "audit.read";

export type Scope = { type: RoleScopeType; id: string | null };

const GLOBAL: Scope = { type: "global", id: null };

function hasRole(user: CurrentUser, role: AppRole, scope: Scope = GLOBAL): boolean {
  return user.roles.some(
    (g) =>
      g.role === role &&
      // A global grant answers for every scope. This is how admin works, and it
      // matches auth_has_role()'s SQL exactly — the two must agree or the UI
      // lies.
      (g.scopeType === "global" ||
        (g.scopeType === scope.type && g.scopeId === scope.id)),
  );
}

export function isAdmin(user: CurrentUser): boolean {
  return hasRole(user, "admin");
}

export function isInstructor(user: CurrentUser): boolean {
  return hasRole(user, "instructor");
}

/**
 * Holds a rep grant for this section.
 *
 * Note the name: `holds`, not `is`. The grant is in user_roles, but the
 * AUTHORITY is in course_rep_assignments with its appointment period, and only
 * the database checks that. This answers "should the UI show rep controls",
 * not "may they act".
 */
export function holdsRepGrantForSection(user: CurrentUser, sectionId: string): boolean {
  return user.roles.some(
    (g) =>
      g.role === "course_rep" &&
      g.scopeType === "class_section" &&
      g.scopeId === sectionId,
  );
}

export function can(user: CurrentUser, action: Action, scope?: Scope): boolean {
  // A suspended or withdrawn student can do nothing but look. Mirrors nothing
  // in RLS today — the policies do not check profile status — so this is UI
  // courtesy, and the real enforcement for a suspended account is that admin
  // revokes their roles.
  if (user.status !== "active" && action !== "audit.read") {
    if (!isAdmin(user)) return false;
  }

  if (isAdmin(user)) return true;

  switch (action) {
    case "user.manage":
    case "audit.read":
    case "calendar.declare.institution":
      // Admin only, and admin already returned true above. ADR-012: an
      // institution-wide declaration closes the university, so a rep — who is a
      // student — cannot make one.
      return false;

    case "course.manage":
    case "section.manage":
    case "rep.appoint":
      // §4: the instructor owns courses and appoints reps. A rep cannot appoint
      // a rep, or the grant is self-propagating.
      return isInstructor(user);

    case "session.manage":
    case "attendance.decide":
    case "calendar.declare.section":
      // Rep or instructor, for a specific section.
      if (!scope || scope.type !== "class_section" || !scope.id) return false;
      return isInstructor(user) || holdsRepGrantForSection(user, scope.id);

    case "report.export":
      return isInstructor(user);

    default: {
      // Exhaustiveness: a new Action that nobody taught this function about
      // fails to compile, rather than silently returning false and hiding a
      // button forever.
      const _never: never = action;
      return _never;
    }
  }
}
