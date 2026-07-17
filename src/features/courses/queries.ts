import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ListParams } from "./schemas";

/**
 * RSC reads. RLS-enforced, so these return what the caller is allowed to see
 * and nothing else — courses_read and class_sections_read are `using (true)`
 * for any authenticated user, because a course catalogue is furniture, not a
 * secret.
 *
 * Server-side pagination throughout (§3). `count: "exact"` is a second query
 * under the hood, which is the price of a real total; at ~20 sections and ~12
 * courses it is free, and the shape is what matters when Phase 8 points this at
 * 10k students.
 */

export type CourseRow = {
  id: string;
  code: string;
  title: string;
  creditUnits: number;
  level: number;
  departmentName: string;
  academicYearName: string;
  sectionCount: number;
};

export async function listCourses(params: ListParams) {
  const supabase = await createClient();
  const from = (params.page - 1) * params.pageSize;

  let query = supabase
    .from("courses")
    .select(
      `id, code, title, credit_units, level,
       departments!inner(name),
       academic_years!inner(name),
       class_sections(count)`,
      { count: "exact" },
    );

  if (params.q) {
    // Code and title. A registrar looking for "compilers" and one looking for
    // "CSC 401" are the same person on different days.
    query = query.or(`code.ilike.%${params.q}%,title.ilike.%${params.q}%`);
  }

  const sortColumn = params.sort === "title" ? "title" : "code";

  const { data, count, error } = await query
    .order(sortColumn, { ascending: params.dir === "asc" })
    .range(from, from + params.pageSize - 1);

  if (error) throw new Error(`listCourses: ${error.message}`);

  const rows: CourseRow[] = (data ?? []).map((c) => ({
    id: c.id,
    code: c.code,
    title: c.title,
    creditUnits: c.credit_units,
    level: c.level,
    departmentName: c.departments.name,
    academicYearName: c.academic_years.name,
    sectionCount: c.class_sections[0]?.count ?? 0,
  }));

  return { rows, total: count ?? 0 };
}

export type SectionRow = {
  id: string;
  sectionCode: string;
  courseCode: string;
  courseTitle: string;
  semesterName: string;
  instructorName: string | null;
  room: string | null;
  capacity: number | null;
  enrolledCount: number;
};

export async function listSections(params: ListParams & { semesterId?: string }) {
  const supabase = await createClient();
  const from = (params.page - 1) * params.pageSize;

  let query = supabase
    .from("class_sections")
    .select(
      `id, section_code, room, capacity,
       courses!inner(code, title),
       semesters!inner(name),
       profiles(full_name),
       enrollments(count)`,
      { count: "exact" },
    );

  if (params.semesterId) query = query.eq("semester_id", params.semesterId);
  if (params.q) query = query.ilike("courses.code", `%${params.q}%`);

  const { data, count, error } = await query
    .order("section_code", { ascending: params.dir === "asc" })
    .range(from, from + params.pageSize - 1);

  if (error) throw new Error(`listSections: ${error.message}`);

  const rows: SectionRow[] = (data ?? []).map((s) => ({
    id: s.id,
    sectionCode: s.section_code,
    courseCode: s.courses.code,
    courseTitle: s.courses.title,
    semesterName: s.semesters.name,
    instructorName: s.profiles?.full_name ?? null,
    room: s.room,
    capacity: s.capacity,
    // Every enrolment row, including dropped. The roster view splits them; a
    // list needs one number, and "how many have ever been on this section" is
    // the one an admin means when scanning.
    enrolledCount: s.enrollments[0]?.count ?? 0,
  }));

  return { rows, total: count ?? 0 };
}

export async function listSemesters() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("semesters")
    .select("id, name, starts_on, ends_on, status, add_drop_deadline, academic_years!inner(name)")
    .order("starts_on", { ascending: false });

  if (error) throw new Error(`listSemesters: ${error.message}`);

  return (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    startsOn: s.starts_on,
    endsOn: s.ends_on,
    status: s.status,
    addDropDeadline: s.add_drop_deadline,
    academicYearName: s.academic_years.name,
  }));
}

/** For the pickers on the create forms. */
export async function listFormOptions() {
  const supabase = await createClient();

  const [departments, academicYears, semesters, instructors, courses] =
    await Promise.all([
      supabase.from("departments").select("id, name, code").order("name"),
      supabase.from("academic_years").select("id, name").order("starts_on", { ascending: false }),
      supabase.from("semesters").select("id, name").order("starts_on", { ascending: false }),
      // Instructors, via their role grant. RLS lets an admin read all profiles;
      // an instructor reads only their own students, so this list is admin-only
      // in practice — which is fine, because only admin creates sections.
      supabase
        .from("user_roles")
        .select("user_id, profiles!user_roles_user_id_fkey!inner(id, full_name)")
        .eq("role", "instructor"),
      supabase.from("courses").select("id, code, title").order("code"),
    ]);

  return {
    departments: departments.data ?? [],
    academicYears: academicYears.data ?? [],
    semesters: semesters.data ?? [],
    instructors: (instructors.data ?? []).map((r) => ({
      id: r.profiles.id,
      fullName: r.profiles.full_name,
    })),
    courses: courses.data ?? [],
  };
}
