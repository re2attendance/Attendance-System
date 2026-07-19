import { z } from "zod";

/**
 * Attendance write inputs. Each is the readable error before the round-trip; the
 * database functions in 0018 and RLS in 0011 are what actually enforce these.
 */

/** A student reporting present. One tap — the rep's manual approval is the
 * check, not a code the student types. The device fingerprint is a best-effort
 * anti-proxy signal and may be absent. */
export const reportPresentSchema = z.object({
  sessionId: z.uuid(),
  deviceFingerprint: z.string().max(200).nullable().default(null),
});
export type ReportPresentInput = z.infer<typeof reportPresentSchema>;

/** A single verdict. sectionId rides along so the action can authorise the
 * scope (attendance.decide) before it touches the row; the RPC re-checks. */
export const decideAttendanceSchema = z.object({
  recordId: z.uuid(),
  classSectionId: z.uuid(),
  decision: z.enum(["approved", "rejected"]),
});
export type DecideAttendanceInput = z.infer<typeof decideAttendanceSchema>;

/** A batch verdict over the records the rep is acting on. The ids are the rows
 * currently in front of them; the RPC skips any a co-rep resolved meanwhile and
 * any that are the caller's own, so a stale id in the list is harmless. */
export const decideAttendanceBulkSchema = z.object({
  classSectionId: z.uuid(),
  sessionId: z.uuid(),
  decision: z.enum(["approved", "rejected"]),
  recordIds: z.array(z.uuid()).min(1, "Nothing selected.").max(1000),
});
export type DecideAttendanceBulkInput = z.infer<typeof decideAttendanceBulkSchema>;
