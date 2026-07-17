import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Admin · Attendance" };

export default async function AdminPage() {
  const user = await requireAdmin();

  return (
    <div className="grid gap-4">
      <h1 className="text-24 font-semibold text-ink">Admin</h1>
      <p className="max-w-prose text-13 text-mute">
        Signed in as {user.fullName}. Users, courses, rules, reports and the
        audit log arrive in Phases 4-10.
      </p>
    </div>
  );
}
