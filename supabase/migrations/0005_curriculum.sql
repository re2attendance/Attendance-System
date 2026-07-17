-- 0005_curriculum
--
-- courses, class_sections, enrollments, course_rep_assignments.

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete restrict,
  department_id uuid not null references public.departments (id) on delete restrict,
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,

  code text not null,
  title text not null,
  credit_units smallint not null check (credit_units between 0 and 30),
  level smallint not null check (level between 100 and 900),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- §5: "unique per code+academic_year". CSC 401 in 2024/25 and CSC 401 in
  -- 2025/26 are different rows — the syllabus changes, and last year's
  -- attendance must not follow this year's course.
  unique (institution_id, academic_year_id, code)
);

-- A course OFFERING in a semester. The thing students actually attend.
create table public.class_sections (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete restrict,
  course_id uuid not null references public.courses (id) on delete restrict,
  semester_id uuid not null references public.semesters (id) on delete restrict,

  section_code text not null,

  -- §4: the Instructor owns the course and is the final authority on records.
  -- Nullable so a section can be created before staffing is settled; a section
  -- with no instructor has no one who can override, which the seed and the
  -- admin UI should both discourage.
  instructor_id uuid references public.profiles (id) on delete restrict,

  capacity integer check (capacity > 0),
  room text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (course_id, semester_id, section_code)
);

-- §5, and the spec's own diagnosis: "the original spec conflated 'class' and
-- 'cohort' and had no enrollment table at all. Attendance percentage is
-- meaningless without it."
--
-- This is the denominator. A student who dropped in week 3 must not be absent
-- for weeks 4-14, and a student who joined in week 2 must not be absent for
-- week 1.
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete restrict,
  class_section_id uuid not null references public.class_sections (id) on delete restrict,

  status public.enrollment_status not null default 'enrolled',
  enrolled_at timestamptz not null default now(),
  dropped_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One enrollment row per student per section. Re-enrolling updates the row;
  -- it does not create a second one, or the denominator double-counts.
  unique (student_id, class_section_id),

  -- A dropped/withdrawn enrollment has a date, an active one does not. Without
  -- this, close_session() cannot tell who was enrolled on the day.
  constraint enrollments_dropped_at_consistent check (
    (status in ('dropped', 'withdrawn')) = (dropped_at is not null)
  ),
  constraint enrollments_dropped_after_enrolled check (
    dropped_at is null or dropped_at >= enrolled_at
  )
);

-- §4: "Model the rep grant as a row, not a column on the user."
--
-- This table exists to answer one question that a boolean cannot: "who was rep
-- when THIS record was approved?" — asked in week 14, about week 2, by someone
-- disputing a grade. It supports multiple reps per section, co-reps, mid-term
-- handover, revocation, and historical accuracy.
create table public.course_rep_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  class_section_id uuid not null references public.class_sections (id) on delete restrict,

  assigned_by uuid references public.profiles (id) on delete set null,

  -- The appointment period. A rep's authority is bounded in time, and RLS
  -- checks this window rather than mere existence of a row (§4: "only within
  -- their appointment period").
  starts_at timestamptz not null default now(),
  ends_at timestamptz,

  -- Revocation is distinct from expiry: ends_at is "the term ended",
  -- revoked_at is "we took this away". Both end authority; only one is a
  -- judgement about the person, and the audit trail must keep them apart.
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  revoked_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint rep_assignments_period_ordered check (
    ends_at is null or ends_at > starts_at
  ),
  constraint rep_assignments_revocation_consistent check (
    (revoked_at is null) = (revoked_by is null)
  )
);

-- Deliberately NOT unique on (user_id, class_section_id): a rep can be
-- appointed, revoked, and re-appointed later, and each of those is a distinct
-- historical fact. Overlapping ACTIVE grants for the same user+section are
-- prevented by an exclusion constraint in 0012 instead, which allows the
-- history while forbidding the ambiguity.

-- The two FKs deferred from 0003. academic_calendar_events is org structure and
-- is created early, but a section-scoped declaration points forward at the
-- curriculum (here) and at the person who declared it (profiles, 0004). Same
-- shape as the rules-snapshot FK deferred from 0006 to 0008.

-- on delete cascade: a section-scoped holiday is a fact about that section. If
-- the section is deleted the declaration has nothing left to mean. Contrast
-- attendance_sessions.cancelled_by_event_id (0006), which is `on delete set
-- null` — a session that WAS cancelled by a holiday stays cancelled even if the
-- declaration is later withdrawn, because the class genuinely did not happen.
alter table public.academic_calendar_events
  add constraint academic_calendar_events_class_section_id_fkey
  foreign key (class_section_id)
  references public.class_sections (id)
  on delete cascade;

-- on delete set null: the declaration outlives the declarer's account. Who
-- called the emergency also lives in the audit log, which nothing can delete.
alter table public.academic_calendar_events
  add constraint academic_calendar_events_declared_by_fkey
  foreign key (declared_by)
  references public.profiles (id)
  on delete set null;
