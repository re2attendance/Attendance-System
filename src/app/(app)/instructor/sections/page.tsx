import type { Metadata } from "next";
import Link from "next/link";

import { listInstructorSections } from "@/features/scheduling/queries";
import { requireInstructor } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Sections · Attendance" };

/**
 * The sections this instructor runs — the way into managing each one's schedule
 * and sessions. Admins see every section (they administer all of them); an
 * instructor sees only their own, scoped in the query the same way RLS scopes
 * the writes behind it.
 */
export default async function InstructorSectionsPage() {
  const user = await requireInstructor();
  const sections = await listInstructorSections(user);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-24 font-semibold text-ink">My sections</h1>
        <p className="mt-1 max-w-prose text-13 text-mute">
          Set each section&apos;s weekly schedule, generate its sessions, and open
          or close them as the term runs.
        </p>
      </div>

      {sections.length === 0 ? (
        <div className="rounded-card border border-line p-6 text-13 text-mute">
          You have no sections assigned. An administrator assigns an instructor to
          a section, and it appears here once they do.
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((s) => (
            <li key={s.id}>
              <Link
                href={`/instructor/sections/${s.id}`}
                className="block rounded-card border border-line p-4 transition-colors hover:bg-wash"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-14 font-semibold text-ink" data-numeric>
                    {s.courseCode} · {s.sectionCode}
                  </span>
                  {s.openCount > 0 ? (
                    <span className="inline-flex items-center gap-1.5 rounded-chip border border-line px-2 py-0.5 text-12 text-mute">
                      <span
                        aria-hidden="true"
                        className="size-1.5 shrink-0 rounded-full bg-status-present motion-safe:animate-pulse"
                      />
                      Live
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 line-clamp-1 text-13 text-ink">{s.courseTitle}</p>
                <p className="mt-2 text-12 text-mute">
                  {s.semesterName} ·{" "}
                  {s.ruleCount === 0
                    ? "no schedule yet"
                    : `${s.ruleCount} schedule rule${s.ruleCount === 1 ? "" : "s"}`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
