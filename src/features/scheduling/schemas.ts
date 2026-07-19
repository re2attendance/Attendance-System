import { z } from "zod";

/**
 * Schedule rules and the session lifecycle. Each schema mirrors a CHECK in
 * 0006 rather than inventing a rule — day 0–6 (Postgres dow), local times
 * ordered, effective range ordered. The database is what actually enforces
 * them; this is the readable error before the round-trip.
 */

/** "HH:MM" 24-hour, the shape an <input type="time"> emits. */
const localTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a time as HH:MM.");

// The plain shape, so both create and update can extend it before the
// cross-field refinements turn it into a ZodEffects (which cannot be extended).
const scheduleRuleShape = z.object({
  classSectionId: z.uuid(),
  // 0 = Sunday … 6 = Saturday, matching extract(dow).
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  startsAtLocal: localTime,
  endsAtLocal: localTime,
  room: z
    .string()
    .max(60)
    .nullable()
    .default(null)
    .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
  effectiveFrom: z.string().min(1, "Choose a start date."),
  effectiveTo: z.string().nullable().default(null),
});

// Shared cross-field checks, applied to both create and update. Typed against
// the base shape's output, which the extended (update) shape is a superset of.
type ScheduleRuleFields = z.infer<typeof scheduleRuleShape>;
const timesOrdered = (d: ScheduleRuleFields) => d.endsAtLocal > d.startsAtLocal;
const rangeOrdered = (d: ScheduleRuleFields) =>
  !d.effectiveTo || d.effectiveTo >= d.effectiveFrom;

export const createScheduleRuleSchema = scheduleRuleShape
  .refine(timesOrdered, {
    message: "The end time must be after the start time.",
    path: ["endsAtLocal"],
  })
  .refine(rangeOrdered, {
    message: "The effective-to date must be on or after the effective-from date.",
    path: ["effectiveTo"],
  });
export type CreateScheduleRuleInput = z.infer<typeof createScheduleRuleSchema>;

export const updateScheduleRuleSchema = scheduleRuleShape
  .extend({ id: z.uuid() })
  .refine(timesOrdered, {
    message: "The end time must be after the start time.",
    path: ["endsAtLocal"],
  })
  .refine(rangeOrdered, {
    message: "The effective-to date must be on or after the effective-from date.",
    path: ["effectiveTo"],
  });
export type UpdateScheduleRuleInput = z.infer<typeof updateScheduleRuleSchema>;

export const deleteScheduleRuleSchema = z.object({
  id: z.uuid(),
  classSectionId: z.uuid(),
});

export const generateSessionsSchema = z
  .object({
    classSectionId: z.uuid(),
    from: z.string().min(1, "Choose a start date."),
    to: z.string().min(1, "Choose an end date."),
  })
  .refine((d) => d.to >= d.from, {
    message: "The end date must be on or after the start date.",
    path: ["to"],
  });

/** Open/close: scope arrives with the session's section, for requireScope. */
export const sessionActionSchema = z.object({
  sessionId: z.uuid(),
  classSectionId: z.uuid(),
});

export const cancelSessionSchema = z.object({
  sessionId: z.uuid(),
  classSectionId: z.uuid(),
  reason: z
    .string()
    .min(1, "Say why this session is being cancelled.")
    .max(500)
    .transform((v) => v.trim()),
});
