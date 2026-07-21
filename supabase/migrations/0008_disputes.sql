-- 0008 — Disputes.
--
-- A student may challenge a decided attendance record within one hour of the
-- decision (D-018), up to a per-semester limit (D-017). Disputes are judged by the
-- admin, never by the course rep who made the original call (D-016) — otherwise a
-- rep can simply decline every complaint about their own decisions and the
-- "wins don't count" rule can never fire.

create table public.disputes (
  id           uuid primary key default gen_random_uuid(),
  record_id    uuid not null references public.attendance_records (id) on delete cascade,
  student_id   uuid not null references public.profiles (id) on delete cascade,
  semester_id  uuid not null references public.semesters (id) on delete restrict,

  reason       text not null,
  state        text not null default 'open',
  outcome      text,
  resolution   text,
  resolved_by  uuid references auth.users (id) on delete set null,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now(),

  constraint disputes_reason_given check (length(btrim(reason)) > 0),
  constraint disputes_state_valid  check (state in ('open', 'resolved')),

  -- 'upheld' means the student was right and the record is corrected;
  -- 'declined' means the original decision stands.
  constraint disputes_outcome_valid check (outcome is null or outcome in ('upheld', 'declined')),

  -- A resolution is a complete event or it has not happened.
  constraint disputes_resolution_complete check (
    (state = 'resolved') = (
      outcome is not null
      and resolved_at is not null
      and resolution is not null and length(btrim(resolution)) > 0
    )
  )
);

-- One live dispute per record. A student cannot stack complaints about the same
-- decision to burn through the queue.
create unique index disputes_one_open_per_record
  on public.disputes (record_id)
  where state = 'open';

comment on table public.disputes is
  'The per-semester limit counts only disputes resolved `declined`. A dispute the '
  'student wins is the system correcting an error, not a nuisance — counting it '
  'would mean a student wrongly rejected three times runs out of recourse (D-017). '
  'The count is enforced in the raise_dispute() function, not the UI.';

comment on column public.disputes.semester_id is
  'Denormalised from the session at creation time so the per-semester count is a '
  'plain indexed lookup and cannot drift if a session is later edited.';
