import { z } from "zod";

/**
 * One schema per form, shared by React Hook Form and the Server Action.
 *
 * These mirror the CHECK constraints in 0003/0005 rather than inventing new
 * rules. Where the database says `level between 100 and 900`, so does this —
 * the point is a readable error before the round-trip, not a second opinion.
 * If they ever disagree, the database wins and this is the bug.
 */

/**
 * Course codes: "CSC 401", "MTH 401". Normalised to one internal space and
 * upper case, because `csc401`, `CSC  401` and `Csc 401` are the same course
 * and a registrar's CSV will contain all three.
 */
export const courseCodeSchema = z
  .string()
  .min(1, "Enter a course code.")
  .max(20, "That course code is too long.")
  .transform((v) => v.trim().toUpperCase().replace(/\s+/g, " "));

export const levelSchema = z.coerce
  .number()
  .int("Level must be a whole number.")
  .min(100, "Level must be between 100 and 900.")
  .max(900, "Level must be between 100 and 900.");

export const createCourseSchema = z.object({
  code: courseCodeSchema,
  title: z
    .string()
    .min(1, "Enter a course title.")
    .max(200, "That title is too long.")
    .transform((v) => v.trim()),
  creditUnits: z.coerce
    .number()
    .int("Credit units must be a whole number.")
    .min(0, "Credit units cannot be negative.")
    .max(30, "That is more than 30 credit units."),
  level: levelSchema,
  departmentId: z.uuid("Choose a department."),
  academicYearId: z.uuid("Choose an academic year."),
});
export type CreateCourseInput = z.infer<typeof createCourseSchema>;

export const updateCourseSchema = createCourseSchema.extend({
  id: z.uuid(),
});
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;

/**
 * A section is one offering of a course: the class that actually meets, with a
 * room, an instructor and a roster. Enrolments and sessions both hang off it.
 *
 * `sectionCode` is "A"/"B"/"Morning" — whatever distinguishes two offerings of
 * the same course in the same semester. Institutions that do not split courses
 * have exactly one, and the admin UI creates it for them rather than making
 * someone type "A" twelve times.
 */
export const createSectionSchema = z.object({
  courseId: z.uuid("Choose a course."),
  semesterId: z.uuid("Choose a semester."),
  sectionCode: z
    .string()
    .min(1, "Enter a section code.")
    .max(20, "That section code is too long.")
    .transform((v) => v.trim().toUpperCase()),
  instructorId: z.uuid().nullable().default(null),
  capacity: z.coerce
    .number()
    .int()
    .positive("Capacity must be more than zero.")
    .nullable()
    .default(null),
  room: z.string().max(60).nullable().default(null),
});
export type CreateSectionInput = z.infer<typeof createSectionSchema>;

export const updateSectionSchema = createSectionSchema.extend({
  id: z.uuid(),
});
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;

export const createSemesterSchema = z
  .object({
    academicYearId: z.uuid("Choose an academic year."),
    name: z
      .string()
      .min(1, "Enter a semester name.")
      .max(60)
      .transform((v) => v.trim()),
    startsOn: z.string().min(1, "Choose a start date."),
    endsOn: z.string().min(1, "Choose an end date."),
    addDropDeadline: z.string().nullable().default(null),
  })
  .refine((d) => d.endsOn > d.startsOn, {
    message: "The end date must be after the start date.",
    path: ["endsOn"],
  })
  .refine(
    (d) =>
      !d.addDropDeadline ||
      (d.addDropDeadline >= d.startsOn && d.addDropDeadline <= d.endsOn),
    {
      message: "The add/drop deadline must fall inside the semester.",
      path: ["addDropDeadline"],
    },
  );
export type CreateSemesterInput = z.infer<typeof createSemesterSchema>;

/** Shared by every server-side table (§3). */
export const listParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(100).optional(),
  sort: z.string().max(40).optional(),
  dir: z.enum(["asc", "desc"]).default("asc"),
});
export type ListParams = z.infer<typeof listParamsSchema>;
