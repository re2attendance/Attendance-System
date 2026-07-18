import type { Metadata } from "next";

import { SectionManager } from "@/features/courses/components/section-manager";
import { listFormOptions, listSections } from "@/features/courses/queries";
import { listParamsSchema } from "@/features/courses/schemas";
import { requireAdmin } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Sections · Attendance" };

export default async function SectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const params = listParamsSchema.parse(await searchParams);
  const [{ rows, total }, options] = await Promise.all([
    listSections(params),
    listFormOptions(),
  ]);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-24 font-semibold text-ink">Sections</h1>
        <p className="mt-1 max-w-prose text-13 text-mute">
          The classes that meet. Enrolments, reps and sessions all belong to a
          section.
        </p>
      </div>

      <SectionManager
        rows={rows}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        options={options}
      />
    </div>
  );
}
