import type { Metadata } from "next";

import { CourseManager } from "@/features/courses/components/course-manager";
import { listCourses, listFormOptions } from "@/features/courses/queries";
import { listParamsSchema } from "@/features/courses/schemas";
import { requireAdmin } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Courses · Attendance" };

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const params = listParamsSchema.parse(await searchParams);
  const [{ rows, total }, options] = await Promise.all([
    listCourses(params),
    listFormOptions(),
  ]);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-24 font-semibold text-ink">Courses</h1>
        <p className="mt-1 max-w-prose text-13 text-mute">
          The catalogue. A course is unique per academic year — the same code in
          a different year is a different course.
        </p>
      </div>

      <CourseManager
        rows={rows}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        options={options}
      />
    </div>
  );
}
