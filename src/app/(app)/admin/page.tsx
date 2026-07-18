import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Admin · Attendance" };

/**
 * The admin home, standing in for the sidebar until §11.4's per-role nav lands
 * with the rest of the screens. Every card points at something that exists —
 * the moment one would point at "not built yet" it does not go here.
 */
const destinations = [
  {
    href: "/admin/semesters",
    title: "Semesters",
    blurb: "The terms sections and sessions live inside.",
  },
  {
    href: "/admin/courses",
    title: "Courses",
    blurb: "The catalogue, unique per academic year.",
  },
  {
    href: "/admin/sections",
    title: "Sections",
    blurb: "The classes that meet — reps and rosters hang off these.",
  },
  {
    href: "/instructor/reps",
    title: "Course reps",
    blurb: "Appoint, hand over and revoke section reps.",
  },
  {
    href: "/admin/import",
    title: "Import a roster",
    blurb: "Bring students and enrolments in from a CSV, preview first.",
  },
  {
    href: "/admin/calendar",
    title: "Calendar",
    blurb: "Holidays and emergencies that stop sessions.",
  },
];

export default async function AdminPage() {
  const user = await requireAdmin();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-24 font-semibold text-ink">Admin</h1>
        <p className="mt-1 max-w-prose text-13 text-mute">
          Signed in as {user.fullName}. Rules, reports and the audit log arrive
          in later phases.
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {destinations.map((d) => (
          <li key={d.href}>
            <Link
              href={d.href}
              className="block rounded-card border border-line p-4 transition-colors hover:bg-wash"
            >
              <h2 className="text-14 font-semibold text-ink">{d.title}</h2>
              <p className="mt-1 text-13 text-mute">{d.blurb}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
