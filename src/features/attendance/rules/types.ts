/**
 * Types for the rules engine.
 *
 * This directory is a library: it imports nothing from the app, touches no I/O,
 * and reads no clock. ESLint enforces that (see eslint.config.mjs). Every input
 * to a decision arrives as a parameter, including time.
 */

export type AttendanceStatus =
  | "pending_verification"
  | "pending_permission_review"
  /** Submitted on time; nobody ever decided. Not absent — see ADR-010. */
  | "unverified"
  | "present"
  | "late"
  | "permission_granted"
  | "absent"
  | "rejected"
  | "excused"
  | "cancelled";

export type SessionStatus = "scheduled" | "open" | "closed" | "cancelled";

export type AttendanceDecision = "approved" | "rejected";
export type PermissionDecision = "granted" | "rejected";

/**
 * The subset of an `attendance_rules` row that status derivation depends on,
 * copied onto a session at open time (`rules_snapshot_id`) and never mutated.
 *
 * Why a snapshot and not a reference: rules are versioned and immutable once
 * used (§5). An admin editing the rules in week 10 must not rewrite week 2's
 * history — a student's record has to mean what it meant on the day, or every
 * end-of-term dispute becomes unwinnable.
 *
 * Note what is NOT here: `grace_period_minutes`, `auto_close_minutes_after_end`,
 * `allow_late_submission`, `min_attendance_percent`. They live on the rules row
 * but govern the submission window, the auto-close job, and eligibility — not
 * status. §6.5's derivation never mentions them, and a field this function
 * cannot read is a field that cannot secretly change a verdict.
 */
export type RuleSnapshot = {
  /** Submitted at or before `starts_at + this` → present. */
  presentWithinMinutes: number;

  /** Submitted at or before `starts_at + this` → late. */
  lateWithinMinutes: number;

  /**
   * What an approved submission past the late window becomes.
   *
   * §6.5: "Approved, beyond that → late (or absent if the rule says so — make
   * it explicit, don't leave it implied)". So it is explicit, and it is a rule,
   * not a constant buried in a branch. An institution that treats a 40-minute
   * arrival as attendance and one that does not are both defensible; guessing
   * on their behalf is not.
   */
  beyondLateWindow: Extract<AttendanceStatus, "late" | "absent">;
};

/**
 * Everything a status decision depends on. If it is not here, it cannot affect
 * the outcome — which is the point.
 */
export type DeriveStatusInput = {
  sessionStatus: SessionStatus;
  sessionStartsAt: Date;

  /** Server-written (`default now()`). Never accepted from a client. */
  submittedAt: Date | null;

  /**
   * Present for signature fidelity with §6.5 and DELIBERATELY UNUSED.
   *
   * This is the spec's central correction, so it is worth stating loudly:
   * timing anchors on `submitted_at`, never `approved_at`. A student who
   * submits at minute 2 and is approved at minute 12 is PRESENT. Anchoring on
   * approval punishes students for a rep's slow queue — the one thing they
   * cannot influence.
   *
   * Approval latency is a rep-performance metric (`verification_latency_seconds`),
   * recorded separately. derive-status.test.ts proves that varying this field
   * never changes the result.
   */
  approvedAt: Date | null;

  /** The rep's verdict on an attendance request. */
  decision: AttendanceDecision | null;

  /**
   * True when this record is a permission-to-miss request rather than an
   * attendance request. The two live on one row (§5) and are mutually
   * exclusive in practice; this disambiguates them.
   */
  permissionRequested: boolean;

  /** The rep's/instructor's verdict on a permission request. */
  permission: PermissionDecision | null;

  /**
   * From `permission_reasons.counts_as_excused`. Medical and bereavement
   * typically excuse; "other" typically does not. Excused records leave the
   * attendance percentage denominator entirely.
   */
  permissionCountsAsExcused: boolean;

  rules: RuleSnapshot;
};
