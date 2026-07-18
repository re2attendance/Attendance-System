import type { Metadata } from "next";

import { SemesterManager } from "@/features/courses/components/semester-manager";
import { listFormOptions, listSemesters } from "@/features/courses/queries";
import { requireAdmin } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Semesters · Attendance" };

export default async function SemestersPage() {
  await requireAdmin();

  const [rows, options] = await Promise.all([
    listSemesters(),
    listFormOptions(),
  ]);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-24 font-semibold text-ink">Semesters</h1>
        <p className="mt-1 max-w-prose text-13 text-mute">
          The terms sections and sessions live inside. Create a semester before
          adding sections to it.
        </p>
      </div>

      <SemesterManager rows={rows} options={options} />
    </div>
  );
}
