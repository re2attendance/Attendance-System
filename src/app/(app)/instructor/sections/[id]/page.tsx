import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ScheduleRules } from "@/features/scheduling/components/schedule-rules";
import { SessionList } from "@/features/scheduling/components/session-list";
import {
  getManagedSection,
  listScheduleRules,
  listSessions,
} from "@/features/scheduling/queries";
import { listParamsSchema } from "@/features/courses";
import { requireInstructor } from "@/lib/auth/guards";
import { isAdmin } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Manage section · Attendance" };

/**
 * One section's control room: its weekly schedule, and the sessions generated
 * from it with the open/close/cancel controls.
 *
 * The gate is ownership, not just "an instructor". section.manage is coarse (any
 * instructor holds it — permissions.ts), so the precise scoping that RLS does
 * for the writes is mirrored here for the read: an instructor may only manage
 * their OWN sections, and asking for another's is a 404, not an empty page with
 * buttons that would 42501. Admin administers all.
 */
export default async function ManageSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireInstructor();
  const { id } = await params;

  const section = await getManagedSection(id);
  if (!section) notFound();
  if (!isAdmin(user) && section.instructorId !== user.id) notFound();

  const listParams = listParamsSchema.parse(await searchParams);
  const [rules, sessions] = await Promise.all([
    listScheduleRules(id),
    listSessions(id, listParams),
  ]);

  return (
    <div className="grid gap-8">
      <div>
        <Link href="/instructor/sections" className="text-13 text-mute hover:text-ink">
          ← My sections
        </Link>
        <h1 className="mt-2 text-24 font-semibold text-ink">
          <span className="font-mono" data-numeric>
            {section.courseCode} · {section.sectionCode}
          </span>
        </h1>
        <p className="mt-1 text-13 text-mute">
          {section.courseTitle} · {section.semesterName}
        </p>
      </div>

      <ScheduleRules classSectionId={id} rules={rules} />

      <SessionList
        classSectionId={id}
        timezone={section.timezone}
        rows={sessions.rows}
        total={sessions.total}
        page={listParams.page}
        pageSize={listParams.pageSize}
      />
    </div>
  );
}
