-- 0006 — Timetable and sessions.
--
-- The timetable is fixed weekly and repeats through the semester (D-021). Sessions
-- are MATERIALISED from it — real rows generated for each week — rather than computed
-- on the fly, because attendance records, cancellations, disputes and audit entries
-- all need a stable session_id to reference.

create table public.timetable_entries (
  id           uuid primary key default gen_random_uuid(),
  semester_id  uuid     not null references public.semesters (id) on delete cascade,
  class_id     uuid     not null references public.classes (id) on delete cascade,
  course_id    uuid     not null references public.courses (id) on delete restrict,
  room_id      uuid     references public.rooms (id) on delete set null,
  lecturer_id  uuid     references public.lecturers (id) on delete set null,
  day_of_week  smallint not null,
  starts_at    time     not null,
  ends_at      time     not null,
  created_at   timestamptz not null default now(),

  -- ISO-8601 numbering: 1 = Monday … 7 = Sunday. Matches extract(isodow …), so
  -- generating sessions needs no translation layer.
  constraint timetable_day_valid    check (day_of_week between 1 and 7),
  constraint timetable_times_ordered check (ends_at > starts_at)
);

comment on column public.timetable_entries.day_of_week is
  'ISO-8601: 1 = Monday … 7 = Sunday, matching extract(isodow from date).';

-- A generated instance of a timetable entry on a specific date.
create table public.sessions (
  id                  uuid primary key default gen_random_uuid(),
  timetable_entry_id  uuid references public.timetable_entries (id) on delete set null,
  semester_id         uuid not null references public.semesters (id) on delete cascade,
  class_id            uuid not null references public.classes (id) on delete cascade,
  course_id           uuid not null references public.courses (id) on delete restrict,
  room_id             uuid references public.rooms (id) on delete set null,
  lecturer_id         uuid references public.lecturers (id) on delete set null,
  starts_at           timestamptz not null,
  ends_at             timestamptz not null,
  status              text not null default 'scheduled',
  created_at          timestamptz not null default now(),

  constraint sessions_status_valid   check (status in ('scheduled', 'held', 'cancelled')),
  constraint sessions_times_ordered  check (ends_at > starts_at),

  -- A class cannot be in two places at once. Without this it is possible to create
  -- two overlapping sessions for one cohort, which produces attendance records that
  -- cannot be trusted either way. Cancelled sessions are exempt so a cancellation
  -- can be replaced by a rescheduled sitting.
  constraint sessions_no_overlap_per_class exclude using gist (
    class_id with =, tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'cancelled'),

  -- Likewise a room cannot host two classes at once.
  constraint sessions_no_overlap_per_room exclude using gist (
    room_id with =, tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'cancelled' and room_id is not null)
);

comment on table public.sessions is
  'Materialised lecture instances. Generated across the semester from '
  'timetable_entries, skipping holidays and the exam period (D-021).';

-- Why a session stopped being held. Institution-wide closures cascade here from
-- public.holidays; a course rep may cancel their own class''s session directly.
--
-- The `before the attendance window opens` restriction (D-020) is enforced in the
-- cancellation function, not here: a retroactive cancellation would let a rep who
-- missed a lecture erase their own absence, so it is admin-only after that point.
create table public.session_cancellations (
  session_id    uuid primary key references public.sessions (id) on delete cascade,
  scope         text not null,
  holiday_id    uuid references public.holidays (id) on delete set null,
  reason        text not null,
  cancelled_by  uuid references auth.users (id) on delete set null,
  cancelled_at  timestamptz not null default now(),

  constraint cancellations_scope_valid  check (scope in ('institution', 'class')),
  constraint cancellations_reason_given check (length(btrim(reason)) > 0),

  -- An institution-wide cancellation traces back to the closure that caused it;
  -- a class-level one never does.
  constraint cancellations_holiday_iff_institution check (
    (scope = 'institution') = (holiday_id is not null)
  )
);

comment on table public.session_cancellations is
  'Cancelled sessions are excluded from attendance denominators — a rate is over '
  'HELD sessions only, or a holiday week silently drops every student''s percentage.';
