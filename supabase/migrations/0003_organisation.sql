-- 0003 — Organisation: classes, rooms, lecturers.

-- A class is a cohort. `level` is the academic year of study (Level 100 = first year
-- … Level 400 = final year). There are exactly four and they are a fixed fact about
-- the university, so this is a constraint rather than a table the admin populates:
-- a table would add a join to every class query and permit "level 550" (D-008).
create table public.classes (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null unique,
  level       smallint    not null,
  created_at  timestamptz not null default now(),

  constraint classes_name_not_blank check (length(btrim(name)) > 0),
  constraint classes_level_valid    check (level in (100, 200, 300, 400))
);

comment on column public.classes.level is
  'Academic year of study: 100 = first year through 400 = final year.';

-- Rooms carry coordinates for display on a student''s timetable ("where do I go?").
-- They deliberately do NOT carry a geofence: presence is checked against one
-- campus-wide fence in attendance_settings, because indoor GPS error (20-50m)
-- exceeds the size of a lecture hall, so a room-sized fence would reject honest
-- students inside the room and accept anyone in the corridor (D-010).
create table public.rooms (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null unique,
  location    extensions.geography(Point, 4326),
  created_at  timestamptz not null default now(),

  constraint rooms_name_not_blank check (length(btrim(name)) > 0)
);

comment on column public.rooms.location is
  'For display only. Attendance is checked against the campus fence, never this point.';

-- Lecturers do not log in and have no role in the app (build plan §5). This exists
-- so sessions can reference a lecturer by key rather than by a free-text name that
-- would fragment on typos the moment anyone filters by it.
create table public.lecturers (
  id          uuid primary key default gen_random_uuid(),
  full_name   text        not null,
  created_at  timestamptz not null default now(),

  constraint lecturers_name_not_blank check (length(btrim(full_name)) > 0)
);

comment on table public.lecturers is
  'Reference data only — lecturers have no account and never authenticate.';
