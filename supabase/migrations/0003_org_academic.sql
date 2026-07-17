-- 0003_org_academic
--
-- Org structure and the academic calendar.
--
-- Single tenant, schema-ready for multi (§2 Q1): institutions exists and every
-- org-scoped row carries institution_id, but there is no tenant routing and no
-- second row. The seam costs one column now; retrofitting it later means
-- touching every table and every policy.
--
-- All timestamps are timestamptz and stored UTC (§5). The institutional
-- timezone lives in institutions.timezone and is a DISPLAY concern only —
-- server time decides every timing question, and deriveStatus never sees a
-- wall clock.

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text not null,
  -- IANA name, e.g. 'Africa/Accra'. Display and schedule generation only.
  timezone text not null default 'UTC',
  -- §2 Q4: invite-only, with self-registration behind an admin toggle.
  allow_self_registration boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.faculties (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete restrict,
  name text not null,
  code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id, code)
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete restrict,
  faculty_id uuid not null references public.faculties (id) on delete restrict,
  name text not null,
  code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id, code)
);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete restrict,
  department_id uuid not null references public.departments (id) on delete restrict,
  name text not null,
  code text not null,
  -- Nominal length; a student's own level lives on their profile.
  duration_years smallint not null default 4 check (duration_years between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id, code)
);

create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete restrict,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id, name),
  constraint academic_years_dates_ordered check (ends_on > starts_on)
);

create table public.semesters (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete restrict,
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  -- After this, enrollment changes stop counting against attendance history.
  add_drop_deadline date,
  status public.semester_status not null default 'upcoming',
  -- §6.6: records lock permanently once the semester is finalized. Stamped so
  -- the lock has an auditable moment, not just a status.
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id, academic_year_id, name),
  constraint semesters_dates_ordered check (ends_on > starts_on),
  constraint semesters_add_drop_within_term check (
    add_drop_deadline is null
    or (add_drop_deadline >= starts_on and add_drop_deadline <= ends_on)
  ),
  -- A semester is finalized if and only if it carries the timestamp. Prevents
  -- a lock that nobody can date, and a date that locks nothing.
  constraint semesters_finalized_consistent check (
    (status = 'finalized') = (finalized_at is not null)
  )
);

-- §5: sessions must not be auto-generated on these. generate-sessions consults
-- this table before writing anything, and no session on one of these days
-- accepts a submission.
--
-- SCOPE is the load-bearing column here, and the reason is worth stating:
--
--   class_section_id IS NULL  → institution-wide. ADMIN ONLY.
--   class_section_id IS SET   → one section. The section's rep, its instructor,
--                               or an admin.
--
-- A course rep is a student with a scoped grant (§4). "Reps can declare a
-- holiday" cannot mean a student can shut the university — that would be the
-- largest privilege escalation in the product, available to ~12 undergraduates.
-- It means a rep can declare it for the section they actually administer, which
-- is the thing they were appointed to run. The scope column is what keeps those
-- two readings apart, and RLS in 0011 enforces the split.
--
-- Declared days are not deletable by their author, only by an admin: a rep who
-- can declare an emergency and then remove the evidence has a tool, not a
-- responsibility. See ADR-012.
create table public.academic_calendar_events (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete restrict,
  semester_id uuid references public.semesters (id) on delete cascade,

  -- Null = the whole institution. See the scope note above.
  --
  -- The FK is added in 0005, where class_sections is created — the academic
  -- calendar is org structure and comes first, but a section-scoped declaration
  -- points forward at the curriculum. Same shape as the rules-snapshot FK
  -- deferred from 0006 to 0008: one of two mutually-referencing tables has to
  -- be second.
  class_section_id uuid,

  title text not null,
  event_type public.calendar_event_type not null,
  starts_on date not null,
  ends_on date not null,

  -- Who pronounced it and when. An emergency voids a day of academic records
  -- for everyone in scope, including records a rep had already approved — that
  -- is not an action that gets to be anonymous.
  --
  -- FK added in 0005, with class_section_id's — profiles arrives in 0004.
  declared_by uuid,
  declared_at timestamptz not null default now(),
  reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint calendar_events_dates_ordered check (ends_on >= starts_on),

  -- An emergency is one day. It is declared as it happens, so a multi-day
  -- emergency is several declarations — one per day, each made on that day.
  -- Requiring that is what stops "the whole of next week is an emergency" from
  -- being one click.
  constraint calendar_events_emergency_single_day check (
    event_type <> 'emergency' or starts_on = ends_on
  )
);
