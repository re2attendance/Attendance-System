"use server";

import { revalidatePath } from "next/cache";

import { AppError } from "@/lib/errors";
import { authedAction } from "@/lib/safe-action";
import {
  createCourseSchema,
  createSectionSchema,
  createSemesterSchema,
  updateCourseSchema,
  updateSectionSchema,
} from "./schemas";

/**
 * Writes. Every one goes through safe-action: auth → zod → authz → run → audit.
 *
 * Note what these DON'T do: re-check who may write. `courses_admin` and
 * `class_sections_admin` in 0011 already refuse anyone else, and those policies
 * have tests. The `authorize` metadata below keeps the button off the wrong
 * screen and produces a readable error; the database is what actually says no.
 *
 * The pattern for translating a refusal: 42501 is RLS, 23505 is a unique
 * constraint. Both are the database making a decision correctly — the job here
 * is to turn a SQLSTATE into a sentence a registrar can act on, not to
 * second-guess it.
 */

export const createCourse = authedAction
  .metadata({
    name: "create-course",
    authorize: "course.manage",
    audit: { action: "course.created", entityType: "course" },
  })
  .inputSchema(createCourseSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { data, error } = await ctx.supabase
      .from("courses")
      .insert({
        institution_id: ctx.user.institutionId,
        department_id: parsedInput.departmentId,
        academic_year_id: parsedInput.academicYearId,
        code: parsedInput.code,
        title: parsedInput.title,
        credit_units: parsedInput.creditUnits,
        level: parsedInput.level,
      })
      .select("id, code")
      .single();

    if (error) {
      // §5: unique per (institution, academic_year, code). CSC 401 in 2024/25
      // and CSC 401 in 2025/26 are different rows on purpose — the syllabus
      // changes, and last year's attendance must not follow this year's course.
      if (error.code === "23505") {
        throw new AppError(
          `${parsedInput.code} already exists for that academic year. Courses are unique per year — the same code in a different year is a different course.`,
        );
      }
      if (error.code === "42501") throw new AppError("You cannot create courses.");
      throw new AppError(`Could not create the course: ${error.message}`);
    }

    revalidatePath("/admin/courses");
    return { id: data.id, code: data.code };
  });

export const updateCourse = authedAction
  .metadata({
    name: "update-course",
    authorize: "course.manage",
    audit: { action: "course.updated", entityType: "course" },
  })
  .inputSchema(updateCourseSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { id, ...fields } = parsedInput;

    const { data, error } = await ctx.supabase
      .from("courses")
      .update({
        department_id: fields.departmentId,
        academic_year_id: fields.academicYearId,
        code: fields.code,
        title: fields.title,
        credit_units: fields.creditUnits,
        level: fields.level,
      })
      .eq("id", id)
      .select("id, code")
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new AppError(`${fields.code} already exists for that academic year.`);
      }
      throw new AppError(`Could not update the course: ${error.message}`);
    }

    revalidatePath("/admin/courses");
    return { id: data.id, code: data.code };
  });

export const createSection = authedAction
  .metadata({
    name: "create-section",
    authorize: "section.manage",
    audit: { action: "section.created", entityType: "class_section" },
  })
  .inputSchema(createSectionSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { data, error } = await ctx.supabase
      .from("class_sections")
      .insert({
        institution_id: ctx.user.institutionId,
        course_id: parsedInput.courseId,
        semester_id: parsedInput.semesterId,
        section_code: parsedInput.sectionCode,
        instructor_id: parsedInput.instructorId,
        capacity: parsedInput.capacity,
        room: parsedInput.room,
      })
      .select("id, section_code")
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new AppError(
          `Section ${parsedInput.sectionCode} already exists for that course this semester.`,
        );
      }
      if (error.code === "42501") throw new AppError("You cannot create sections.");
      throw new AppError(`Could not create the section: ${error.message}`);
    }

    revalidatePath("/admin/sections");
    return { id: data.id, sectionCode: data.section_code };
  });

export const updateSection = authedAction
  .metadata({
    name: "update-section",
    authorize: "section.manage",
    audit: { action: "section.updated", entityType: "class_section" },
  })
  .inputSchema(updateSectionSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { id, ...fields } = parsedInput;

    const { data, error } = await ctx.supabase
      .from("class_sections")
      .update({
        course_id: fields.courseId,
        semester_id: fields.semesterId,
        section_code: fields.sectionCode,
        instructor_id: fields.instructorId,
        capacity: fields.capacity,
        room: fields.room,
      })
      .eq("id", id)
      .select("id, section_code")
      .single();

    if (error) throw new AppError(`Could not update the section: ${error.message}`);

    revalidatePath("/admin/sections");
    return { id: data.id, sectionCode: data.section_code };
  });

export const createSemester = authedAction
  .metadata({
    name: "create-semester",
    authorize: "course.manage",
    audit: { action: "semester.created", entityType: "semester" },
  })
  .inputSchema(createSemesterSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { data, error } = await ctx.supabase
      .from("semesters")
      .insert({
        institution_id: ctx.user.institutionId,
        academic_year_id: parsedInput.academicYearId,
        name: parsedInput.name,
        starts_on: parsedInput.startsOn,
        ends_on: parsedInput.endsOn,
        add_drop_deadline: parsedInput.addDropDeadline,
        status: "upcoming",
      })
      .select("id, name")
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new AppError(`A semester called "${parsedInput.name}" already exists for that year.`);
      }
      throw new AppError(`Could not create the semester: ${error.message}`);
    }

    revalidatePath("/admin/semesters");
    return { id: data.id, name: data.name };
  });
