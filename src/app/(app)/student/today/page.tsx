import type { Metadata } from "next";

import { LiveSessionCard } from "@/features/attendance/components/live-session-card";
import { listTodaySessions } from "@/features/attendance/queries";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Today · Attendance" };

// This page is the clock's opinion, not a cache's. It must reflect a session
// that opened a minute ago, so it renders per request.
export const dynamic = "force-dynamic";

/**
 * The two-tap flow (§11.6). No stats, no charts, no welcome banner — a student
 * on bad signal in a full hall wants one thing, and it is the button to report
 * present. Everything here serves that.
 */
export default async function TodayPage() {
  const user = await requireUser();
  const { timezone, sessions } = await listTodaySessions(user);

  // The one honest clock (§2.3). The card measures its own drift from this and
  // counts down against it, never against the device's own time.
  const serverNowMs = new Date().getTime();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-24 font-semibold text-ink">Today</h1>
        <p className="mt-1 text-13 text-mute">
          {sessions.length === 0
            ? "No classes scheduled for you today."
            : "Report present while a session is open. Your rep confirms it."}
        </p>
      </div>

      {sessions.length > 0 ? (
        <ul className="grid gap-3">
          {sessions.map((session) => (
            <LiveSessionCard
              key={session.id}
              session={session}
              serverNowMs={serverNowMs}
              timezone={timezone}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
