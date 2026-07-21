# Phase 0 — Answers & resulting design decisions

**Date:** 2026-07-21. Answers from RM, with the design consequences of each.

---

## Resolved

### Q1 — Semesters ✅

Admin selects a start and end date. A semester **also carries an exam-period
interval**. Multiple semesters exist over time.

**Schema consequence:**

```sql
create table semesters (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  starts_on     date not null,
  ends_on       date not null,
  exam_starts_on date not null,
  exam_ends_on   date not null,
  check (ends_on > starts_on),
  check (exam_ends_on >= exam_starts_on),
  check (exam_starts_on >= starts_on and exam_ends_on <= ends_on),
  exclude using gist (daterange(starts_on, ends_on, '[]') with &&)
);
```

**Follow-up needed:** no lectures run during the exam period, so session generation
must **skip exam dates**. Confirm that's right — see Open Follow-ups below.

### Q4 — Watcher absence ✅

The watcher **declares in-app that they'll be absent today**. If they haven't declared
and haven't acted **2 hours into the lecture**, the system treats them as absent and
course reps may self-approve.

**Consequence:** two distinct causes, both recorded, never silent:

- `watcher_declared_absent` — explicit, timestamped, watcher-initiated
- `watcher_timeout` — 2h elapsed from session start with no action

Both land in `attendance_records.verification_route` and the audit log, so
self-approval is always countable and attributable.

### Q7 — Fixed weekly timetable ✅

One timetable per class per semester, repeating weekly throughout.

**Consequence:** a `timetable_entries` table (class, course, room, lecturer,
day_of_week, start_time, end_time), and **sessions are materialised** — actual rows
generated for every week of the semester, skipping holidays and the exam period.
They are not computed on the fly, because attendance records, cancellations, disputes
and audit entries all need a real `session_id` to point at.

### Q8 — Courses are shared across classes ✅

**Consequence:** `courses.class_id` is dropped; a `class_courses` join table replaces
it. A session still belongs to exactly one class (attendance is per class-session).

### Q9 — Holidays & cancellations are in v1 ✅

- **Institutional holidays** and **institutional emergencies** — admin, campus-wide.
- **Class cancellations** — course rep, **their own class only**.

**Consequences — three of them, and the last two matter more than the feature:**

1. Model: cancellations cascade to `sessions.status = 'cancelled'`, with a
   `cancellations` row recording scope, type, reason, actor and timestamp.
2. **Cancelled sessions must be excluded from attendance denominators.** If a
   student's rate is `attended / all scheduled`, a holiday week silently drops the
   whole cohort's percentage and the analytics become nonsense. Rate must be over
   **held** sessions only.
3. **⚠ Retroactive cancellation is a fraud vector.** A course rep who missed a lecture
   could cancel it afterwards to erase their own absence. Proposed rule: a rep may
   only cancel a session **before its attendance window opens**; after that only the
   admin can, and every cancellation is audit-logged either way.

### Q10 — University email domain ✅ `upsamail.edu.gh`

### Q11 — Admin has no student profile row ✅

### Q12 — Notifications are in-app only ✅ No email provider needed.

### Q13 — Truancy threshold — deferred, decide before Phase 6.

---

## Resolved — second round (2026-07-21)

### Q2 — Geofence ✅ **Campus-wide.** Per-room rejected.

One admin-configurable centre + radius. Rooms keep coordinates for timetable display
only; they do not gate submission.

### Q3 — Mitigations ✅ **Shared-device protection + rep-opened attendance window.**

Rotating in-room code deferred. Server-authoritative time/window/distance is not a
feature toggle — it is simply how the RPC is written — so it stands regardless.
Accuracy floor and impossible-travel flag were not selected; see Open Follow-ups F-5.

### Q5 — Rep oversight ✅ **Mandatory rejection reason + admin audit-log access.**

The third proposal (a rep may not judge a dispute against their own decision) was not
selected. See F-6 — it is load-bearing for the Q6 rule below.

### Q6 — Disputes ✅

- A student has **1 hour after class** to raise a dispute.
- **A dispute the student wins does not count** against the 2/semester limit.
  See F-7: the 1-hour clock needs to start at the decision, not at class end.

### NEW — Attendance window is admin-configured ✅

> "the attendance open time, duration and frequency is determined by the admin"

The **course rep opens** the window; the **admin sets the policy** — when it may open,
how long it stays open, and how many times per session.

**Schema consequence — this splits attendance into three tables.** "Frequency" implies
a session can have more than one window (e.g. check-in _and_ check-out), so a single
row per student per session can no longer hold the raw submissions:

```sql
-- policy, set by admin
attendance_settings (
  window_duration_minutes, windows_per_session, auto_open_after_minutes,
  campus_center geography(Point,4326), campus_radius_m,
  dispute_window_minutes default 60, max_disputes_per_semester default 2,
  watcher_timeout_hours default 2
)

-- one row each time a rep opens attendance
attendance_windows (id, session_id, sequence, opened_by, opened_at, closes_at)

-- raw student submissions — the hostile input
attendance_checkins (id, window_id, student_id, submitted_at, location,
                     gps_accuracy_m, distance_m, device_hash,
                     unique (window_id, student_id))

-- the verified verdict, one per student per session
attendance_records (id, session_id, student_id, status, verified_by,
                    verification_route, rejection_reason,
                    decided_at, dispute_deadline,
                    unique (session_id, student_id))
```

Shared-device detection runs across `attendance_checkins` within a window.
Every threshold above lives in `attendance_settings`, not in code.

---

## Recommendations requested (Q2, Q3, Q5, Q6) — original reasoning

Full reasoning is in the chat reply of 2026-07-21; summarised here as the record.

### Q2 — Geofence: **one campus-wide fence** (recommended)

Per-room geofencing is precision theatre. A lecture hall is ~15×20m; indoor phone GPS
falls back to WiFi/cell triangulation at 20–50m error, often worse under concrete. A
20m room fence therefore **rejects honest students inside the room** while **accepting
anyone in the corridor or the next room**. It is simultaneously stricter-looking and
weaker. A campus fence is honest about what GPS can prove — "on campus", not "in room
B12" — and it never rejects an honest student. Rooms keep their coordinates for
timetable display; they just don't gate submission.

### Q3 — GPS mitigations for v1

Adopt: server-authoritative time/window/distance; shared-device detection (flag, not
block); accuracy floor; impossible-travel flag; suspicion-sorted rep queue.
Adopt with your approval: rep-opened ~5-minute window with auto-open fallback.
Defer: rotating in-room code.

### Q5 — Rep oversight: three-part answer

1. **Mandatory written reason on every rejection**, shown to the student.
2. **Admin "Integrity" view** — audit log, flags and per-rep aggregates only. Never
   attendance records.
3. **Disputes are judged by someone other than the deciding rep** (another rep in the
   class → watcher → admin).

### Q6 — Disputes: only _declined_ disputes count against the 2/semester limit

A dispute the student wins is the system working, not nuisance. See chat reply.

---

## Resolved — third round (2026-07-21)

### F-9 — Multiple windows are for **late check-ins**, not check-out ✅

Window 1 opens for the **first 30 minutes of the session**, then closes. It reopens
later per admin configuration, so a student who missed the opening can still record
attendance — marked late, not excluded.

**Consequence:** lateness stays a server-computed `minutes_late` on the record
(`submitted_at - sessions.starts_at`), not a separate status. The window `sequence` is
recorded but is descriptive; the minute count is the real measure. No status change —
`pending / approved / rejected` still holds, per build plan §5.

### NEW — Attendance configuration is **per class** ✅

> "each class can have a different configuration"

**Consequence:** `attendance_settings` gains a nullable `class_id`.

- One row with `class_id is null` = institution-wide default.
- Optional per-class override rows; `unique (class_id)`.
- Resolution is `coalesce(class_override, global_default)`.

### F-7 — Dispute clock starts at the decision ✅ Approved.

1 hour from `attendance_records.decided_at`, with an immediate in-app notification.

### F-6 — Disputes are judged by the **admin** ✅

Not by the rep who made the decision.

> ⚠ **This collides with build plan §6**, which states the admin _cannot see attendance
> records_. Judging a dispute requires seeing the record being disputed.
> **Implementing as a narrow exception:** the admin can read **only those records with
> an open dispute** — never the class's attendance history, never the full list. RLS
> enforces exactly that scope. Flagging so it's a recorded decision rather than a
> silent contradiction; say the word if you'd rather route to another rep in the class.

### F-8 — Undecided records escalate ✅

`pending` for 2 hours → watcher; still undecided → admin. Surfaced in the integrity view.

### F-5 — Accuracy floor kept, impossible-travel dropped ✅

Discard GPS readings worse than ~150m. No impossible-travel detection in v1.

---

## Open follow-ups

- **F-1** ✅ No lectures during the exam period — session generation skips those dates.
- **F-2** ✅ Approved: reps may cancel only **before** the attendance window opens;
  after that, admin only. All cancellations audit-logged.
- **F-3** ✅ Approved: attendance rate is computed over **held** sessions only;
  cancelled and holiday sessions are excluded from the denominator.
- **F-4** Truancy threshold (Q13) — deferred, needed before Phase 6.
- **F-5** Accuracy floor / impossible-travel flag — not selected in round 2.
  Recommend keeping the accuracy floor (a few lines, stops junk coordinates polluting
  the record) and dropping impossible-travel for v1. Confirm.
- **F-6** ⚠ **Blocking-ish:** with reps judging disputes against their own decisions,
  the "wins don't count against the limit" rule can never fire — a rep simply declines
  everything. Re-raised.
- **F-7** ⚠ **The 1-hour dispute clock must start at the decision, not at class end.**
  If a rep decides three hours after the lecture, the student's right to dispute has
  already expired before there was anything to dispute. Proposed: 1 hour from
  `decided_at`, with an immediate in-app notification so the clock is fair.
- **F-8** What happens to a `pending` record nobody ever decides? Auto-approve rewards
  rep negligence and lets fraud through; auto-reject punishes students for it. Proposed:
  escalate to the watcher, then admin, and surface it in the integrity view.
- **F-9** Does "frequency" mean **check-in and check-out** (a second window near the end
  of the lecture, catching students who submit and leave)? The three-table model above
  assumes yes and supports 1..n windows either way — but confirm the intent.
