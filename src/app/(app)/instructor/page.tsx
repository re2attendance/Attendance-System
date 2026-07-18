import type { Metadata } from "next";
import Link from "next/link";

import { requireInstructor } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Instructor · Attendance" };

/**
 * The instructor home, standing in for the sidebar until §11.4's per-role nav
 * lands. Every card points at something that exists.
 */
const destinations = [
  {
    href: "/instructor/reps",
    title: "Course reps",
    blurb: "Appoint, hand over and revoke the reps for your sections.",
  },
];

export default async function InstructorPage() {
  const user = await requireInstructor();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-24 font-semibold text-ink">Instructor</h1>
        <p className="mt-1 max-w-prose text-13 text-mute">
          Signed in as {user.fullName}. Sessions, overrides and reports arrive in
          later phases.
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
