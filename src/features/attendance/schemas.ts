import { z } from "zod";

/**
 * Attendance write inputs. Each is the readable error before the round-trip; the
 * database functions in 0018 and RLS in 0011 are what actually enforce these.
 */

/** A student reporting present. The code is the possession factor shown on the
 * session display; six digits, but accepted trimmed so a stray space is not a
 * "wrong code". The device fingerprint is best-effort and may be absent. */
export const reportPresentSchema = z.object({
  sessionId: z.uuid(),
  code: z
    .string()
    .min(1, "Enter the code shown on the screen.")
    .max(12)
    .transform((v) => v.trim()),
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

/** Rotate/read the display code. Section-scoped; only administrators call it. */
export const rotateSessionCodeSchema = z.object({
  sessionId: z.uuid(),
  classSectionId: z.uuid(),
});
