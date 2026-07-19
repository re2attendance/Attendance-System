import "server-only";

import type { ListParams } from "@/features/courses";
import { isAdmin } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * RSC reads for the section-management screen. RLS-enforced: schedule_rules and
 * attendance_sessions are readable by the section's administrators (instructor,
 * admin, active rep) and its enrolled students, so an instructor viewing their
 * own section sees everything and a stranger sees nothing.
 */

export type InstructorSection = {
  id: string;
  courseCode: string;
  courseTitle: string;
  sectionCode: string;
  semesterName: string;
  ruleCount: number;
  openCount: number;
};

/**
 * The sections this user manages, for the index that lists them. Scoped exactly
 * as listRepSections is (§5, ADR-005): an instructor sees their own sections,
 * an admin sees all. The counts are the two things worth seeing before you
 * click in — is a schedule set up at all, and is anything open right now.
 */
export async function listInstructorSections(
  user: CurrentUser,
): Promise<InstructorSection[]> {
  const supabase = await createClient();

  let query = supabase
    .from("class_sections")
    .select(
      `id, section_code,
       courses!inner(code, title),
       semesters!inner(name),
       schedule_rules(count),
       attendance_sessions(count)`,
    )
    // Only the open sessions count toward the "live now" badge; the embedded
    // filter keeps that count honest without a second round-trip.
    .eq("attendance_sessions.status", "open");

  // Admin administers everything; an instructor only their own sections.
  if (!isAdmin(user)) query = query.eq("instructor_id", user.id);

  const { data, error } = await query
    .order("code", { referencedTable: "courses" })
    .order("section_code");

  if (error) throw new Error(`listInstructorSections: ${error.message}`);

  return (data ?? []).map((s) => ({
    id: s.id,
    courseCode: s.courses.code,
    courseTitle: s.courses.title,
    sectionCode: s.section_code,
    semesterName: s.semesters.name,
    ruleCount: s.schedule_rules[0]?.count ?? 0,
    openCount: s.attendance_sessions[0]?.count ?? 0,
  }));
}

export type ManagedSection = {
  id: string;
  instructorId: string | null;
  courseCode: string;
  courseTitle: string;
  sectionCode: string;
  semesterName: string;
  /** The institution's timezone — the one clock the sessions were generated
   * against (§5). The client formats stored instants back to local wall time
   * with it, so "10:00" shows as 10:00 rather than drifting to the viewer's. */
  timezone: string;
};

export async function getManagedSection(
  sectionId: string,
): Promise<ManagedSection | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("class_sections")
    .select(
      "id, section_code, instructor_id, courses!inner(code, title), semesters!inner(name), institutions!inner(timezone)",
    )
    .eq("id", sectionId)
    .maybeSingle();

  if (error) throw new Error(`getManagedSection: ${error.message}`);
  if (!data) return null;

  return {
    id: data.id,
    instructorId: data.instructor_id,
    courseCode: data.courses.code,
    courseTitle: data.courses.title,
    sectionCode: data.section_code,
    semesterName: data.semesters.name,
    timezone: data.institutions.timezone,
  };
}

export type ScheduleRuleRow = {
  id: string;
  dayOfWeek: number;
  startsAtLocal: string;
  endsAtLocal: string;
  room: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export async function listScheduleRules(
  sectionId: string,
): Promise<ScheduleRuleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedule_rules")
    .select("id, day_of_week, starts_at_local, ends_at_local, room, effective_from, effective_to")
    .eq("class_section_id", sectionId)
    .order("day_of_week")
    .order("starts_at_local");

  if (error) throw new Error(`listScheduleRules: ${error.message}`);

  return (data ?? []).map((r) => ({
    id: r.id,
    dayOfWeek: r.day_of_week,
    // times come back as "HH:MM:SS"; the UI wants "HH:MM".
    startsAtLocal: r.starts_at_local.slice(0, 5),
    endsAtLocal: r.ends_at_local.slice(0, 5),
    room: r.room,
    effectiveFrom: r.effective_from,
    effectiveTo: r.effective_to,
  }));
}

export type SessionRow = {
  id: string;
  sessionDate: string;
  startsAt: string;
  endsAt: string;
  status: string;
  room: string | null;
  recordCount: number;
};

export async function listSessions(
  sectionId: string,
  params: ListParams,
): Promise<{ rows: SessionRow[]; total: number }> {
  const supabase = await createClient();
  const from = (params.page - 1) * params.pageSize;

  const { data, count, error } = await supabase
    .from("attendance_sessions")
    .select("id, session_date, starts_at, ends_at, status, room, attendance_records(count)", {
      count: "exact",
    })
    .eq("class_section_id", sectionId)
    // Newest first: the sessions someone manages (opening today's, reviewing
    // last week's) cluster at the recent end.
    .order("starts_at", { ascending: params.dir === "asc" ? true : false })
    .range(from, from + params.pageSize - 1);

  if (error) throw new Error(`listSessions: ${error.message}`);

  const rows: SessionRow[] = (data ?? []).map((s) => ({
    id: s.id,
    sessionDate: s.session_date,
    startsAt: s.starts_at,
    endsAt: s.ends_at,
    status: s.status,
    room: s.room,
    recordCount: s.attendance_records[0]?.count ?? 0,
  }));

  return { rows, total: count ?? 0 };
}
