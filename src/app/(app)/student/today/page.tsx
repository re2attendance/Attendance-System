import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Today · Attendance" };

/* ★ The two-tap flow. Built in Phase 6 — this is the placeholder.
   No stats, no charts, no welcome banner (§11.6). */
export default async function TodayPage() {
  const user = await requireUser();

  return (
    <div className="grid gap-4">
      <h1 className="text-24 font-semibold text-ink">Today</h1>
      <p className="max-w-prose text-13 text-mute">
        Signed in as {user.fullName}. Live session cards and Report present
        arrive in Phase 6 — the rules engine and the schema behind them are
        built and tested; the screen is not.
      </p>
    </div>
  );
}
