import { describe, expect, it } from "vitest";

import { deriveStatus } from "./derive-status";
import type {
  AttendanceStatus,
  DeriveStatusInput,
  RuleSnapshot,
} from "./types";

/* Exhaustive per §12: every rule branch, every boundary minute, clock edges,
   and a DST transition.

   These tests are the specification. deriveStatus is the one place a student's
   record is decided, and it is decided identically on the server and in the
   preview on their phone — so a bug here is not a rendering glitch, it is a
   wrong academic record that someone has to dispute. */

const START = new Date("2025-05-12T09:00:00.000Z");

const RULES: RuleSnapshot = {
  presentWithinMinutes: 10,
  lateWithinMinutes: 20,
  beyondLateWindow: "late",
};

/** Minutes after session start, as an instant. */
function at(minutes: number): Date {
  return new Date(START.getTime() + minutes * 60_000);
}

/** Milliseconds after session start, for boundary probing. */
function atMs(ms: number): Date {
  return new Date(START.getTime() + ms);
}

function input(over: Partial<DeriveStatusInput> = {}): DeriveStatusInput {
  return {
    sessionStatus: "open",
    sessionStartsAt: START,
    submittedAt: at(1),
    approvedAt: at(5),
    decision: null,
    permissionRequested: false,
    permission: null,
    permissionCountsAsExcused: false,
    rules: RULES,
    ...over,
  };
}

describe("cancelled sessions", () => {
  it("a cancelled session is cancelled regardless of anything else", () => {
    // Including a prior approval: the class did not happen, so a rep's verdict
    // about it cannot survive. These leave the denominator entirely.
    const cases: Partial<DeriveStatusInput>[] = [
      { decision: "approved", submittedAt: at(1) },
      { decision: "rejected" },
      { permissionRequested: true, permission: "granted" },
      { permissionRequested: true, permission: "rejected" },
      { submittedAt: null, decision: null },
    ];

    for (const over of cases) {
      expect(
        deriveStatus(input({ sessionStatus: "cancelled", ...over })),
      ).toBe("cancelled");
    }
  });
});

describe("permission requests (§6.4)", () => {
  it("granted → permission_granted when the reason does not excuse", () => {
    expect(
      deriveStatus(
        input({
          permissionRequested: true,
          permission: "granted",
          permissionCountsAsExcused: false,
        }),
      ),
    ).toBe("permission_granted");
  });

  it("granted → excused when the reason is flagged counts_as_excused", () => {
    // Not cosmetic: excused leaves the percentage denominator entirely,
    // permission_granted stays in it.
    expect(
      deriveStatus(
        input({
          permissionRequested: true,
          permission: "granted",
          permissionCountsAsExcused: true,
        }),
      ),
    ).toBe("excused");
  });

  it("rejected → absent, never 'rejected'", () => {
    // 'rejected' is reserved for "claimed present, wasn't". A declined excuse
    // is not an accusation of lying.
    expect(
      deriveStatus(
        input({ permissionRequested: true, permission: "rejected" }),
      ),
    ).toBe("absent");
  });

  it("undecided on a live session → pending_permission_review", () => {
    for (const sessionStatus of ["scheduled", "open"] as const) {
      expect(
        deriveStatus(
          input({ sessionStatus, permissionRequested: true, permission: null }),
        ),
      ).toBe("pending_permission_review");
    }
  });

  it("undecided at close → absent (no one is left to decide)", () => {
    expect(
      deriveStatus(
        input({
          sessionStatus: "closed",
          permissionRequested: true,
          permission: null,
        }),
      ),
    ).toBe("absent");
  });

  it("the permission verdict beats the attendance verdict on the same row", () => {
    // One row carries both (§5). If a permission decision exists, it governs.
    expect(
      deriveStatus(
        input({
          permissionRequested: true,
          permission: "granted",
          decision: "rejected",
          permissionCountsAsExcused: false,
        }),
      ),
    ).toBe("permission_granted");
  });
});

describe("verification verdicts (§6.3)", () => {
  it("rejected → rejected, stays distinct from absent", () => {
    expect(deriveStatus(input({ decision: "rejected" }))).toBe("rejected");
  });

  it("approved on time → present", () => {
    expect(
      deriveStatus(input({ decision: "approved", submittedAt: at(1) })),
    ).toBe("present");
  });

  it("submitted but undecided on a live session → pending_verification", () => {
    for (const sessionStatus of ["scheduled", "open"] as const) {
      expect(
        deriveStatus(input({ sessionStatus, submittedAt: at(1), decision: null })),
      ).toBe("pending_verification");
    }
  });

  it("submitted but never verified, session closed → absent", () => {
    // The harsh one, and deliberate — see ADR-009. A student who did everything
    // right and was never verified loses. The remedy is a dispute (§6.6), not a
    // different status.
    expect(
      deriveStatus(
        input({ sessionStatus: "closed", submittedAt: at(1), decision: null }),
      ),
    ).toBe("absent");
  });

  it("no submission at all, session closed → absent", () => {
    // The row close_session() writes for everyone who never reported. Absences
    // are rows, not the absence of rows.
    expect(
      deriveStatus(
        input({ sessionStatus: "closed", submittedAt: null, decision: null }),
      ),
    ).toBe("absent");
  });
});

describe("timing ladder — boundaries are inclusive (§6.5)", () => {
  const approved = (submittedAt: Date, rules: RuleSnapshot = RULES) =>
    deriveStatus(input({ decision: "approved", submittedAt, rules }));

  it("submitted before the session even starts → present", () => {
    expect(approved(at(-5))).toBe("present");
  });

  it("submitted exactly at start → present", () => {
    expect(approved(at(0))).toBe("present");
  });

  it("exactly at the present boundary → present (inclusive)", () => {
    expect(approved(at(10))).toBe("present");
  });

  it("1ms past the present boundary → late", () => {
    expect(approved(atMs(10 * 60_000 + 1))).toBe("late");
  });

  it("exactly at the late boundary → late (inclusive)", () => {
    expect(approved(at(20))).toBe("late");
  });

  it("1ms past the late boundary → the rule's explicit choice", () => {
    expect(approved(atMs(20 * 60_000 + 1))).toBe("late");
    expect(
      approved(atMs(20 * 60_000 + 1), { ...RULES, beyondLateWindow: "absent" }),
    ).toBe("absent");
  });

  it("far beyond the late window → the rule's explicit choice, not a guess", () => {
    expect(approved(at(240))).toBe("late");
    expect(approved(at(240), { ...RULES, beyondLateWindow: "absent" })).toBe(
      "absent",
    );
  });

  it("walks every minute across both boundaries without a gap", () => {
    // Guards against an off-by-one flipping a whole cohort's status.
    for (let m = 0; m <= 30; m++) {
      const expected: AttendanceStatus =
        m <= 10 ? "present" : m <= 20 ? "late" : "late";
      expect(approved(at(m)), `minute ${m}`).toBe(expected);
    }
  });

  it("handles a zero-width present window (everything on time is late)", () => {
    const rules: RuleSnapshot = { ...RULES, presentWithinMinutes: 0 };
    expect(approved(at(0), rules)).toBe("present");
    expect(approved(atMs(1), rules)).toBe("late");
  });

  it("handles present and late windows being equal (no late band exists)", () => {
    const rules: RuleSnapshot = {
      presentWithinMinutes: 10,
      lateWithinMinutes: 10,
      beyondLateWindow: "absent",
    };
    expect(approved(at(10), rules)).toBe("present");
    expect(approved(atMs(10 * 60_000 + 1), rules)).toBe("absent");
  });
});

describe("timing anchors on submittedAt, never approvedAt (§6.5)", () => {
  /* The spec's central correction, and the reason this function exists in one
     place. A student who submits at minute 2 and is approved at minute 12 is
     present — anchoring on approval would punish them for a rep's slow queue,
     the one thing they cannot influence. */

  it("a slow rep does not make an on-time student late", () => {
    expect(
      deriveStatus(
        input({ decision: "approved", submittedAt: at(2), approvedAt: at(12) }),
      ),
    ).toBe("present");
  });

  it("a fast rep does not rescue a late student", () => {
    expect(
      deriveStatus(
        input({ decision: "approved", submittedAt: at(15), approvedAt: at(15) }),
      ),
    ).toBe("late");
  });

  it("approvedAt cannot change the outcome, at any value", () => {
    const approvedAts = [
      null,
      at(-100),
      at(0),
      at(2),
      at(11),
      at(60),
      at(10_000),
    ];

    const results = approvedAts.map((approvedAt) =>
      deriveStatus(
        input({ decision: "approved", submittedAt: at(2), approvedAt }),
      ),
    );

    expect(new Set(results)).toEqual(new Set(["present"]));
  });
});

describe("DST and clock edges", () => {
  /* deriveStatus works on absolute instants, so a timezone changing its offset
     cannot move a boundary. These tests pin that property — the bug they guard
     against is someone "helpfully" reintroducing wall-clock arithmetic. */

  it("a session spanning the US spring-forward transition is unaffected", () => {
    // 2025-03-09T07:00:00Z: America/New_York jumps 01:59 EST → 03:00 EDT.
    // The local clock loses an hour; the instants do not.
    const start = new Date("2025-03-09T06:55:00.000Z");
    const submitted = new Date("2025-03-09T07:05:00.000Z"); // +10 real minutes

    expect(
      deriveStatus(
        input({
          sessionStartsAt: start,
          submittedAt: submitted,
          approvedAt: submitted,
          decision: "approved",
        }),
      ),
    ).toBe("present");
  });

  it("a session spanning the autumn fall-back transition is unaffected", () => {
    // 2025-11-02T06:00:00Z: 01:59 EDT → 01:00 EST. The local clock repeats an
    // hour; naive wall-clock maths would compute -50 minutes here.
    const start = new Date("2025-11-02T05:55:00.000Z");
    const submitted = new Date("2025-11-02T06:05:00.000Z"); // +10 real minutes

    expect(
      deriveStatus(
        input({
          sessionStartsAt: start,
          submittedAt: submitted,
          approvedAt: submitted,
          decision: "approved",
        }),
      ),
    ).toBe("present");
  });

  it("is unaffected by a session crossing midnight or a year boundary", () => {
    const start = new Date("2025-12-31T23:55:00.000Z");
    const submitted = new Date("2026-01-01T00:05:00.000Z"); // +10 minutes

    expect(
      deriveStatus(
        input({
          sessionStartsAt: start,
          submittedAt: submitted,
          approvedAt: submitted,
          decision: "approved",
        }),
      ),
    ).toBe("present");
  });

  it("handles a leap day without special-casing it", () => {
    const start = new Date("2024-02-29T09:00:00.000Z");
    const submitted = new Date("2024-02-29T09:21:00.000Z"); // +21 → past late

    expect(
      deriveStatus(
        input({
          sessionStartsAt: start,
          submittedAt: submitted,
          approvedAt: submitted,
          decision: "approved",
          rules: { ...RULES, beyondLateWindow: "absent" },
        }),
      ),
    ).toBe("absent");
  });

  it("sub-minute precision is preserved, not rounded", () => {
    // 10 minutes 30 seconds is past a 10-minute present window. Rounding down
    // would silently hand out a grace period nobody configured.
    expect(
      deriveStatus(
        input({ decision: "approved", submittedAt: atMs(10 * 60_000 + 30_000) }),
      ),
    ).toBe("late");
  });
});

describe("impossible states fail loudly", () => {
  /* A silently plausible status for corrupt input is indistinguishable from a
     real one, which makes it worse than a crash. */

  it("throws when an approval exists with no submission", () => {
    expect(() =>
      deriveStatus(input({ decision: "approved", submittedAt: null })),
    ).toThrow(/never submitted/);
  });

  it("throws for an empty record on a session that has not closed", () => {
    for (const sessionStatus of ["scheduled", "open"] as const) {
      expect(() =>
        deriveStatus(
          input({ sessionStatus, submittedAt: null, decision: null }),
        ),
      ).toThrow(/should not exist/);
    }
  });
});

describe("every status in the enum is reachable", () => {
  /* If a status cannot be produced, either the enum is wrong or a branch is
     unreachable. Both are bugs, and neither shows up in a per-branch test. */
  it("produces all nine", () => {
    const produced = new Set<AttendanceStatus>([
      deriveStatus(input({ sessionStatus: "cancelled" })),
      deriveStatus(input({ decision: "approved", submittedAt: at(1) })),
      deriveStatus(input({ decision: "approved", submittedAt: at(15) })),
      deriveStatus(input({ decision: "rejected" })),
      deriveStatus(input({ submittedAt: at(1), decision: null })),
      deriveStatus(
        input({ sessionStatus: "closed", submittedAt: null, decision: null }),
      ),
      deriveStatus(input({ permissionRequested: true, permission: null })),
      deriveStatus(input({ permissionRequested: true, permission: "granted" })),
      deriveStatus(
        input({
          permissionRequested: true,
          permission: "granted",
          permissionCountsAsExcused: true,
        }),
      ),
    ]);

    const all: AttendanceStatus[] = [
      "pending_verification",
      "pending_permission_review",
      "present",
      "late",
      "permission_granted",
      "absent",
      "rejected",
      "excused",
      "cancelled",
    ];

    for (const status of all) {
      expect(produced.has(status), `${status} is unreachable`).toBe(true);
    }
  });
});
