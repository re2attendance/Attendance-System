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
-- this table before writing anything.
create table public.academic_calendar_events (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete restrict,
  semester_id uuid references public.semesters (id) on delete cascade,
  title text not null,
  event_type public.calendar_event_type not null,
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_dates_ordered check (ends_on >= starts_on)
);
