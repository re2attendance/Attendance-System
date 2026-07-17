"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AppError } from "@/lib/errors";
import { authedAction } from "@/lib/safe-action";

/**
 * Declaring a day off. ADR-012.
 *
 * Everything of consequence happens in `declare_calendar_event()` (0010):
 * authorisation by scope, the date rules, cancelling the day's sessions, and
 * voiding every record on them including approved ones. This action's whole job
 * is to translate a SQLSTATE into a sentence.
 *
 * That division is deliberate. The rules that matter — a rep cannot close the
 * university, an emergency is today only, nothing is backdated — are enforced
 * where they cannot be skipped, and tested in rls_calendar_declarations.test.sql.
 * If this file were deleted, all of them would still hold.
 */

const declareSchema = z.object({
  eventType: z.enum(["holiday", "emergency"]),
  date: z.string().min(1, "Choose a date."),
  title: z
    .string()
    .min(1, "Say what this day is.")
    .max(120, "That title is too long.")
    .transform((v) => v.trim()),
  /**
   * Null = institution-wide, which is admin's alone (ADR-012). A rep is a
   * student with a scoped grant; "reps can declare a holiday" must never mean
   * an undergraduate can close the university.
   */
  classSectionId: z.uuid().nullable().default(null),
  reason: z.string().max(500).nullable().default(null),
});

export const declareCalendarEvent = authedAction
  .metadata({
    name: "declare-calendar-event",
    audit: { action: "calendar.declared", entityType: "academic_calendar_event" },
  })
  .inputSchema(declareSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { data, error } = await ctx.supabase
      .rpc("declare_calendar_event", {
        p_event_type: parsedInput.eventType,
        p_starts_on: parsedInput.date,
        p_ends_on: parsedInput.date,
        p_title: parsedInput.title,
        // The RPC's params are optional; Supabase's generated types want
        // undefined rather than null for "not supplied".
        p_class_section_id: parsedInput.classSectionId ?? undefined,
        p_reason: parsedInput.reason ?? undefined,
      })
      .single();

    if (error) {
      // 42501 — the scope rules. Either an institution-wide declaration from
      // someone who is not an admin, or a section they do not administer, or an
      // appointment that has expired.
      if (error.code === "42501") {
        throw new AppError(
          parsedInput.classSectionId
            ? "You cannot declare days for that section. Your appointment as rep may have ended."
            : "Only an administrator can declare a day off for the whole institution. Choose one of your sections instead.",
        );
      }

      // 23514 — the date rules. The function's own message is already written
      // for a person and names the date it expected, so it is passed through
      // rather than replaced with something vaguer.
      if (error.code === "23514") {
        throw new AppError(error.message.replace(/^declare_calendar_event: /, ""));
      }

      throw new AppError(`Could not declare that day: ${error.message}`);
    }

    revalidatePath("/admin/calendar");
    revalidatePath("/rep");
    revalidatePath("/student/today");

    return {
      id: data.event_id,
      sessionsCancelled: data.sessions_cancelled,
      recordsVoided: data.records_voided,
    };
  });

/**
 * What declaring this day would do, so the confirmation can name it.
 *
 * A Server Action rather than a Route Handler: §8 reserves Route Handlers for
 * webhooks and file/export streaming, and this is neither. It reads through the
 * caller's own client, so a rep sees the impact on their section and nobody
 * sees a count for a section they cannot administer.
 */
export const previewDeclaration = authedAction
  .metadata({ name: "preview-declaration" })
  .inputSchema(
    z.object({
      date: z.string().min(1),
      classSectionId: z.uuid().nullable().default(null),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    let query = ctx.supabase
      .from("attendance_sessions")
      .select("id, attendance_records(status)")
      .eq("session_date", parsedInput.date)
      .neq("status", "cancelled");

    if (parsedInput.classSectionId) {
      query = query.eq("class_section_id", parsedInput.classSectionId);
    }

    const { data, error } = await query;
    if (error) throw new AppError(`Could not check that day: ${error.message}`);

    const sessions = data ?? [];
    const records = sessions.flatMap((s) => s.attendance_records);

    return {
      sessions: sessions.length,
      records: records.length,
      // The number that should make someone stop: these students reported
      // present and a rep confirmed it.
      approvedRecords: records.filter(
        (r) => r.status === "present" || r.status === "late",
      ).length,
    };
  });
