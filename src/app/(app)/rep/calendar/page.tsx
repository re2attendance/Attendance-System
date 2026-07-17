import type { Metadata } from "next";

import { DeclareDayForm } from "@/features/calendar";
import { listDeclarableSections, listDeclaredDays } from "@/features/calendar/queries";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { forbidden } from "next/navigation";

export const metadata: Metadata = { title: "Declare a day · Attendance" };

/* The rep's half of ADR-012.
 *
 * They see ONLY their own sections, and no institution-wide option — a rep is a
 * student with a scoped grant, and "reps can declare a holiday" must never mean
 * an undergraduate closes the university. Hiding the option is cosmetic;
 * declare_calendar_event() and RLS are what actually refuse, and both are
 * tested. This just means they never try.
 *
 * listDeclarableSections() is RLS-enforced, but class_sections_read is
 * `using (true)` — a course catalogue is furniture, not a secret — so it
 * returns every section. The filter to "sections I actually represent" is
 * therefore done here, from the user's own grants. If it were wrong, the rep
 * would see a section they cannot use and get a clean error from the action.
 */
export default async function RepCalendarPage() {
  const user = await requireUser();

  const myGrants = user.roles.filter(
    (r) => r.role === "course_rep" && r.scopeType === "class_section" && r.scopeId,
  );

  if (myGrants.length === 0) forbidden();

  const mySectionIds = new Set(myGrants.map((r) => r.scopeId));
  const allSections = await listDeclarableSections();
  const sections = allSections.filter((s) => mySectionIds.has(s.id));

  const supabase = await createClient();
  const { data: today } = await supabase.rpc("institution_today", {
    p_institution_id: user.institutionId,
  });

  const declared = (await listDeclaredDays()).filter(
    (d) => d.scope === "institution" || sections.some((s) => d.sectionLabel?.startsWith(s.label.split(" · ")[0] ?? "")),
  );

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-24 font-semibold text-ink">Declare a day</h1>
        <p className="mt-1 max-w-prose text-13 text-mute">
          Mark a day as a holiday for a section you represent, or pronounce
          today an emergency if students cannot come in.
        </p>
      </div>

      <DeclareDayForm
        sections={sections}
        canDeclareInstitutionWide={false}
        institutionToday={today ?? new Date().toISOString().slice(0, 10)}
      />

      {declared.length > 0 ? (
        <div>
          <h2 className="text-14 font-semibold text-ink">Days already declared</h2>
          <ul className="mt-2 divide-y divide-line rounded-card border border-line">
            {declared.map((d) => (
              <li key={d.id} className="flex flex-wrap items-baseline gap-x-3 px-3 py-2.5">
                <span className="font-mono text-12 text-mute" data-numeric>
                  {d.startsOn}
                </span>
                <span className="text-13 text-ink">{d.title}</span>
                <span className="text-12 text-mute">
                  {d.scope === "institution" ? "whole institution" : d.sectionLabel}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
