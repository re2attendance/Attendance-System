-- 0007 — Attendance: policy, windows, check-ins, records, flags.
--
-- Four tables rather than one, because a session can have several check-in windows
-- (D-012) and the raw hostile submission must stay separate from the verified verdict:
--
--   attendance_settings  admin policy (per class, with an institution-wide default)
--   attendance_windows   each time a course rep opens attendance
--   attendance_checkins  raw student submissions — untrusted input
--   attendance_records   the verified outcome, one per student per session

-- ---------------------------------------------------------------------------
-- Policy
-- ---------------------------------------------------------------------------

-- One row with class_id IS NULL is the institution-wide default; rows with a
-- class_id override it for that class (D-013). Resolution is coalesce(override,
-- default). Every threshold in this system lives here rather than in code.
create table public.attendance_settings (
  id                        uuid primary key default gen_random_uuid(),
  class_id                  uuid unique references public.classes (id) on delete cascade,

  -- Windows. The first opens for the first 30 minutes of the session; later windows
  -- exist so a student who arrived late can still record attendance (D-012).
  first_window_minutes      integer not null default 30,
  window_duration_minutes   integer not null default 10,
  windows_per_session       smallint not null default 2,
  -- If the rep forgets to open attendance, it opens itself this long after the
  -- session starts, so students are never stranded by an absent rep.
  auto_open_after_minutes   integer not null default 15,

  -- Campus geofence. Institution-wide only: per-class fences are rejected by the
  -- constraint below, because the fence is a property of the campus, not the cohort
  -- (D-010).
  campus_center             extensions.geography(Point, 4326),
  campus_radius_m           integer,
  -- Readings worse than this are meaningless and are discarded rather than stored
  -- as evidence (D-011).
  gps_accuracy_floor_m      integer not null default 150,

  -- Workflow timings.
  watcher_timeout_hours     integer not null default 2,
  dispute_window_minutes    integer not null default 60,
  max_disputes_per_semester smallint not null default 2,

  updated_at                timestamptz not null default now(),

  constraint settings_first_window_positive  check (first_window_minutes between 1 and 240),
  constraint settings_window_duration_valid  check (window_duration_minutes between 1 and 240),
  constraint settings_windows_per_session    check (windows_per_session between 1 and 10),
  constraint settings_auto_open_valid        check (auto_open_after_minutes between 0 and 240),
  constraint settings_accuracy_floor_valid   check (gps_accuracy_floor_m between 10 and 1000),
  constraint settings_watcher_timeout_valid  check (watcher_timeout_hours between 1 and 24),
  constraint settings_dispute_window_valid   check (dispute_window_minutes between 5 and 1440),
  constraint settings_dispute_limit_valid    check (max_disputes_per_semester between 1 and 10),
  constraint settings_radius_valid           check (campus_radius_m is null or campus_radius_m between 50 and 5000),
  constraint settings_fence_complete         check ((campus_center is null) = (campus_radius_m is null)),

  -- The geofence belongs to the institution-wide row only.
  constraint settings_fence_is_institution_wide check (
    class_id is null or (campus_center is null and campus_radius_m is null)
  )
);

-- Exactly one institution-wide default row may exist.
create unique index attendance_settings_one_default
  on public.attendance_settings ((class_id is null))
  where class_id is null;

-- ---------------------------------------------------------------------------
-- Windows
-- ---------------------------------------------------------------------------

-- Opened by the course rep when they are physically in the room. A short window
-- means the rep is demonstrably present and looking at the time submissions arrive,
-- which is the structural half of the anti-fraud design (D-011).
create table public.attendance_windows (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid     not null references public.sessions (id) on delete cascade,
  sequence    smallint not null,
  opened_by   uuid     references auth.users (id) on delete set null,
  opened_at   timestamptz not null default now(),
  closes_at   timestamptz not null,
  auto_opened boolean  not null default false,

  constraint windows_sequence_valid check (sequence between 1 and 10),
  constraint windows_closes_after_open check (closes_at > opened_at),
  unique (session_id, sequence)
);

comment on column public.attendance_windows.auto_opened is
  'True when the rep did not open attendance and the fallback fired. Countable, so '
  'a rep who never opens attendance is visible rather than merely inconvenient.';

-- ---------------------------------------------------------------------------
-- Check-ins — untrusted input
-- ---------------------------------------------------------------------------

-- Written only by the submit_attendance() SECURITY DEFINER function. RLS denies
-- direct INSERT to everyone: the client supplies coordinates and nothing else.
-- submitted_at is the server clock, never the browser's.
create table public.attendance_checkins (
  id              uuid primary key default gen_random_uuid(),
  window_id       uuid not null references public.attendance_windows (id) on delete cascade,
  student_id      uuid not null references public.profiles (id) on delete cascade,
  submitted_at    timestamptz not null default now(),
  location        extensions.geography(Point, 4326),
  gps_accuracy_m  real,
  distance_m      real,
  device_hash     text,

  constraint checkins_accuracy_sane check (gps_accuracy_m is null or gps_accuracy_m >= 0),
  constraint checkins_distance_sane check (distance_m is null or distance_m >= 0),
  unique (window_id, student_id)
);

comment on column public.attendance_checkins.device_hash is
  'Peppered hash of a device identifier. Two students submitting from one device in '
  'the same window is the signature of the fraud this system exists to stop, and it '
  'is invisible to any location check.';
comment on column public.attendance_checkins.distance_m is
  'Computed server-side from the campus fence. The client never sends a verdict.';

-- Anomalies for the rep to look at. The pending queue is meant to be sorted by
-- suspicion, not alphabetically — otherwise reps bulk-approve within a week and the
-- verification layer becomes decorative.
create table public.attendance_flags (
  id          uuid primary key default gen_random_uuid(),
  checkin_id  uuid not null references public.attendance_checkins (id) on delete cascade,
  flag        text not null,
  details     jsonb,
  created_at  timestamptz not null default now(),

  constraint flags_valid check (flag in (
    'shared_device',      -- same device as another student's submission in this window
    'low_gps_accuracy',   -- reading near the usable floor
    'outside_geofence',   -- submitted from beyond the campus fence
    'no_location'         -- location permission refused or unavailable
  )),
  unique (checkin_id, flag)
);

-- ---------------------------------------------------------------------------
-- Records — the verified verdict
-- ---------------------------------------------------------------------------

create table public.attendance_records (
  id                 uuid primary key default gen_random_uuid(),
  session_id         uuid not null references public.sessions (id) on delete cascade,
  student_id         uuid not null references public.profiles (id) on delete cascade,
  status             text not null default 'pending',

  -- Server-computed from the first check-in against sessions.starts_at.
  -- Negative means early.
  minutes_late       integer,
  first_checkin_id   uuid references public.attendance_checkins (id) on delete set null,

  decided_at         timestamptz,
  decided_by         uuid references auth.users (id) on delete set null,
  verification_route text,
  rejection_reason   text,
  dispute_deadline   timestamptz,

  created_at         timestamptz not null default now(),

  -- The most important line in this schema: one student, one session, one record.
  unique (session_id, student_id),

  constraint records_status_valid check (status in ('pending', 'approved', 'rejected')),

  constraint records_route_valid check (verification_route is null or verification_route in (
    'course_rep',                              -- the normal path
    'watcher',                                 -- a course rep's own attendance
    'self_approved_watcher_declared_absent',   -- watcher said in-app they'd be away
    'self_approved_watcher_timeout',           -- watcher silent past the timeout
    'admin_dispute'                            -- set by an upheld dispute
  )),

  -- A decision is a complete event or it has not happened.
  constraint records_decision_complete check (
    (status = 'pending') =
    (decided_at is null and verification_route is null and dispute_deadline is null)
  ),

  -- Rejections must say why, and the student is shown the reason (D-014). This is
  -- the cheapest behaviour change in the system: a rep who must justify a rejection
  -- in writing, knowing the student will read it, rejects very differently.
  constraint records_rejection_has_reason check (
    (status = 'rejected') = (rejection_reason is not null and length(btrim(rejection_reason)) > 0)
  ),

  -- The dispute clock runs from the decision, not from the end of class — otherwise
  -- a rep deciding hours later leaves the student with an already-expired right
  -- to dispute something that was still pending (D-018).
  constraint records_dispute_deadline_after_decision check (
    dispute_deadline is null or decided_at is null or dispute_deadline > decided_at
  )
);

comment on table public.attendance_records is
  'One verdict per student per session. Never written directly by a client — RLS '
  'denies INSERT and UPDATE, and all transitions go through SECURITY DEFINER '
  'functions that set status, timestamps and computed distance server-side (D-004).';
