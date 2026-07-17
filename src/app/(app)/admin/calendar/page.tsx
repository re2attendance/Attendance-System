import type { Metadata } from "next";

import { DeclareDayForm } from "@/features/calendar";
import { listDeclarableSections, listDeclaredDays } from "@/features/calendar/queries";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Calendar · Attendance" };

export default async function AdminCalendarPage() {
  const user = await requireAdmin();

  const supabase = await createClient();
  // "Today" in the INSTITUTION's timezone, from the server. Not the browser's:
  // a server in Virginia and a campus in Accra disagree about the date for five
  // hours a night, and "an emergency is today only" is a rule about the
  // university's day (ADR-012).
  const { data: today } = await supabase.rpc("institution_today", {
    p_institution_id: user.institutionId,
  });

  const [sections, declared] = await Promise.all([
    listDeclarableSections(),
    listDeclaredDays(),
  ]);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-24 font-semibold text-ink">Calendar</h1>
        <p className="mt-1 max-w-prose text-13 text-mute">
          Days with no classes. Sessions are not generated on them, and students
          cannot submit attendance.
        </p>
      </div>

      <DeclareDayForm
        sections={sections}
        canDeclareInstitutionWide
        institutionToday={today ?? new Date().toISOString().slice(0, 10)}
      />

      <DeclaredList days={declared} />
    </div>
  );
}

function DeclaredList({
  days,
}: {
  days: Awaited<ReturnType<typeof listDeclaredDays>>;
}) {
  if (days.length === 0) {
    return (
      <div className="rounded-card border border-line px-6 py-10 text-center">
        <p className="text-14 text-ink">No days declared</p>
        <p className="mt-1 text-13 text-mute">
          Declare a holiday above, and it will appear here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-14 font-semibold text-ink">Declared days</h2>
      <ul className="mt-2 divide-y divide-line rounded-card border border-line">
        {days.map((d) => (
          <li key={d.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2.5">
            <span className="font-mono text-12 text-mute" data-numeric>
              {d.startsOn}
              {d.endsOn !== d.startsOn ? ` – ${d.endsOn}` : ""}
            </span>
            <span className="text-13 text-ink">{d.title}</span>
            <span className="rounded-chip border border-line px-1.5 text-12 text-mute">
              {d.eventType}
            </span>
            <span className="text-12 text-mute">
              {d.scope === "institution" ? "whole institution" : d.sectionLabel}
            </span>
            {d.declaredByName ? (
              <span className="ml-auto text-12 text-mute">
                declared by {d.declaredByName}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
