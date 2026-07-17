import type { Metadata } from "next";

import { requireInstructor } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Instructor · Attendance" };

export default async function InstructorPage() {
  const user = await requireInstructor();

  return (
    <div className="grid gap-4">
      <h1 className="text-24 font-semibold text-ink">Instructor</h1>
      <p className="max-w-prose text-13 text-mute">
        Signed in as {user.fullName}. Courses, rep appointment and overrides
        arrive in Phase 4.
      </p>
    </div>
  );
}
