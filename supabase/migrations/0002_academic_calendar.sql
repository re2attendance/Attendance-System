-- 0002 — Academic calendar: semesters and institution-wide non-teaching days.
--
-- Semesters scope the dispute limit and every analytics window, so "which semester
-- is this date in?" must have exactly one answer. The exclusion constraint below
-- guarantees that (DECISIONS.md D-020, Q1).

create table public.semesters (
  id              uuid primary key default gen_random_uuid(),
  name            text        not null,
  starts_on       date        not null,
  ends_on         date        not null,
  exam_starts_on  date        not null,
  exam_ends_on    date        not null,
  created_at      timestamptz not null default now(),

  constraint semesters_name_not_blank check (length(btrim(name)) > 0),
  constraint semesters_dates_ordered  check (ends_on > starts_on),
  constraint semesters_exam_ordered   check (exam_ends_on >= exam_starts_on),

  -- The exam period is part of the semester, not an extension of it.
  constraint semesters_exam_within_term check (
    exam_starts_on >= starts_on and exam_ends_on <= ends_on
  ),

  -- No two semesters may overlap. Without this the "max 2 disputes per semester"
  -- rule is meaningless, because a date could belong to two semesters at once.
  constraint semesters_no_overlap exclude using gist (
    daterange(starts_on, ends_on, '[]') with &&
  )
);

comment on table public.semesters is
  'Academic terms. Non-overlapping, so the semester containing any date is unambiguous.';
comment on column public.semesters.exam_starts_on is
  'Lectures do not run during the exam period; session generation skips these dates.';

-- Institution-wide non-teaching days, set by the admin (D-020).
-- Per-class cancellations are a different thing entirely and live in 0006.
create table public.holidays (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  kind        text        not null,
  starts_on   date        not null,
  ends_on     date        not null,
  created_by  uuid        references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint holidays_name_not_blank check (length(btrim(name)) > 0),
  constraint holidays_kind_valid     check (kind in ('holiday', 'emergency')),
  constraint holidays_dates_ordered  check (ends_on >= starts_on),

  -- Two overlapping closures of the same kind would double-cancel the same sessions.
  constraint holidays_no_overlap exclude using gist (
    kind with =, daterange(starts_on, ends_on, '[]') with &&
  )
);

comment on table public.holidays is
  'Institution-wide closures. kind=holiday is planned; kind=emergency is declared at '
  'short notice and may cancel sessions that have already been generated.';
