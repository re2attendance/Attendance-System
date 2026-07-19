import type { Metadata } from "next";
import Link from "next/link";

import { listRepSessions } from "@/features/attendance/queries";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Rep · Attendance" };

export const dynamic = "force-dynamic";

/**
 * The rep's day: today's sessions in the sections they are appointed to, each a
 * way into its verify queue. Scoped to a LIVE appointment (§4) — a rep whose
 * term ended sees nothing here, because there is nothing they may still work.
 */
export default async function RepPage() {
  const user = await requireUser();
  const { timezone, sessions } = await listRepSessions(user);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-24 font-semibold text-ink">Course rep</h1>
        <p className="mt-1 max-w-prose text-13 text-mute">
          Today&apos;s sessions for the sections you run. Open one to verify who
          reported present.
        </p>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-card border border-line p-6 text-13 text-mute">
          Nothing scheduled for your sections today. When a session runs, it
          appears here with its verify queue.
        </div>
      ) : (
        <ul className="grid gap-3">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link
                href={`/rep/sessions/${s.id}/verify`}
                className="flex items-center justify-between gap-3 rounded-card border border-line p-4 transition-colors hover:bg-wash"
              >
                <div className="min-w-0">
                  <p className="font-mono text-14 font-semibold text-ink" data-numeric>
                    {s.courseCode} · {s.sectionCode}
                  </p>
                  <p className="mt-0.5 text-12 text-mute" data-numeric>
                    {fmtTime(s.startsAt, timezone)}–{fmtTime(s.endsAt, timezone)}
                    {s.room ? ` · ${s.room}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {s.sessionStatus === "open" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-chip border border-line px-2 py-0.5 text-12 text-mute">
                      <span
                        aria-hidden
                        className="size-1.5 rounded-full bg-status-present motion-safe:animate-pulse"
                      />
                      Open
                    </span>
                  ) : null}
                  {s.pendingCount > 0 ? (
                    <span
                      className="inline-flex min-w-6 items-center justify-center rounded-chip border border-status-pending px-1.5 py-0.5 font-mono text-12 text-mute"
                      data-numeric
                    >
                      {s.pendingCount}
                    </span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function fmtTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
