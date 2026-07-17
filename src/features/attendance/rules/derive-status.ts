import type { AttendanceStatus, DeriveStatusInput } from "./types";

/**
 * The single source of truth for what an attendance record means.
 *
 * PURE. No database, no clock, no imports from the app — every input, including
 * time, arrives as a parameter. That is what lets the same function run in three
 * places and agree with itself:
 *
 *   · the approval action        (server, authoritative)
 *   · the auto-close job         (server, authoritative)
 *   · the live session card      (client, preview only)
 *
 * The student's countdown is this function's answer rendered ahead of time. If
 * the card and the server ever disagree, a student watches "PRESENT WINDOW ·
 * 2:00 LEFT" and gets marked late — so there is exactly one implementation, and
 * the client one is the same code, not a reimplementation of it.
 *
 * Timing anchors on `submittedAt`. See DeriveStatusInput.approvedAt for why.
 */
export function deriveStatus(input: DeriveStatusInput): AttendanceStatus {
  const {
    sessionStatus,
    sessionStartsAt,
    submittedAt,
    decision,
    permissionRequested,
    permission,
    permissionCountsAsExcused,
    rules,
  } = input;

  // A cancelled session did not happen, so nothing that was claimed about it
  // survives — including an approval a rep made before the cancellation. These
  // records leave the percentage denominator entirely (§6.1), so any other
  // answer would let a cancelled class change a student's standing.
  if (sessionStatus === "cancelled") return "cancelled";

  if (permissionRequested) {
    return derivePermissionStatus(
      sessionStatus,
      permission,
      permissionCountsAsExcused,
    );
  }

  return deriveAttendanceStatus(
    sessionStatus,
    sessionStartsAt,
    submittedAt,
    decision,
    rules,
  );
}

function derivePermissionStatus(
  sessionStatus: DeriveStatusInput["sessionStatus"],
  permission: DeriveStatusInput["permission"],
  countsAsExcused: boolean,
): AttendanceStatus {
  // §6.4: granted → permission_granted, and excused when the reason is flagged
  // `counts_as_excused`. The difference is not cosmetic: excused leaves the
  // denominator, permission_granted stays in it.
  if (permission === "granted") {
    return countsAsExcused ? "excused" : "permission_granted";
  }

  // §6.4: rejected → absent, with a mandatory rejection note. Not `rejected` —
  // that word is reserved for "claimed present, wasn't" (see below).
  if (permission === "rejected") return "absent";

  // Undecided at close: the student asked and nobody answered. ADR-010 — that
  // is a failure to establish a fact, not evidence of absence.
  if (sessionStatus === "closed") return "unverified";
  return "pending_permission_review";
}

function deriveAttendanceStatus(
  sessionStatus: DeriveStatusInput["sessionStatus"],
  sessionStartsAt: Date,
  submittedAt: Date | null,
  decision: DeriveStatusInput["decision"],
  rules: DeriveStatusInput["rules"],
): AttendanceStatus {
  // §6.3: rejection means "claimed present, wasn't" and stays distinguishable
  // from absent forever, even though both count against attendance. Collapsing
  // them would erase the difference between a student who didn't turn up and a
  // student a rep judged to be lying — which is exactly the distinction an
  // end-of-term dispute turns on.
  if (decision === "rejected") return "rejected";

  if (decision === "approved") {
    if (submittedAt === null) {
      // Approving a request that was never submitted is not a status question,
      // it is corrupt data. Loud beats plausible: a silent "present" here would
      // be indistinguishable from a real one.
      throw new Error(
        "deriveStatus: decision is 'approved' but submittedAt is null — a request that was never submitted cannot have been approved.",
      );
    }
    return deriveFromTiming(sessionStartsAt, submittedAt, rules);
  }

  // No verdict yet.
  if (submittedAt !== null) {
    // §6.5 says "Session closed with no approved record → absent". Taken
    // literally that marks a student absent who submitted on time and was never
    // verified — they did everything right and lost anyway, for a rep's
    // inaction. ADR-010 declines to do that.
    //
    // `unverified` is the honest word: the system never established a fact, so
    // it asserts neither. It leaves the percentage denominator entirely, which
    // means rep inattention costs the student nothing and costs the SECTION its
    // data — which is where the cost belongs, and where it gets noticed.
    //
    // Note this is not "pending forever": pending means someone is still
    // expected to act, and after close nobody is. The distinction matters to
    // the rep queue (which shows pendings) and to the registrar's export (which
    // must not show a term full of "waiting").
    //
    // Recoverable: a closed session is not a finalized semester, so a rep or
    // instructor can still decide it, and this function will then return
    // present/late from the `decision` branch above.
    if (sessionStatus === "closed") return "unverified";
    return "pending_verification";
  }

  // No submission at all. This is the row close_session() writes for every
  // enrolled student who never reported (§6.1) — absences are rows, not the
  // absence of rows, or the percentages are fiction.
  if (sessionStatus === "closed") return "absent";

  // Session is scheduled or open and the student has done nothing. No record
  // should exist yet — close_session() has not run and nothing was submitted.
  throw new Error(
    `deriveStatus: no submission and no permission request on a '${sessionStatus}' session — this record should not exist until close_session() writes it.`,
  );
}

/**
 * The timing ladder. All arithmetic is on absolute instants (epoch ms), which
 * is what makes this DST-proof: a UTC instant does not shift when a timezone's
 * offset does. Wall-clock time is a display concern (lib/time.ts) and never
 * reaches this function.
 *
 * Boundaries are inclusive — §6.5 says "≤ start + present_within_minutes".
 */
function deriveFromTiming(
  sessionStartsAt: Date,
  submittedAt: Date,
  rules: DeriveStatusInput["rules"],
): AttendanceStatus {
  const elapsedMinutes =
    (submittedAt.getTime() - sessionStartsAt.getTime()) / 60_000;

  if (elapsedMinutes <= rules.presentWithinMinutes) return "present";
  if (elapsedMinutes <= rules.lateWithinMinutes) return "late";

  // Explicit, per the rule snapshot — never implied.
  return rules.beyondLateWindow;
}
