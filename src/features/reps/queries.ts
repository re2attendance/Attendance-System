import "server-only";

import { isAdmin } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * The sections a user may appoint reps for, with the reps they currently have.
 *
 * Scoped by the same rule RLS enforces (rep_assignments_instructor →
 * auth_is_instructor_for_section): an instructor sees their own sections, an
 * admin sees all. can("rep.appoint") is coarser than that — it is true for any
 * instructor regardless of section — so the scoping happens HERE, by only
 * listing sections the caller owns, rather than showing a section whose appoint
 * button RLS would refuse.
 */

export type RepRow = {
  assignmentId: string;
  userId: string;
  fullName: string;
  matricNumber: string | null;
  startsAt: string;
  endsAt: string | null;
  /**
   * Where the appointment sits relative to now, on the server's clock — the
   * only clock that decides anything (§5). Computed here rather than in the
   * component because "is this live?" depends on the current time, and reading
   * the clock during render is exactly the impurity the React compiler refuses.
   *   · active    — starts_at <= now < ends_at, the rep today
   *   · scheduled — starts_at in the future, a handover not yet begun
   *   · ended     — ends_at has passed, on the books but no longer authoritative
   */
  state: "active" | "scheduled" | "ended";
};

export type RepSection = {
  id: string;
  courseCode: string;
  courseTitle: string;
  sectionCode: string;
  semesterName: string;
  reps: RepRow[];
};

export async function listRepSections(user: CurrentUser): Promise<RepSection[]> {
  const supabase = await createClient();

  let query = supabase
    .from("class_sections")
    .select(
      // profiles is reached from course_rep_assignments by three FKs (the rep,
      // who assigned, who revoked), so the embed names the one we mean.
      `id, section_code, course_id,
       courses!inner(code, title),
       semesters!inner(name),
       course_rep_assignments(
         id, user_id, starts_at, ends_at, revoked_at,
         profiles!course_rep_assignments_user_id_fkey(full_name, matric_number)
       )`,
    );

  // Admin administers everything; an instructor only their own sections.
  if (!isAdmin(user)) query = query.eq("instructor_id", user.id);

  const { data, error } = await query;
  if (error) throw new Error(`listRepSections: ${error.message}`);

  const now = Date.now();

  const sections: RepSection[] = (data ?? []).map((s) => ({
    id: s.id,
    courseCode: s.courses.code,
    courseTitle: s.courses.title,
    sectionCode: s.section_code,
    semesterName: s.semesters.name,
    reps: (s.course_rep_assignments ?? [])
      // An appointment that was revoked is history, not a current rep. The row
      // stays for "who was rep when this was approved?" (§4); this screen is
      // about who holds the job now, so revoked rows are left off.
      .filter((a) => a.revoked_at === null)
      .map((a) => {
        const startsAt = new Date(a.starts_at).getTime();
        const endsAt = a.ends_at ? new Date(a.ends_at).getTime() : null;
        const state: RepRow["state"] =
          startsAt > now ? "scheduled" : endsAt !== null && endsAt <= now ? "ended" : "active";
        return {
          assignmentId: a.id,
          userId: a.user_id,
          fullName: a.profiles?.full_name ?? "Unknown student",
          matricNumber: a.profiles?.matric_number ?? null,
          startsAt: a.starts_at,
          endsAt: a.ends_at,
          state,
        };
      })
      // Newest appointment first, so the current rep reads at the top.
      .sort((a, b) => (a.startsAt < b.startsAt ? 1 : -1)),
  }));

  // Grouped by course, then section, so the list scans the way a timetable does.
  return sections.sort((a, b) =>
    a.courseCode === b.courseCode
      ? a.sectionCode.localeCompare(b.sectionCode)
      : a.courseCode.localeCompare(b.courseCode),
  );
}
