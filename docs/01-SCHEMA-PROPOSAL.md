# Schema Proposal — for review before any migration is written

**Status:** proposal. No migrations exist yet.
**Date:** 2026-07-21

SQL below is illustrative, not final — read it as the shape of the model. Where a
decision depends on your answer, it's marked **[Q*n*]** and cross-referenced to the
questions list.

---

## Guiding principle

> Assume the client is hostile. (Build plan §2.7)

Concretely that means: **the client never writes an attendance row directly.** RLS
denies `INSERT`/`UPDATE` on `attendance_records` to everyone. All writes go through
`SECURITY DEFINER` functions that set the status, the timestamp, and the computed
distance themselves. A student's browser can lie about its coordinates; it must not be
able to lie about _when_ it submitted, _what status_ the row got, or _whose_ row it is.

The second principle: **push every rule we can into a constraint.** A `CHECK` or a
unique index cannot be forgotten, cannot race, and cannot be bypassed by a future
code path. Several rules in your brief that read like application logic are actually
expressible declaratively, and I've done so below.

---

## Extensions

`citext` (case-insensitive email), `btree_gist` (needed for the overlap constraints),
and **`postgis`** — for the geofence. Rationale for PostGIS over storing bare
lat/lng floats and doing the maths in JS: `ST_DWithin` on a `geography` column gets
the great-circle distance right, is indexable, and runs **server-side**, which is the
only place the distance check counts. All three are available on Supabase free tier.

---

## Tables

### `semesters`

```sql
create table semesters (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,            -- "2025/26 Semester 1"
  starts_on   date not null,
  ends_on     date not null,
  check (ends_on > starts_on),
  exclude using gist (daterange(starts_on, ends_on, '[]') with &&)
);
```

That exclusion constraint means **no two semesters can overlap**, so "the current
semester" is always unambiguous — which matters because the 2-disputes-per-semester
limit is meaningless if a date can belong to two semesters. **[Q1]**

### `classes`

```sql
create table classes (
  id     uuid primary key default gen_random_uuid(),
  name   text not null unique,
  level  smallint not null check (level in (100,200,300,400))
);
```

**Pushback:** §6 says admin can create _levels_. I don't think levels should be a
table — there are exactly four, they never change, and a table buys us a join and an
opportunity for someone to create "level 550". A `CHECK` constraint says the same
thing and enforces it. **[Q7]**

### `profiles`

```sql
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null,
  index_number  text not null unique check (index_number ~ '^[0-9]{7}$'),
  email         citext not null unique,
  class_id      uuid not null references classes(id),
  created_at    timestamptz not null default now(),
  check (split_part(email, '@', 1) = index_number)
);
```

Note the last line: **"the first 7 digits of the email must match the entered student
ID" is a database constraint**, not a validation step. It cannot be bypassed by any
code path we write later. The Zod schema mirrors it for the error message; the CHECK
is what makes it true. Names are deliberately not unique (§5). **[Q10]**

> **Design conflict I need you to resolve:** §5 says the admin _is not a student_, but
> `profiles` requires an index number and a class. So the admin cannot have a profile
> row. My proposal: **admins exist in `auth.users` + `role_assignments` only, with no
> `profiles` row.** Clean, and it makes "is this person a student?" == "do they have a
> profile?". The cost is that admin-facing UI can't read a name from `profiles` — fine,
> since there's one admin and it's you. **[Q11]**

### `role_assignments`

```sql
create table role_assignments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('admin','course_rep','watcher')),
  class_id    uuid references classes(id),
  rep_slot    smallint check (rep_slot between 1 and 3),
  granted_by  uuid references auth.users(id),
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  check ((role = 'course_rep') = (rep_slot is not null)),
  check ((role = 'admin')      = (class_id is null))
);

create unique index one_rep_per_slot on role_assignments (class_id, rep_slot)
  where role = 'course_rep' and revoked_at is null;

create unique index one_watcher_per_class on role_assignments (class_id)
  where role = 'watcher' and revoked_at is null;
```

There is no `'student'` role — **having a `profiles` row _is_ being a student**, which
matches "every non-admin user is a student first" (§5).

The `rep_slot` trick is worth calling out: **"max 3 course reps per class" becomes a
declarative constraint.** Slots are 1–3 by CHECK, and each slot is unique per class, so
a 4th rep has nowhere to go. No trigger, no counting query, no race condition where two
admins appoint a 3rd and 4th rep simultaneously. Revocations are soft (`revoked_at`) so
history survives, and the partial indexes only police live assignments.

### `lecturers`

```sql
create table lecturers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null
);
```

Lecturers do not log in and have no role in the app (§5). A table rather than a text
field on `sessions` so the rep dashboard can filter by lecturer later without
string-matching typos.

### `courses`

```sql
create table courses (
  id       uuid primary key default gen_random_uuid(),
  code     text not null unique,      -- "ITC 301"
  title    text not null,
  class_id uuid not null references classes(id)
);
```

**[Q8]** — this assumes a course belongs to exactly one class. If two classes can take
the same course, this needs to become a join table. Cheap now, expensive in Phase 4.

### `rooms`

```sql
create table rooms (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  location   geography(Point, 4326),
  radius_m   integer check (radius_m between 10 and 2000),
  check ((location is null) = (radius_m is null))
);
```

**[Q2]** — per-room geofence vs one campus-wide fence. This schema supports both: a
room with a `null` location falls back to a campus-wide fence held in settings. My
recommendation is **campus-wide for v1** — per-room radii small enough to be meaningful
(~20m) collide with consumer GPS accuracy indoors (routinely 20–50m, worse under a
concrete roof), so you'd reject honest students standing in the room. A campus fence is
honest about what GPS can actually prove.

### `sessions`

```sql
create table sessions (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references courses(id),
  class_id     uuid not null references classes(id),
  room_id      uuid references rooms(id),
  lecturer_id  uuid references lecturers(id),
  semester_id  uuid not null references semesters(id),
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  status       text not null default 'scheduled'
                 check (status in ('scheduled','cancelled','held')),
  check (ends_at > starts_at),
  exclude using gist (
    class_id with =, tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'cancelled')
);
```

The exclusion constraint makes it **impossible to schedule one class into two
overlapping sessions** — which would otherwise produce a student who is required to be
in two rooms at once, and an attendance record that can't be trusted either way. A
second identical constraint on `room_id` prevents double-booking a room. **[Q7]**

### `attendance_records`

```sql
create table attendance_records (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references sessions(id) on delete cascade,
  student_id       uuid not null references profiles(id) on delete cascade,
  status           text not null default 'pending'
                     check (status in ('pending','approved','rejected')),
  submitted_at     timestamptz not null default now(),   -- SERVER clock, always
  minutes_late     integer not null,                     -- negative = early
  location         geography(Point, 4326),
  gps_accuracy_m   real,
  distance_m       real,                                 -- computed server-side
  device_hash      text,
  verified_by      uuid references auth.users(id),
  verified_at      timestamptz,
  verification_route text check (verification_route in
                     ('course_rep','watcher','self_approved_watcher_absent')),
  unique (session_id, student_id)
);
```

`unique (session_id, student_id)` is the single most important line in this file —
one student, one record, one session, enforced by the database.

`verification_route` exists so that a course rep self-approving under the
watcher-absent fallback is **permanently stamped on the record**. Not a log entry you
have to go find — a column you can filter and count. That's what turns "the fallback"
from a silent bypass into an auditable condition. **[Q4]**

### `attendance_flags`

```sql
create table attendance_flags (
  id         uuid primary key default gen_random_uuid(),
  record_id  uuid not null references attendance_records(id) on delete cascade,
  flag       text not null check (flag in
               ('shared_device','low_gps_accuracy','outside_geofence',
                'impossible_travel','submitted_off_window')),
  details    jsonb,
  created_at timestamptz not null default now()
);
```

**This table is the actual product.** The course rep's queue shouldn't be a flat list
of names to rubber-stamp — it should say _"⚠ this submission came from the same device
as Ama Boateng's, 40 seconds earlier."_ That single flag catches the exact fraud the
paper sheet suffered from — one person signing in for their friends — and it's far more
reliable than the GPS check. See `02-ATTENDANCE-INTEGRITY.md`. **[Q3]**

### `disputes`

```sql
create table disputes (
  id          uuid primary key default gen_random_uuid(),
  record_id   uuid not null references attendance_records(id) on delete cascade,
  student_id  uuid not null references profiles(id) on delete cascade,
  semester_id uuid not null references semesters(id),
  reason      text not null,
  state       text not null default 'open' check (state in ('open','resolved')),
  outcome     text check (outcome in ('upheld','declined')),
  resolution  text,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  check ((state = 'resolved') = (outcome is not null))
);

create unique index one_open_dispute_per_record on disputes (record_id)
  where state = 'open';
```

**[Q6] — I want to argue with the 2-per-semester rule.** As written, a student whose
rep wrongly rejects them three times runs out of appeals and eats a false absence. The
limit's purpose is to stop nuisance disputes, and a dispute the student _wins_ is by
definition not a nuisance. **Proposal: disputes resolved `upheld` (student was right)
don't count against the limit.** Same protection against spam, no punishment for being
correct. One `WHERE` clause in the counting function.

### `audit_log`

```sql
create table audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  entity      text not null,
  entity_id   uuid not null,
  action      text not null,
  before      jsonb,
  after       jsonb,
  at          timestamptz not null default now()
);
```

Append-only for real: `revoke update, delete on audit_log from authenticated, anon;`
and rows are written only by `SECURITY DEFINER` triggers. Nobody — including the
admin, including a compromised app — can rewrite history.

---

## Two things the schema exposes that the brief doesn't address

### 1. Nobody oversees the course rep

§6 says the admin **cannot see attendance records**, and the watcher's sole job is
approving _reps' own_ attendance. Follow the graph: a course rep can reject an honest
student out of spite, or approve an absent friend, and **there is no role in the system
that can see it**. Disputes are the only check, and disputes are capped at 2 and judged
by the same rep who made the call.

We have deliberately built the paper sheet's problem back in, one level up.

I'm not proposing we give the admin the attendance data — the restriction is clearly
intentional. Two narrower options:

- **(a) Admin sees the audit log and flags, never the records.** They can see _"rep X
  approved 14 submissions in 9 seconds"_ or _"rep X self-approved 6 times"_ without
  seeing who attended what. Integrity oversight without surveillance.
- **(b) A per-class integrity summary** — counts only: approvals, rejections,
  self-approvals, median decision time, flag counts. No student names at all.

I'd take **(a)**. **[Q5]**

### 2. RLS recursion will bite us on day one

Standard Supabase trap: if the policy on `profiles` has to query `role_assignments`,
and `role_assignments`' policy queries `profiles`, Postgres errors with infinite
recursion — and the usual "fix" people reach for is disabling RLS on one of them,
which is how these systems leak.

Do it properly from the first migration: put roles into the JWT via a **custom access
token hook**, so a policy reads a claim instead of doing a table lookup. Faster and
non-recursive. This shapes Phase 1, which is why it's here and not in Phase 7.

---

## What I have NOT designed yet

- Holidays / class cancellations — **[Q9]**, may not be in v1 scope.
- Notifications — **[Q12]**.
- Timetable recurrence (weekly repeating sessions vs ad-hoc creation) — **[Q7]**.
