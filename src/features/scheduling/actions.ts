"use server";

import { revalidatePath } from "next/cache";

import { AppError } from "@/lib/errors";
import { authedAction, requireScope } from "@/lib/safe-action";
import {
  cancelSessionSchema,
  createScheduleRuleSchema,
  deleteScheduleRuleSchema,
  generateSessionsSchema,
  sessionActionSchema,
  updateScheduleRuleSchema,
} from "./schemas";

/**
 * Scheduling writes: the schedule rules, and the session lifecycle.
 *
 * The lifecycle transitions (generate/open/cancel) are RPCs — the real work is
 * in 0017, security-definer functions that carry their own authorisation and
 * the timezone/idempotency logic that a Server Action has no business
 * reimplementing. This layer authorises for the UI, turns a SQLSTATE into a
 * sentence, and revalidates. If it were deleted, RLS and those functions would
 * still refuse everything they refuse now.
 *
 * Schedule-rule CRUD is plain table writes: schedule_rules_write (0011) admits
 * admin and the section's instructor and nobody else. Generating and opening
 * are `section.manage` / `session.manage` — a rep can run a session for their
 * section, but only an instructor schedules one.
 */

function sectionPath(classSectionId: string) {
  return `/instructor/sections/${classSectionId}`;
}

export const createScheduleRule = authedAction
  .metadata({
    name: "create-schedule-rule",
    authorize: "section.manage",
    audit: { action: "schedule_rule.created", entityType: "schedule_rule" },
  })
  .inputSchema(createScheduleRuleSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { data, error } = await ctx.supabase
      .from("schedule_rules")
      .insert({
        class_section_id: parsedInput.classSectionId,
        day_of_week: parsedInput.dayOfWeek,
        starts_at_local: parsedInput.startsAtLocal,
        ends_at_local: parsedInput.endsAtLocal,
        room: parsedInput.room,
        effective_from: parsedInput.effectiveFrom,
        effective_to: parsedInput.effectiveTo,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "42501") throw new AppError("You cannot edit this section's schedule.");
      throw new AppError(`Could not add that schedule rule: ${error.message}`);
    }

    revalidatePath(sectionPath(parsedInput.classSectionId));
    return { id: data.id };
  });

export const updateScheduleRule = authedAction
  .metadata({
    name: "update-schedule-rule",
    authorize: "section.manage",
    audit: { action: "schedule_rule.updated", entityType: "schedule_rule" },
  })
  .inputSchema(updateScheduleRuleSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { id, ...fields } = parsedInput;
    const { data, error } = await ctx.supabase
      .from("schedule_rules")
      .update({
        day_of_week: fields.dayOfWeek,
        starts_at_local: fields.startsAtLocal,
        ends_at_local: fields.endsAtLocal,
        room: fields.room,
        effective_from: fields.effectiveFrom,
        effective_to: fields.effectiveTo,
      })
      .eq("id", id)
      .select("id")
      .single();

    if (error) {
      if (error.code === "42501") throw new AppError("You cannot edit this section's schedule.");
      throw new AppError(`Could not update that schedule rule: ${error.message}`);
    }

    revalidatePath(sectionPath(fields.classSectionId));
    return { id: data.id };
  });

export const deleteScheduleRule = authedAction
  .metadata({
    name: "delete-schedule-rule",
    authorize: "section.manage",
    audit: { action: "schedule_rule.deleted", entityType: "schedule_rule" },
  })
  .inputSchema(deleteScheduleRuleSchema)
  .action(async ({ parsedInput, ctx }) => {
    // Deleting a rule does NOT delete sessions already generated from it — those
    // are on_delete set null (0006), so history keeps pointing at nothing rather
    // than vanishing. Removing the rule just stops future generation.
    const { error } = await ctx.supabase
      .from("schedule_rules")
      .delete()
      .eq("id", parsedInput.id);

    if (error) {
      if (error.code === "42501") throw new AppError("You cannot edit this section's schedule.");
      throw new AppError(`Could not remove that schedule rule: ${error.message}`);
    }

    revalidatePath(sectionPath(parsedInput.classSectionId));
    return { id: parsedInput.id };
  });

export const generateSessions = authedAction
  .metadata({
    name: "generate-sessions",
    authorize: "section.manage",
    audit: { action: "sessions.generated", entityType: "class_section" },
  })
  .inputSchema(generateSessionsSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { data, error } = await ctx.supabase.rpc("generate_sessions", {
      p_class_section_id: parsedInput.classSectionId,
      p_from: parsedInput.from,
      p_to: parsedInput.to,
    });

    if (error) {
      if (error.code === "42501") throw new AppError("You cannot generate sessions for this section.");
      throw new AppError(`Could not generate sessions: ${error.message}`);
    }

    revalidatePath(sectionPath(parsedInput.classSectionId));
    return { created: data ?? 0 };
  });

export const openSession = authedAction
  .metadata({
    name: "open-session",
    authorize: "session.manage",
    audit: { action: "session.opened", entityType: "attendance_session" },
  })
  .inputSchema(sessionActionSchema)
  .action(async ({ parsedInput, ctx }) => {
    requireScope(ctx.user, "session.manage", {
      type: "class_section",
      id: parsedInput.classSectionId,
    });

    const { error } = await ctx.supabase.rpc("open_session", {
      p_session_id: parsedInput.sessionId,
    });

    if (error) {
      if (error.code === "42501") throw new AppError("You cannot open sessions for this section.");
      // The function's own messages ("only a scheduled session can be opened")
      // are already written for a person.
      throw new AppError(error.message.replace(/^open_session: /, ""));
    }

    revalidatePath(sectionPath(parsedInput.classSectionId));
    return { id: parsedInput.sessionId };
  });

export const closeSession = authedAction
  .metadata({
    name: "close-session",
    authorize: "session.manage",
    audit: { action: "session.closed.manual", entityType: "attendance_session" },
  })
  .inputSchema(sessionActionSchema)
  .action(async ({ parsedInput, ctx }) => {
    requireScope(ctx.user, "session.manage", {
      type: "class_section",
      id: parsedInput.classSectionId,
    });

    // close_session writes the absences and its own audit row. Closing by hand
    // is the same operation the cron does; the only difference is a JWT is
    // present, so the function authorises against it.
    const { data, error } = await ctx.supabase
      .rpc("close_session", { p_session_id: parsedInput.sessionId })
      .single();

    if (error) {
      if (error.code === "42501") throw new AppError("You cannot close sessions for this section.");
      throw new AppError(error.message.replace(/^close_session: /, ""));
    }

    revalidatePath(sectionPath(parsedInput.classSectionId));
    return {
      id: parsedInput.sessionId,
      absencesWritten: data?.absences_written ?? 0,
    };
  });

export const cancelSession = authedAction
  .metadata({
    name: "cancel-session",
    authorize: "session.manage",
    audit: { action: "session.cancelled", entityType: "attendance_session" },
  })
  .inputSchema(cancelSessionSchema)
  .action(async ({ parsedInput, ctx }) => {
    requireScope(ctx.user, "session.manage", {
      type: "class_section",
      id: parsedInput.classSectionId,
    });

    const { error } = await ctx.supabase.rpc("cancel_session", {
      p_session_id: parsedInput.sessionId,
      p_reason: parsedInput.reason,
    });

    if (error) {
      if (error.code === "42501") throw new AppError("You cannot cancel sessions for this section.");
      throw new AppError(error.message.replace(/^cancel_session: /, ""));
    }

    revalidatePath(sectionPath(parsedInput.classSectionId));
    return { id: parsedInput.sessionId };
  });
