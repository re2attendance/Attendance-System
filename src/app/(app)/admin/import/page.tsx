import type { Metadata } from "next";

import { RosterImport } from "@/features/enrollment";
import { listSemesters } from "@/features/courses/queries";
import { requireAdmin } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Import roster · Attendance" };

export default async function ImportPage() {
  await requireAdmin();
  const semesters = await listSemesters();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-24 font-semibold text-ink">Import a roster</h1>
        <p className="mt-1 max-w-prose text-13 text-mute">
          Upload a CSV of students and the sections they are taking. You will
          see exactly what it does before anything is written.
        </p>
      </div>

      <RosterImport semesters={semesters.map((s) => ({ id: s.id, name: s.name }))} />
    </div>
  );
}
