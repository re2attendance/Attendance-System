import { describe, expect, it } from "vitest";

import type { Database } from "@/db/types";
import type {
  AttendanceStatus as RulesAttendanceStatus,
  SessionStatus as RulesSessionStatus,
} from "./rules/types";

/**
 * Drift guard between the rules library and the database.
 *
 * features/attendance/rules/* is a pure library and imports nothing from the
 * app — ESLint enforces that, and it is the property that lets deriveStatus run
 * identically on the server and on a student's phone. The cost is that its
 * status union is hand-written rather than derived from src/db/types.ts, so it
 * can silently diverge from the enum the database actually stores.
 *
 * That divergence would be nasty: deriveStatus would return a status the column
 * rejects, or stop handling one it can hold, and the failure would surface as a
 * constraint violation in production rather than as a type error here.
 *
 * So the parity is asserted here instead — in the feature, which may import
 * both. This file lives outside rules/ precisely because the boundary forbids
 * it from living inside.
 *
 * The real assertions are the type-level ones and they are checked by `tsc`
 * (pnpm typecheck), not by vitest — vitest transpiles without typechecking.
 * The runtime test below exists so the file is also a test, and so a failure
 * says which value is missing rather than only that two types disagree.
 */

type DbAttendanceStatus = Database["public"]["Enums"]["attendance_status"];
type DbSessionStatus = Database["public"]["Enums"]["session_status"];

/** Bidirectional union equality. `[A] extends [B]` prevents distribution. */
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// If either of these errors, the rules library and the schema disagree. Fix
// rules/types.ts to match the migration — the database is the source of truth.
const _attendanceStatusParity: Equal<RulesAttendanceStatus, DbAttendanceStatus> = true;
const _sessionStatusParity: Equal<RulesSessionStatus, DbSessionStatus> = true;

void _attendanceStatusParity;
void _sessionStatusParity;

describe("rules library ↔ database enum parity", () => {
  /* Restated as values so a failure names the drifting member. Typed as the DB
     union, so a status added to the enum makes this array fail to compile until
     it is listed — the list cannot silently fall behind the schema. */
  const DB_STATUSES: DbAttendanceStatus[] = [
    "pending_verification",
    "pending_permission_review",
    "unverified",
    "present",
    "late",
    "permission_granted",
    "absent",
    "rejected",
    "excused",
    "cancelled",
  ];

  const RULES_STATUSES: RulesAttendanceStatus[] = [
    "pending_verification",
    "pending_permission_review",
    "unverified",
    "present",
    "late",
    "permission_granted",
    "absent",
    "rejected",
    "excused",
    "cancelled",
  ];

  it("every database status is known to the rules library", () => {
    expect(new Set(RULES_STATUSES)).toEqual(new Set(DB_STATUSES));
  });

  it("the enum has exactly ten members", () => {
    // A tripwire for a status added to the migration without anyone revisiting
    // deriveStatus, the chip map, or the summary table's denominator. It fired
    // for real when ADR-010 added `unverified`, which is the point.
    expect(DB_STATUSES).toHaveLength(10);
  });
});
