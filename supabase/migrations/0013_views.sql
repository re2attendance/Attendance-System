-- 0013_views
--
-- The attendance percentage, maintained on write.
--
-- §5: "materialized view (or summary table) for attendance percentages,
-- refreshed on write — do not compute COUNT(*) across a term on every dashboard
-- load."
--
-- A summary TABLE, not a materialized view. A matview refreshes wholesale — for
-- 10k students × ~5 sections that is a full-table aggregate to reflect one
-- rep's approval, and REFRESH CONCURRENTLY still rebuilds everything. This
-- table is maintained per (student, section) by trigger, so one approval
-- touches one row.
--
-- The counts are FULLY RECOMPUTED for the affected pair rather than
-- incremented. Delta arithmetic ("status changed from pending to present, so
-- +1 present, -1 pending") is where summary tables go wrong: every missed edge
-- — a soft-delete, an override, a close_session sweep, a status corrected
-- twice — drifts the number, silently, and nothing ever recomputes it to
-- notice. A section is ~40 sessions; recomputing 40 rows is cheaper than being
-- wrong about a student's eligibility to sit an exam.

create table public.attendance_summaries (
  student_id uuid not null references public.profiles (id) on delete cascade,
  class_section_id uuid not null references public.class_sections (id) on delete cascade,

  present_count integer not null default 0,
  late_count integer not null default 0,
  absent_count integer not null default 0,
  rejected_count integer not null default 0,
  permission_granted_count integer not null default 0,
  excused_count integer not null default 0,
  cancelled_count integer not null default 0,
  pending_count integer not null default 0,

  -- ADR-010. Counted, never hidden: this number is the rep's failure made
  -- visible, and the low-attendance report should show it beside the
  -- percentage. A student with 12 unverified sessions has a broken section,
  -- not a broken attendance record.
  unverified_count integer not null default 0,

  -- The denominator. Excludes:
  --   · cancelled  — the class did not happen
  --   · excused    — the reason was flagged counts_as_excused (§5)
  --   · pending    — has not resolved into anything yet
  --   · unverified — ADR-010. The system never established a fact here, so it
  --                  asserts neither. Counting it as absent would charge the
  --                  student for a rep's inaction; counting it as attended
  --                  would make "submit and wait" a guaranteed pass and turn
  --                  verification into an honour system. Excluding is the only
  --                  answer that does not invent a fact.
  countable_total integer not null default 0,

  -- The numerator: present + late. A late student was in the room.
  --
  -- permission_granted is deliberately NOT here while remaining in the
  -- denominator — that is precisely what distinguishes it from excused. "We
  -- know why you missed it, and it still counts against you" is a real and
  -- necessary category, and collapsing it into either neighbour would erase a
  -- decision someone made on purpose.
  attended_count integer not null default 0,

  -- Null rather than 0 when nothing countable has happened yet. A student in
  -- week 1 has no attendance percentage; showing them 0% would be a lie that
  -- triggers a low-attendance warning (§9) on their first day.
  attendance_percent numeric(5, 2)
    generated always as (
      case
        when countable_total = 0 then null
        else round((attended_count::numeric * 100) / countable_total, 2)
      end
    ) stored,

  updated_at timestamptz not null default now(),

  primary key (student_id, class_section_id)
);

alter table public.attendance_summaries enable row level security;
alter table public.attendance_summaries force row level security;

-- Same shape as attendance_records: own, or your sections', or admin. A
-- percentage is as sensitive as the records it is computed from.
create policy summaries_read_own on public.attendance_summaries
  for select to authenticated using (student_id = (select auth.uid()));

create policy summaries_read_section on public.attendance_summaries
  for select to authenticated using (public.auth_can_administer_section(class_section_id));

create policy summaries_read_admin on public.attendance_summaries
  for select to authenticated using (public.auth_is_admin());

-- No write policies. This table is derived, and the trigger below (SECURITY
-- DEFINER) is its only author. Nothing with a user JWT can write a percentage.

create index summaries_section_percent_idx
  on public.attendance_summaries (class_section_id, attendance_percent);

-- The low-attendance / eligibility report (§10) and the warning job (§9).
-- Partial, because the interesting students are the minority — this index is
-- the size of the problem, not the size of the cohort.
create index summaries_at_risk_idx
  on public.attendance_summaries (class_section_id, student_id)
  where attendance_percent is not null and attendance_percent < 75;

create or replace function public.recalc_attendance_summary(
  p_student_id uuid,
  p_class_section_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.attendance_summaries as s (
    student_id, class_section_id,
    present_count, late_count, absent_count, rejected_count,
    permission_granted_count, excused_count, cancelled_count, pending_count,
    unverified_count, countable_total, attended_count, updated_at
  )
  select
    p_student_id,
    p_class_section_id,
    count(*) filter (where r.status = 'present'),
    count(*) filter (where r.status = 'late'),
    count(*) filter (where r.status = 'absent'),
    count(*) filter (where r.status = 'rejected'),
    count(*) filter (where r.status = 'permission_granted'),
    count(*) filter (where r.status = 'excused'),
    count(*) filter (where r.status = 'cancelled'),
    count(*) filter (where r.status in ('pending_verification', 'pending_permission_review')),
    count(*) filter (where r.status = 'unverified'),
    count(*) filter (
      where r.status in ('present', 'late', 'absent', 'rejected', 'permission_granted')
    ),
    count(*) filter (where r.status in ('present', 'late')),
    now()
  from public.attendance_records r
  where r.student_id = p_student_id
    and r.class_section_id = p_class_section_id
    -- Soft-deleted records are gone for every purpose, including this one.
    and r.deleted_at is null
  on conflict (student_id, class_section_id) do update set
    present_count = excluded.present_count,
    late_count = excluded.late_count,
    absent_count = excluded.absent_count,
    rejected_count = excluded.rejected_count,
    permission_granted_count = excluded.permission_granted_count,
    excused_count = excluded.excused_count,
    cancelled_count = excluded.cancelled_count,
    pending_count = excluded.pending_count,
    unverified_count = excluded.unverified_count,
    countable_total = excluded.countable_total,
    attended_count = excluded.attended_count,
    updated_at = now();
end;
$$;

create or replace function public.attendance_records_refresh_summary()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- On UPDATE the row may have moved between students or sections (it should
  -- not, but the summary must not be the thing that discovers otherwise), so
  -- refresh both sides.
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.recalc_attendance_summary(old.student_id, old.class_section_id);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    perform public.recalc_attendance_summary(new.student_id, new.class_section_id);
  end if;

  return null;
end;
$$;

-- Statement-level would be cheaper for an 80-student bulk approve (§9), but
-- row-level is correct and simple, and a per-row recompute of ~40 rows is well
-- inside budget. If the rep queue's bulk path ever shows up in a flame graph,
-- this is the line to revisit — noted rather than pre-optimised.
create trigger attendance_records_refresh_summary
  after insert or update or delete on public.attendance_records
  for each row execute function public.attendance_records_refresh_summary();

-- ─────────────────────────────────────────────────────────────────────────────
-- Convenience view: the summary with the names a report needs.
--
-- A plain view, not materialized — it is a join of small tables onto the
-- summary, and the expensive part (the aggregate) already happened on write.
--
-- security_invoker so the caller's RLS applies. Without it a view runs as its
-- owner and becomes a hole straight through every policy above — the classic
-- way to spend a week writing RLS and then bypass it with a convenience view.
-- ─────────────────────────────────────────────────────────────────────────────

create view public.attendance_summary_view
with (security_invoker = true)
as
select
  s.student_id,
  s.class_section_id,
  p.full_name as student_name,
  p.matric_number,
  c.code as course_code,
  c.title as course_title,
  cs.section_code,
  cs.semester_id,
  s.present_count,
  s.late_count,
  s.absent_count,
  s.rejected_count,
  s.permission_granted_count,
  s.excused_count,
  s.cancelled_count,
  s.pending_count,
  s.unverified_count,
  s.countable_total,
  s.attended_count,
  s.attendance_percent,
  s.updated_at
from public.attendance_summaries s
join public.profiles p on p.id = s.student_id
join public.class_sections cs on cs.id = s.class_section_id
join public.courses c on c.id = cs.course_id;
