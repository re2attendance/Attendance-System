"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AppError } from "@/lib/errors";
import { authedAction, requireScope } from "@/lib/safe-action";

/**
 * Appointing and revoking course reps.
 *
 * `course_rep_assignments` has carried appointment history since Phase 2 with
 * nothing able to write it. This is that.
 *
 * §4: "Model the rep grant as a row, not a column on the user. Supports:
 * multiple reps per section, co-reps, mid-term handover, revocation, and
 * historical accuracy ('who was rep when this record was approved?')."
 *
 * Every one of those falls out of the table's shape rather than needing code
 * here. What this file adds is the two distinctions the table cannot make on
 * its own:
 *
 *   · appointing is an INSERT, never an update. Re-appointing someone who was
 *     revoked is a new row, because week 2's records were approved under the
 *     old appointment and week 9's under the new one, and "who was rep on the
 *     day" has to keep having an answer.
 *   · revoking is not deleting. The row stays; revoked_at ends the authority.
 */

const appointSchema = z.object({
  classSectionId: z.uuid(),
  userId: z.uuid("Choose a student."),
  /** Defaults to now. An appointment starting later is a scheduled handover. */
  startsAt: z.string().nullable().default(null),
  /** Null = open-ended, ending when the term does. */
  endsAt: z.string().nullable().default(null),
});

const revokeSchema = z.object({
  assignmentId: z.uuid(),
  classSectionId: z.uuid(),
  /**
   * Required, and deliberately so. Revocation is a judgement about a person —
   * §4 keeps it distinct from expiry precisely because one is "the term ended"
   * and the other is "we took this away". A revocation with no reason is
   * unaccountable, and this is the record someone reads in week 14.
   */
  reason: z
    .string()
    .min(1, "Say why this appointment is being revoked.")
    .max(500)
    .transform((v) => v.trim()),
});

export const appointRep = authedAction
  .metadata({
    name: "appoint-rep",
    authorize: "rep.appoint",
    audit: { action: "rep.appointed", entityType: "course_rep_assignment" },
  })
  .inputSchema(appointSchema)
  .action(async ({ parsedInput, ctx }) => {
    requireScope(ctx.user, "rep.appoint", {
      type: "class_section",
      id: parsedInput.classSectionId,
    });

    // The student must be on the section's register. A rep who is not in the
    // class cannot verify that anyone is physically present in it — which is
    // the entire job (§1).
    const { data: enrolment } = await ctx.supabase
      .from("enrollments")
      .select("id, status")
      .eq("student_id", parsedInput.userId)
      .eq("class_section_id", parsedInput.classSectionId)
      .maybeSingle();

    if (!enrolment || enrolment.status !== "enrolled") {
      throw new AppError(
        "That student is not enrolled in this section. A rep has to be in the class they verify.",
      );
    }

    const { data, error } = await ctx.supabase
      .from("course_rep_assignments")
      .insert({
        user_id: parsedInput.userId,
        class_section_id: parsedInput.classSectionId,
        assigned_by: ctx.user.id,
        starts_at: parsedInput.startsAt ?? new Date().toISOString(),
        ends_at: parsedInput.endsAt,
      })
      .select("id")
      .single();

    if (error) {
      // 23P01 — the exclusion constraint from 0012. Two overlapping ACTIVE
      // appointments for the same person and section would make "who was rep on
      // the day" ambiguous, which is the one question this table exists to
      // answer. Co-reps are fine; the same person twice at once is not.
      if (error.code === "23P01") {
        throw new AppError(
          "That student already has an appointment covering these dates. Revoke it first, or choose different dates.",
        );
      }
      if (error.code === "42501") {
        throw new AppError("You cannot appoint reps for this section.");
      }
      throw new AppError(`Could not appoint that rep: ${error.message}`);
    }

    // Deliberately NOT writing a user_roles marker.
    //
    // The appointment IS the grant. RLS reads course_rep_assignments and its
    // period; getUser() now reads the same table for the same reason. A second
    // declarative row in user_roles would be a copy with no dates that drifts
    // the moment an appointment expires — and revoking it would need a DELETE,
    // which 0014 grants to nobody. The redundancy is what surfaced the problem.

    revalidatePath("/instructor/reps");
    return { id: data.id };
  });

export const revokeRep = authedAction
  .metadata({
    name: "revoke-rep",
    authorize: "rep.appoint",
    audit: { action: "rep.revoked", entityType: "course_rep_assignment" },
  })
  .inputSchema(revokeSchema)
  .action(async ({ parsedInput, ctx }) => {
    requireScope(ctx.user, "rep.appoint", {
      type: "class_section",
      id: parsedInput.classSectionId,
    });

    // An UPDATE, not a DELETE. The appointment happened; records were approved
    // under it. Deleting the row would make every one of those records
    // unattributable, and §4's whole argument for this table is that "who was
    // rep when this was approved?" must keep having an answer.
    const { data, error } = await ctx.supabase
      .from("course_rep_assignments")
      .update({
        revoked_at: new Date().toISOString(),
        revoked_by: ctx.user.id,
        revoked_reason: parsedInput.reason,
      })
      .eq("id", parsedInput.assignmentId)
      .is("revoked_at", null)
      .select("id, user_id")
      .maybeSingle();

    if (error) throw new AppError(`Could not revoke that appointment: ${error.message}`);

    if (!data) {
      // Zero rows: already revoked, or not theirs to revoke. §6.3's race
      // handling, applied here — a friendly sentence, not a 500.
      throw new AppError("That appointment has already been revoked.");
    }

    // Nothing else to undo: revoked_at ended the authority the instant it was
    // set, and the UI reads the same appointment row. There is no marker to
    // clean up, which is the point of not having written one.

    revalidatePath("/instructor/reps");
    return { id: data.id };
  });

/**
 * The enrolled students of a section, for the appoint picker.
 *
 * A read, run as an action so the dialog can load it on open rather than the
 * page loading every section's roster upfront (an admin owns 20 sections of
 * ~100). authorize is coarse — rep.appoint is true for any instructor — so the
 * real fence is RLS: enrollments_read_section only returns rows for sections the
 * caller administers, which means asking for someone else's roster returns
 * nothing rather than a leak.
 */
export const listSectionRoster = authedAction
  .metadata({ name: "list-section-roster", authorize: "rep.appoint" })
  .inputSchema(z.object({ classSectionId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    requireScope(ctx.user, "rep.appoint", {
      type: "class_section",
      id: parsedInput.classSectionId,
    });

    const { data, error } = await ctx.supabase
      .from("enrollments")
      .select(
        "student_id, profiles!enrollments_student_id_fkey(full_name, matric_number)",
      )
      .eq("class_section_id", parsedInput.classSectionId)
      .eq("status", "enrolled");

    if (error) throw new AppError(`Could not load the roster: ${error.message}`);

    return (data ?? [])
      .map((e) => ({
        id: e.student_id,
        fullName: e.profiles?.full_name ?? "Unknown student",
        matricNumber: e.profiles?.matric_number ?? null,
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  });
