import { describe, expect, it } from "vitest";

import {
  can,
  isActiveRepForSection,
  isAdmin,
  isInstructor,
  type Action,
} from "./permissions";
import type { CurrentUser } from "./session";

/**
 * can() is a MIRROR of the RLS policies in 0011. This file pins the mirror.
 *
 * The drift it guards against is benign by construction — if can() and RLS
 * disagree, the user gets a button that 403s or a button that never appears,
 * never a leak, because the database does not consult this file. That asymmetry
 * is the whole reason duplicating the logic is acceptable.
 *
 * But benign is not the same as harmless: a permission model that quietly says
 * "no" to an instructor for a term is a support ticket nobody can reproduce. So
 * the rules are asserted here, in the same words the policies use, and the
 * per-role expectations live beside each other where a disagreement is visible.
 *
 * What this file CANNOT do, and it is worth being honest about: it does not run
 * the SQL. A true parity test would execute both against one fixture, which
 * means a database in the unit suite. The pgTAP suite proves the policies; this
 * proves the mirror reflects what they say. The join between them is human, and
 * §8's rule is the tiebreaker — if these disagree, RLS is right and can() is
 * the bug.
 */

const SECTION_A = "aaaaaaaa-0000-4000-8000-000000000001";
const SECTION_B = "bbbbbbbb-0000-4000-8000-000000000002";

function user(over: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: "11111111-0000-4000-8000-000000000001",
    email: "someone@test.edu",
    fullName: "Someone",
    institutionId: "cccccccc-0000-4000-8000-000000000003",
    matricNumber: null,
    avatarPath: null,
    status: "active",
    roles: [],
    repSectionIds: [],
    ...over,
  };
}

const admin = user({
  id: "admin",
  roles: [{ role: "admin", scopeType: "global", scopeId: null }],
});

const instructor = user({
  id: "instructor",
  roles: [{ role: "instructor", scopeType: "global", scopeId: null }],
});

/* §4's central case: a rep IS a student who also holds a scoped grant.
   Permissions must be ADDITIVE, not a single enum on the profile. */
const repA = user({
  id: "rep-a",
  roles: [
    { role: "student", scopeType: "global", scopeId: null },
    { role: "course_rep", scopeType: "class_section", scopeId: SECTION_A },
  ],
  // The LIVE appointment. This, not the user_roles marker above, is what can()
  // reads — the same source auth_is_active_rep_for_section() consults.
  repSectionIds: [SECTION_A],
});

/* The case that made this refactor necessary: the declarative marker is still
   there, but the appointment has ended. RLS would refuse them; can() must
   agree, or they see rep screens where every button 403s. */
const expiredRep = user({
  id: "expired-rep",
  roles: [
    { role: "student", scopeType: "global", scopeId: null },
    { role: "course_rep", scopeType: "class_section", scopeId: SECTION_A },
  ],
  repSectionIds: [],
});

const student = user({
  id: "student",
  roles: [{ role: "student", scopeType: "global", scopeId: null }],
});

const sectionA = { type: "class_section", id: SECTION_A } as const;
const sectionB = { type: "class_section", id: SECTION_B } as const;

describe("role predicates", () => {
  it("a rep holds both student and course_rep — roles are additive (§4)", () => {
    expect(repA.roles).toHaveLength(2);
    expect(isActiveRepForSection(repA, SECTION_A)).toBe(true);
    expect(isActiveRepForSection(repA, SECTION_B)).toBe(false);
    expect(isAdmin(repA)).toBe(false);
    expect(isInstructor(repA)).toBe(false);
  });

  it("a global grant answers for every scope, matching auth_has_role()'s SQL", () => {
    // 0011: `ur.scope_type = 'global' or (ur.scope_type = p_scope_type and ...)`.
    // This is how admin works, and the two must agree or the UI lies.
    expect(can(admin, "session.manage", sectionA)).toBe(true);
    expect(can(admin, "session.manage", sectionB)).toBe(true);
  });
});

describe("admin does everything (§4)", () => {
  const everything: Action[] = [
    "course.manage",
    "section.manage",
    "session.manage",
    "attendance.decide",
    "calendar.declare.section",
    "calendar.declare.institution",
    "rep.appoint",
    "user.manage",
    "report.export",
    "audit.read",
  ];

  for (const action of everything) {
    it(`admin can ${action}`, () => {
      expect(can(admin, action, sectionA)).toBe(true);
    });
  }
});

describe("the institution-wide declaration is admin's alone (ADR-012)", () => {
  /* THE privilege-escalation rule. A course rep is a student; "reps can declare
     a holiday" must never mean an undergraduate can close the university.
     declare_calendar_event() enforces this server-side and
     rls_calendar_declarations.test.sql proves it — this only keeps the button
     off their screen. */
  it("a rep cannot", () => {
    expect(can(repA, "calendar.declare.institution")).toBe(false);
  });

  it("an instructor cannot", () => {
    expect(can(instructor, "calendar.declare.institution")).toBe(false);
  });

  it("a student cannot", () => {
    expect(can(student, "calendar.declare.institution")).toBe(false);
  });

  it("but a rep CAN declare for the section they hold a grant for", () => {
    expect(can(repA, "calendar.declare.section", sectionA)).toBe(true);
  });

  it("and not for someone else's section", () => {
    expect(can(repA, "calendar.declare.section", sectionB)).toBe(false);
  });
});

describe("section-scoped actions need a section", () => {
  const scoped: Action[] = [
    "session.manage",
    "attendance.decide",
    "calendar.declare.section",
  ];

  for (const action of scoped) {
    it(`${action}: a rep can, for their own section only`, () => {
      expect(can(repA, action, sectionA)).toBe(true);
      expect(can(repA, action, sectionB)).toBe(false);
    });

    it(`${action}: refused with no scope at all, rather than silently allowed`, () => {
      // Failing closed matters: an action whose scope is unknown must not be
      // permitted by default.
      expect(can(repA, action)).toBe(false);
    });

    it(`${action}: a plain student cannot`, () => {
      expect(can(student, action, sectionA)).toBe(false);
    });
  }
});

describe("an EXPIRED appointment grants nothing (§4)", () => {
  /* "only within their appointment period". The user_roles marker is still on
     this user; the appointment is not. can() reads the appointment, so it
     agrees with RLS instead of showing them a screen of dead buttons. */
  it("cannot decide attendance", () => {
    expect(can(expiredRep, "attendance.decide", sectionA)).toBe(false);
  });

  it("cannot manage sessions", () => {
    expect(can(expiredRep, "session.manage", sectionA)).toBe(false);
  });

  it("cannot declare days for the section", () => {
    expect(can(expiredRep, "calendar.declare.section", sectionA)).toBe(false);
  });

  it("still shows as holding the stale marker — which is exactly why can() ignores it", () => {
    expect(
      expiredRep.roles.some((r) => r.role === "course_rep"),
    ).toBe(true);
    expect(isActiveRepForSection(expiredRep, SECTION_A)).toBe(false);
  });
});

describe("a rep cannot appoint a rep (§4)", () => {
  /* "A rep cannot appoint a rep, or the grant is self-propagating." Mirrors
     rep_assignments_instructor in 0011, which only lets the section's
     instructor write the table. */
  it("rep cannot", () => {
    expect(can(repA, "rep.appoint", sectionA)).toBe(false);
  });

  it("instructor can", () => {
    expect(can(instructor, "rep.appoint", sectionA)).toBe(true);
  });
});

describe("the keys to the kingdom stay with admin", () => {
  for (const actor of [
    ["instructor", instructor],
    ["rep", repA],
    ["student", student],
  ] as const) {
    it(`${actor[0]} cannot manage users`, () => {
      expect(can(actor[1], "user.manage")).toBe(false);
    });

    it(`${actor[0]} cannot read the audit log`, () => {
      // Mirrors audit_log_read_admin: not even a rep sees entries about their
      // own decisions.
      expect(can(actor[1], "audit.read")).toBe(false);
    });
  }
});

describe("a student can do none of it", () => {
  const nothing: Action[] = [
    "course.manage",
    "section.manage",
    "session.manage",
    "attendance.decide",
    "calendar.declare.section",
    "calendar.declare.institution",
    "rep.appoint",
    "user.manage",
    "report.export",
    "audit.read",
  ];

  for (const action of nothing) {
    it(`student cannot ${action}`, () => {
      expect(can(student, action, sectionA)).toBe(false);
    });
  }
});

describe("non-active accounts", () => {
  /* Mirrors nothing in RLS — the policies do not check profile status, and the
     real enforcement for a suspended account is that admin revokes the roles.
     This is UI courtesy, and saying so out loud matters: someone reading can()
     might otherwise believe suspension is enforced here. */
  it("a suspended rep loses their buttons", () => {
    const suspended = user({ ...repA, status: "suspended" });
    expect(can(suspended, "attendance.decide", sectionA)).toBe(false);
  });

  it("a withdrawn student too", () => {
    const withdrawn = user({ ...student, status: "withdrawn" });
    expect(can(withdrawn, "session.manage", sectionA)).toBe(false);
  });

  it("but a suspended ADMIN is still an admin — locking out the person who unlocks people is a bad failure", () => {
    const suspended = user({ ...admin, status: "suspended" });
    expect(can(suspended, "user.manage")).toBe(true);
  });
});
