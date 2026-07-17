import "server-only";

import { createClient } from "@/lib/supabase/server";
import { parseCsv, type CsvRow, type RowError } from "./parse";

/**
 * The dry run.
 *
 * §14 asks for a "dry-run preview + per-row error report", and the preview is
 * the feature — not a nicety in front of it. An administrator about to change
 * 300 academic records should see exactly what will happen first, in a form
 * they can check against the spreadsheet on their other screen.
 *
 * The rule this file follows: **the preview must not lie.** Anything it reports
 * as "will be enrolled" has to be enrolled when they press the button. So every
 * check the commit will make is made here too — course and section resolution,
 * whether the student exists, whether they are already on the register — and
 * `commit` re-runs this rather than trusting a plan the client sends back.
 */

export type PlannedRow = CsvRow & {
  sectionId: string;
  studentId: string | null;
  /** enrol now · invite then enrol · already there */
  outcome: "enroll" | "invite" | "already_enrolled";
};

export type ImportPlan = {
  rows: PlannedRow[];
  errors: RowError[];
  counts: {
    enroll: number;
    invite: number;
    alreadyEnrolled: number;
    errors: number;
    total: number;
  };
};

export type PlanResult = { headerError: string } | ImportPlan;

export async function planImport(
  csvText: string,
  semesterId: string,
): Promise<PlanResult> {
  const parsed = parseCsv(csvText);
  if ("headerError" in parsed) return parsed;

  const supabase = await createClient();
  const errors: RowError[] = [...parsed.errors];

  // Resolve every course+section referenced in the file, in ONE query rather
  // than one per row. A 300-row import that issues 300 round-trips is a
  // 300-round-trip import.
  const { data: sections, error: sectionsError } = await supabase
    .from("class_sections")
    .select("id, section_code, courses!inner(code)")
    .eq("semester_id", semesterId);

  if (sectionsError) {
    throw new Error(`planImport: could not read sections: ${sectionsError.message}`);
  }

  const sectionByKey = new Map<string, string>();
  for (const s of sections ?? []) {
    sectionByKey.set(`${s.courses.code.toUpperCase()}|${s.section_code.toUpperCase()}`, s.id);
  }

  // Same for students, matched on matric number. Matric rather than email: an
  // address changes and a matric does not, and the registrar's file is
  // authoritative about matrics in a way it is not about anything else.
  const matrics = [...new Set(parsed.rows.map((r) => r.matricNumber))];
  const { data: students, error: studentsError } = await supabase
    .from("profiles")
    .select("id, matric_number")
    .in("matric_number", matrics.length > 0 ? matrics : ["__none__"]);

  if (studentsError) {
    throw new Error(`planImport: could not read students: ${studentsError.message}`);
  }

  const studentByMatric = new Map<string, string>();
  for (const p of students ?? []) {
    if (p.matric_number) studentByMatric.set(p.matric_number.toUpperCase(), p.id);
  }

  const studentIds = [...studentByMatric.values()];
  const { data: existing } = await supabase
    .from("enrollments")
    .select("student_id, class_section_id")
    .in("student_id", studentIds.length > 0 ? studentIds : ["00000000-0000-0000-0000-000000000000"]);

  const alreadyEnrolled = new Set(
    (existing ?? []).map((e) => `${e.student_id}|${e.class_section_id}`),
  );

  const rows: PlannedRow[] = [];

  for (const row of parsed.rows) {
    const sectionId = sectionByKey.get(`${row.courseCode}|${row.sectionCode}`);

    if (!sectionId) {
      // The most common real failure: a course code that does not exist this
      // semester, usually a typo or last year's file. Naming both halves —
      // course AND section — saves a round of "which bit is wrong?".
      errors.push({
        line: row.line,
        message: `there is no section "${row.sectionCode}" of ${row.courseCode} in this semester`,
        raw: { ...row, line: String(row.line) },
      });
      continue;
    }

    const studentId = studentByMatric.get(row.matricNumber.toUpperCase()) ?? null;

    const outcome: PlannedRow["outcome"] = !studentId
      ? "invite"
      : alreadyEnrolled.has(`${studentId}|${sectionId}`)
        ? "already_enrolled"
        : "enroll";

    rows.push({ ...row, sectionId, studentId, outcome });
  }

  return {
    rows,
    errors: errors.sort((a, b) => a.line - b.line),
    counts: {
      enroll: rows.filter((r) => r.outcome === "enroll").length,
      invite: rows.filter((r) => r.outcome === "invite").length,
      alreadyEnrolled: rows.filter((r) => r.outcome === "already_enrolled").length,
      errors: errors.length,
      total: rows.length + errors.length,
    },
  };
}
