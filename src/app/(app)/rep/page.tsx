import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Rep · Attendance" };

export default async function RepPage() {
  const user = await requireUser();
  const sections = user.roles.filter(
    (r) => r.role === "course_rep" && r.scopeType === "class_section",
  );

  return (
    <div className="grid gap-4">
      <h1 className="text-24 font-semibold text-ink">Course rep</h1>
      <p className="max-w-prose text-13 text-mute">
        You hold a rep grant for {sections.length}{" "}
        {sections.length === 1 ? "section" : "sections"}. Sessions arrive in
        Phase 5 and the verification queue in Phase 6.
      </p>
      <p className="max-w-prose text-12 text-mute">
        A grant is not authority: what lets you act is an appointment in
        course_rep_assignments, with a start and an end, and the database checks
        that on every request (§4).
      </p>
    </div>
  );
}
