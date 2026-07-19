import "server-only";

import type { CurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type { AttendanceStatus, SessionStatus } from "@/features/attendance/rules/types";

/**
 * RSC reads for the attendance screens. RLS-enforced throughout: a student sees
 * their own sessions and their own record on each; a rep sees the verify queue
 * only for sections they administer (sessions_read + records_read_section +
 * profiles_read_own_students, all in 0011).
 */

export type TodaySession = {
  id: string;
  courseCode: string;
  courseTitle: string;
  sectionCode: string;
  room: string | null;
  startsAt: string;
  endsAt: string;
  sessionStatus: SessionStatus;
  /** This student's record for the session, if they have one yet. */
  myStatus: AttendanceStatus | null;
  mySubmittedAt: string | null;
  /** The pinned rule window, so the live card can preview present/late with the
   * same numbers the server will judge by. Never the code — students never see
   * the code from the API; it lives only on the session display. */
  presentWithinMinutes: number;
  lateWithinMinutes: number;
};

/**
 * The student's sessions for today, in the institution's calendar. `session_date`
 * is stored as the local calendar date (generate_sessions, 0017), so "today" is
 * a string comparison once we know the institution's timezone — no drift to the
 * viewer's clock, which may be anywhere.
 */
export async function listTodaySessions(user: CurrentUser): Promise<TodaySession[]> {
  const supabase = await createClient();

  const { data: inst } = await supabase
    .from("institutions")
    .select("timezone")
    .eq("id", user.institutionId)
    .single();

  const tz = inst?.timezone ?? "UTC";
  // en-CA renders YYYY-MM-DD, which is exactly the session_date shape.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

  const { data, error } = await supabase
    .from("attendance_sessions")
    .select(
      `id, starts_at, ends_at, status, room,
       class_sections!inner(section_code, courses!inner(code, title)),
       attendance_rule_snapshots!inner(present_within_minutes, late_within_minutes),
       attendance_records(status, submitted_at)`,
    )
    .eq("session_date", today)
    .order("starts_at");

  if (error) throw new Error(`listTodaySessions: ${error.message}`);

  return (data ?? []).map((s) => {
    // The embedded records are RLS-filtered to this student's own, so there is
    // at most one — their record for this session.
    const mine = s.attendance_records[0] ?? null;
    return {
      id: s.id,
      courseCode: s.class_sections.courses.code,
      courseTitle: s.class_sections.courses.title,
      sectionCode: s.class_sections.section_code,
      room: s.room,
      startsAt: s.starts_at,
      endsAt: s.ends_at,
      sessionStatus: s.status,
      myStatus: mine?.status ?? null,
      mySubmittedAt: mine?.submitted_at ?? null,
      presentWithinMinutes: s.attendance_rule_snapshots.present_within_minutes,
      lateWithinMinutes: s.attendance_rule_snapshots.late_within_minutes,
    };
  });
}

export type VerifyContext = {
  sessionId: string;
  classSectionId: string;
  courseCode: string;
  courseTitle: string;
  sectionCode: string;
  sessionStatus: SessionStatus;
  startsAt: string;
  endsAt: string;
};

/**
 * The session a rep/instructor is about to run a verify queue for. Returns null
 * when it does not exist OR the caller cannot administer it — the page turns
 * both into a 404, so a stranger cannot even distinguish "no such session" from
 * "not yours". Ownership is mirrored from RLS here for the read; RLS is what
 * actually refuses the writes behind it.
 */
export async function getVerifyContext(
  sessionId: string,
  user: CurrentUser,
): Promise<VerifyContext | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("attendance_sessions")
    .select(
      `id, class_section_id, status, starts_at, ends_at,
       class_sections!inner(section_code, instructor_id, courses!inner(code, title))`,
    )
    .eq("id", sessionId)
    .maybeSingle();

  if (error) throw new Error(`getVerifyContext: ${error.message}`);
  if (!data) return null;

  const canAdminister =
    isAdmin(user) ||
    data.class_sections.instructor_id === user.id ||
    user.repSectionIds.includes(data.class_section_id);
  if (!canAdminister) return null;

  return {
    sessionId: data.id,
    classSectionId: data.class_section_id,
    courseCode: data.class_sections.courses.code,
    courseTitle: data.class_sections.courses.title,
    sectionCode: data.class_sections.section_code,
    sessionStatus: data.status,
    startsAt: data.starts_at,
    endsAt: data.ends_at,
  };
}

export type QueueRecord = {
  id: string;
  studentId: string;
  studentName: string;
  matricNumber: string | null;
  submittedAt: string | null;
  status: AttendanceStatus;
  flags: string[];
};

/**
 * The pending queue for a session — the requests awaiting a verdict. Oldest
 * first: the student who has been waiting longest is decided first, which is
 * both fair and what keeps the hall moving (§11.5). Includes the anti-proxy
 * flags so a shared-device pair is visible to the human deciding.
 *
 * `unverified` rows (a closed session nobody got to, ADR-010) are included: they
 * are still decidable, and a rep catching up after class should see them.
 */
export async function listVerifyQueue(sessionId: string): Promise<QueueRecord[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("attendance_records")
    .select(
      `id, student_id, submitted_at, status, anti_proxy_flags,
       profiles!student_id(full_name, matric_number)`,
    )
    .eq("session_id", sessionId)
    .in("status", ["pending_verification", "unverified"])
    .order("submitted_at", { ascending: true, nullsFirst: true });

  if (error) throw new Error(`listVerifyQueue: ${error.message}`);

  return (data ?? []).map((r) => ({
    id: r.id,
    studentId: r.student_id,
    studentName: r.profiles.full_name,
    matricNumber: r.profiles.matric_number,
    submittedAt: r.submitted_at,
    status: r.status,
    flags: r.anti_proxy_flags ?? [],
  }));
}
