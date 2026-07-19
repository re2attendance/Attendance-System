"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { deriveStatus } from "@/features/attendance/rules/derive-status";
import type { AttendanceStatus } from "@/features/attendance/rules/types";
import { AppError } from "@/lib/errors";
import { authedAction, requireScope } from "@/lib/safe-action";
import type { ActionContext } from "@/lib/safe-action";
import {
  decideAttendanceBulkSchema,
  decideAttendanceSchema,
  reportPresentSchema,
} from "./schemas";

/**
 * Attendance writes: a student reporting present, and a rep/instructor deciding.
 *
 * The one idea that shapes this file: STATUS IS DERIVED, NOT DECIDED HERE. When a
 * rep approves, whether the student is `present` or `late` is a question only
 * deriveStatus answers (§2.4) — from the submission time against the session's
 * pinned rule snapshot. The action computes it with that one function and hands
 * the result to decide_attendance (0018), which writes it atomically under a
 * lock. The SQL never re-implements the timing ladder, so the two can never
 * disagree, which is the whole point of the snapshot model.
 */

/** Best-effort client IP for the anti-proxy trail. A malformed or absent header
 * becomes null rather than erroring the submission — the IP is a signal, not a
 * gate, and losing it must never cost a student their attendance. */
async function clientIp(): Promise<string | null> {
  const xff = (await headers()).get("x-forwarded-for");
  if (!xff) return null;
  const first = xff.split(",")[0]?.trim();
  if (!first) return null;
  // A loose plausibility check; Postgres's inet cast is the real validator and
  // we simply decline to hand it anything obviously not an address.
  const ipish = /^[0-9a-fA-F:.]+$/.test(first) && first.length <= 45;
  return ipish ? first : null;
}

export const reportPresent = authedAction
  .metadata({ name: "report-present" })
  .inputSchema(reportPresentSchema)
  .action(async ({ parsedInput, ctx }) => {
    // No `authorize`: any signed-in user may report their OWN attendance. Which
    // student, which session, and whether they are enrolled is RLS's call and
    // report_present's — not a coarse role check.
    const { data, error } = await ctx.supabase
      .rpc("report_present", {
        p_session_id: parsedInput.sessionId,
        p_device_fingerprint: parsedInput.deviceFingerprint ?? undefined,
        p_ip: (await clientIp()) ?? undefined,
      })
      .single();

    if (error) {
      // report_present raises person-readable messages (not open, not enrolled).
      // Pass them through; only strip the internal prefix that the not-found /
      // technical raises carry.
      throw new AppError(error.message.replace(/^report_present: /, ""));
    }

    revalidatePath("/student/today");
    return { recordId: data.record_id, status: data.status };
  });

/**
 * The status a verdict produces, from the one true function. Reads the record
 * with its session and pinned snapshot, then asks deriveStatus. Shared by the
 * single and bulk paths so both derive identically.
 */
async function deriveDecisionStatus(
  supabase: ActionContext["supabase"],
  recordIds: string[],
  decision: "approved" | "rejected",
): Promise<Map<string, AttendanceStatus>> {
  const { data, error } = await supabase
    .from("attendance_records")
    .select(
      `id, submitted_at, permission_reason_id,
       session:attendance_sessions!inner(status, starts_at),
       snapshot:attendance_rule_snapshots!inner(present_within_minutes, late_within_minutes, beyond_late_window)`,
    )
    .in("id", recordIds);

  if (error) throw new AppError(`Could not read the records to decide: ${error.message}`);

  const out = new Map<string, AttendanceStatus>();
  for (const r of data ?? []) {
    out.set(
      r.id,
      deriveStatus({
        sessionStatus: r.session.status,
        sessionStartsAt: new Date(r.session.starts_at),
        submittedAt: r.submitted_at ? new Date(r.submitted_at) : null,
        approvedAt: null,
        decision,
        permissionRequested: r.permission_reason_id !== null,
        permission: null,
        permissionCountsAsExcused: false,
        rules: {
          presentWithinMinutes: r.snapshot.present_within_minutes,
          lateWithinMinutes: r.snapshot.late_within_minutes,
          beyondLateWindow: r.snapshot.beyond_late_window,
        },
      }),
    );
  }
  return out;
}

export const decideAttendance = authedAction
  .metadata({ name: "decide-attendance" })
  .inputSchema(decideAttendanceSchema)
  .action(async ({ parsedInput, ctx }) => {
    requireScope(ctx.user, "attendance.decide", {
      type: "class_section",
      id: parsedInput.classSectionId,
    });

    // No safe-action audit here: attendance_decide_one (0018) writes its own
    // audit row, and a second one would double-count the same verdict.
    const status = (
      await deriveDecisionStatus(ctx.supabase, [parsedInput.recordId], parsedInput.decision)
    ).get(parsedInput.recordId);

    if (!status) throw new AppError("That attendance record no longer exists.");

    const { data, error } = await ctx.supabase
      .rpc("decide_attendance", {
        p_record_id: parsedInput.recordId,
        p_decision: parsedInput.decision,
        p_status: status,
      })
      .single();

    if (error) throw new AppError(error.message);

    revalidatePath(`/rep/sessions/${parsedInput.classSectionId}`);
    return {
      id: data.record_id,
      status: data.status,
      alreadyDecided: data.was_already_decided,
    };
  });

export const decideAttendanceBulk = authedAction
  .metadata({ name: "decide-attendance-bulk" })
  .inputSchema(decideAttendanceBulkSchema)
  .action(async ({ parsedInput, ctx }) => {
    requireScope(ctx.user, "attendance.decide", {
      type: "class_section",
      id: parsedInput.classSectionId,
    });

    const statuses = await deriveDecisionStatus(
      ctx.supabase,
      parsedInput.recordIds,
      parsedInput.decision,
    );

    // Only rows we could actually read and derive; the RPC skips the rest anyway.
    const items = parsedInput.recordIds
      .filter((id) => statuses.has(id))
      .map((id) => ({ id, status: statuses.get(id) }));

    if (items.length === 0) {
      return { decided: 0, skipped: parsedInput.recordIds.length };
    }

    const { data, error } = await ctx.supabase
      .rpc("decide_attendance_bulk", {
        p_items: items,
        p_decision: parsedInput.decision,
      })
      .single();

    if (error) throw new AppError(error.message);

    revalidatePath(`/rep/sessions/${parsedInput.sessionId}`);
    return { decided: data.decided, skipped: data.skipped };
  });
