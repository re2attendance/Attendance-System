-- 0006_scheduling
--
-- schedule_rules, attendance_sessions, session_makeups.

-- §5: "reps should not hand-create 40 sessions a term."
--
-- §5 offers "RRULE or day-of-week + start/end time"; this takes the second.
-- RRULE buys recurrences nobody schedules a lecture with (every 2nd Tuesday
-- except in October) at the cost of a parser, a timezone-expansion story, and a
-- class of bugs that only appear in week 9. Day-of-week + local times covers
-- every real timetable. If a case appears that genuinely needs RRULE, the
-- column can be added beside this one.
create table public.schedule_rules (
  id uuid primary key default gen_random_uuid(),
  class_section_id uuid not null references public.class_sections (id) on delete cascade,

  -- 0 = Sunday .. 6 = Saturday, matching Postgres extract(dow).
  day_of_week smallint not null check (day_of_week between 0 and 6),

  -- LOCAL wall-clock times in the institution's timezone — the only place in
  -- this schema where wall time is correct. "Mondays at 10:00" must stay 10:00
  -- across a DST change; storing an instant would drift it by an hour. The
  -- generate-sessions job converts these to timestamptz per occurrence.
  starts_at_local time not null,
  ends_at_local time not null,

  room text,

  effective_from date not null,
  effective_to date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint schedule_rules_times_ordered check (ends_at_local > starts_at_local),
  constraint schedule_rules_effective_ordered check (
    effective_to is null or effective_to >= effective_from
  )
);

-- The session. Absences do not exist until close_session() runs against one of
-- these (§6.1) — the step the spec says most implementations forget.
create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  class_section_id uuid not null references public.class_sections (id) on delete restrict,

  -- Local calendar date of the session, denormalised for "today's sessions"
  -- and for the (class_section_id, date) composite in 0012. Derived from
  -- starts_at in the institution's timezone at creation.
  session_date date not null,

  starts_at timestamptz not null,
  ends_at timestamptz not null,

  description text,
  room text,

  status public.session_status not null default 'scheduled',

  opened_at timestamptz,
  opened_by uuid references public.profiles (id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null,

  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  cancelled_reason text,

  -- Which declaration killed this session, when one did. Null means somebody
  -- cancelled it by hand (lecturer ill, room flooded) and cancelled_reason says
  -- why.
  --
  -- This is why "holiday" and "emergency" are NOT members of attendance_status.
  -- A cancelled session is a cancelled session: the student's record means the
  -- same thing either way — this doesn't count, you are not penalised. WHY it
  -- was cancelled is a fact about the SESSION, not about the student, and 300
  -- identical copies of "emergency" stamped across 300 records is a
  -- denormalisation of a fact that has exactly one owner. Reports read it from
  -- here; the chip renders the word by joining, not by storing. See ADR-012.
  cancelled_by_event_id uuid references public.academic_calendar_events (id) on delete set null,

  generated_from_schedule_rule_id uuid references public.schedule_rules (id) on delete set null,

  -- §7 layer 1: rotating 6-digit code, regenerated every 30s, validated
  -- server-side against server time. Stored as the CURRENT code; the previous
  -- one is accepted for one rotation (a student typing on a cracked phone in a
  -- lecture hall should not lose a record to a 2-second overrun), which the
  -- verifier derives from code_rotated_at rather than a second column.
  session_code text check (session_code ~ '^[0-9]{6}$'),
  code_rotated_at timestamptz,

  -- §7 layer 3, and ADR-003: modelled now, flag off. No migration needed to
  -- enable it later. Lat/lng as numeric rather than PostGIS geography — this is
  -- one point and one radius per session, and a distance check does not justify
  -- an extension. Distance is ALWAYS advisory: GPS indoors is unreliable, so it
  -- flags for a rep's judgement and never hard-rejects (§7).
  geofence_lat numeric(9, 6) check (geofence_lat between -90 and 90),
  geofence_lng numeric(9, 6) check (geofence_lng between -180 and 180),
  geofence_radius_m integer check (geofence_radius_m > 0),

  -- The pinned rule version. FK added in 0008, where the snapshots table is
  -- created — the two tables reference each other and one of them has to be
  -- second. This column is the single most important one in the schema for
  -- disputes: it is what stops an admin editing rules in week 10 from
  -- rewriting week 2.
  rules_snapshot_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sessions_times_ordered check (ends_at > starts_at),

  -- A geofence is all three columns or none. A radius with no centre is not a
  -- geofence, it is a bug waiting to divide by nothing.
  constraint sessions_geofence_complete check (
    num_nonnulls(geofence_lat, geofence_lng, geofence_radius_m) in (0, 3)
  ),

  -- The lifecycle invariants. These are in the database rather than the action
  -- layer because a session that is 'open' with no opened_at makes the rules
  -- engine's "session closed with no approved record" question unanswerable.
  constraint sessions_open_has_opened_at check (
    status <> 'open' or opened_at is not null
  ),
  constraint sessions_closed_has_closed_at check (
    status <> 'closed' or (closed_at is not null and opened_at is not null)
  ),
  constraint sessions_cancelled_has_reason check (
    (status = 'cancelled')
    = (cancelled_at is not null and cancelled_reason is not null)
  ),
  constraint sessions_close_after_open check (
    closed_at is null or opened_at is null or closed_at >= opened_at
  ),

  -- An open session must have a code and a rotation stamp, or the anti-proxy
  -- layer is silently inert.
  constraint sessions_open_has_code check (
    status <> 'open' or (session_code is not null and code_rotated_at is not null)
  )
);

-- §6.1: "Optional makeup session linked." A cancelled session's records leave
-- the denominator; the makeup brings its own.
create table public.session_makeups (
  id uuid primary key default gen_random_uuid(),
  cancelled_session_id uuid not null references public.attendance_sessions (id) on delete cascade,
  makeup_session_id uuid not null references public.attendance_sessions (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),

  -- One makeup per cancelled session, and a session cannot make up for itself.
  unique (cancelled_session_id),
  constraint session_makeups_distinct check (cancelled_session_id <> makeup_session_id)
);
