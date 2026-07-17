import "server-only";

import { createClient } from "@/lib/supabase/server";

export type DeclarationImpact = {
  sessions: number;
  records: number;
  approvedRecords: number;
};

/**
 * What declaring this day would actually do.
 *
 * ConfirmDialog requires a `consequence` with counts, and this is where they
 * come from. "Are you sure?" asks a question the person cannot answer. "This
 * cancels 3 sessions and voids 47 records, 12 of them already approved" is a
 * question they can.
 *
 * That matters most for an emergency, which is irreversible in the way that
 * counts: it voids attendance students already earned and reps already
 * approved. Someone about to do that to 47 people should see the 47.
 *
 * Read-only and RLS-enforced, so a rep sees the impact on their own section and
 * an admin sees the institution's. It reproduces the same scope logic
 * declare_calendar_event() uses — if the two ever disagree, the number shown is
 * wrong and the action is right, which is the correct way round for a preview.
 */
export async function previewDeclarationImpact(
  date: string,
  classSectionId: string | null,
): Promise<DeclarationImpact> {
  const supabase = await createClient();

  let sessionQuery = supabase
    .from("attendance_sessions")
    .select("id, attendance_records(status)")
    .eq("session_date", date)
    .neq("status", "cancelled");

  if (classSectionId) {
    sessionQuery = sessionQuery.eq("class_section_id", classSectionId);
  }

  const { data, error } = await sessionQuery;

  if (error) throw new Error(`previewDeclarationImpact: ${error.message}`);

  const sessions = data ?? [];
  const records = sessions.flatMap((s) => s.attendance_records);

  return {
    sessions: sessions.length,
    records: records.length,
    // The number that should make someone stop. These students reported
    // present and a rep confirmed it; declaring an emergency takes it back.
    approvedRecords: records.filter(
      (r) => r.status === "present" || r.status === "late",
    ).length,
  };
}

export type DeclaredDay = {
  id: string;
  title: string;
  eventType: string;
  startsOn: string;
  endsOn: string;
  scope: "institution" | "section";
  sectionLabel: string | null;
  declaredByName: string | null;
  reason: string | null;
};

export async function listDeclaredDays(): Promise<DeclaredDay[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("academic_calendar_events")
    .select(
      `id, title, event_type, starts_on, ends_on, reason, class_section_id,
       profiles(full_name),
       class_sections(section_code, courses(code))`,
    )
    .order("starts_on", { ascending: false })
    .limit(100);

  if (error) throw new Error(`listDeclaredDays: ${error.message}`);

  return (data ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    eventType: e.event_type,
    startsOn: e.starts_on,
    endsOn: e.ends_on,
    scope: e.class_section_id ? "section" : "institution",
    sectionLabel: e.class_sections
      ? `${e.class_sections.courses?.code ?? ""} ${e.class_sections.section_code}`.trim()
      : null,
    declaredByName: e.profiles?.full_name ?? null,
    reason: e.reason,
  }));
}

/** The sections this user may declare for — their own, or all of them. */
export async function listDeclarableSections() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("class_sections")
    .select("id, section_code, courses!inner(code, title)")
    .order("section_code");

  if (error) throw new Error(`listDeclarableSections: ${error.message}`);

  return (data ?? []).map((s) => ({
    id: s.id,
    label: `${s.courses.code} · ${s.section_code}`,
    courseTitle: s.courses.title,
  }));
}
