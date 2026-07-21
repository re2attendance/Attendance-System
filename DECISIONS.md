# Decisions Log

Append-only record of decisions, with the reasoning and the date. Newest last.
Anything still marked **OPEN** is blocking or awaiting a call.

---

## 2026-07-21 — Project start

### D-001 — Code lives in WSL, not OneDrive ✅ DECIDED

`~/attendance` (path corrected by D-024). OneDrive syncs `node_modules` (slow, corrupts
installs) and `/mnt/c` access from WSL makes hot reload 15–30s. Same call as the Sendy
project.

### D-002 — All accounts under `re2attendance@yahoo.com` ✅ DECIDED (by RM)

No `assetsbridge` / gmail accounts. The Supabase MCP is currently connected to
`manager@assetsbridge.org` and must be reconnected before any provisioning.

### D-003 — No Figma MCP; reference designs come as screenshots ✅ DECIDED

Build plan §4 prioritised it; I pushed back because it is believed to require a paid
Figma seat, which conflicts with the free-tooling constraint, and because screenshots
are read directly and are close enough at this scale. Approved 2026-07-21.
Revisit only if design fidelity visibly suffers.

### D-004 — Attendance writes go through `SECURITY DEFINER` RPCs ✅ DECIDED

Client cannot INSERT/UPDATE `attendance_records` at all. Status, timestamp and
computed distance are set server-side. Goal: never need the service-role key.

### D-005 — GPS is a deterrent, not proof ✅ DECIDED

Full argument and mitigation set in `docs/02-ATTENDANCE-INTEGRITY.md`.
Headline: device binding is the highest-value control, not geolocation.
Superseded in detail by D-011.

### D-006 — Disputes won by the student shouldn't count against the 2/semester limit ✅ DECIDED

Otherwise a student wrongly rejected three times has no recourse.
Superseded in detail by D-017 and D-018.

### D-007 — Course reps have no oversight ✅ RESOLVED by D-014, D-015, D-016

The gap was real: admin can't see attendance, the watcher only covers reps' own
records, so a rep could approve absent friends or reject honest students unseen.
Closed by three changes — mandatory written rejection reasons, admin access to the
audit log and integrity aggregates, and disputes judged by someone other than the
deciding rep.

### D-008 — `levels` should be a CHECK constraint, not a table ⛔ STILL OPEN

Four values (100–400), never change. A table adds a join and permits "level 550".
Build plan §6 says the admin can _create_ levels, which this contradicts — raised but
not yet answered. **Blocks migration `0003` (classes).** Defaulting to the CHECK
constraint unless told otherwise.

### D-009 — Testing stack: Vitest + pgTAP + Playwright ✅ DECIDED

pgTAP is the unusual pick and the important one: RLS bugs are invisible from the
frontend. React Testing Library deliberately deprioritised. Approved 2026-07-21.
Vitest is installed now; **Playwright is deferred** until there are real screens to
drive (it pulls ~400MB of browsers, and Phase 0 has no UI worth testing). pgTAP lands
with the first migration set.

---

## 2026-07-21 — Phase 0 questions closed

Full detail in `docs/03-PHASE-0-ANSWERS.md`.

### D-010 — Campus-wide geofence ✅ DECIDED

Per-room rejected: indoor GPS error (20–50m) exceeds room size, so a room fence both
rejects honest students inside and accepts anyone in the corridor.

### D-011 — v1 anti-fraud set ✅ DECIDED

Shared-device detection (flag, not block) + rep-opened attendance window + GPS accuracy
floor (~150m). Impossible-travel and rotating in-room code dropped from v1.
Server-authoritative time/window/distance is baseline, not a toggle.

### D-012 — Attendance windows: multiple, for late check-ins ✅ DECIDED

Window 1 = first 30 min of the session. Reopens later per admin config so latecomers
can still record attendance, marked late. Not check-in/check-out.

### D-013 — Attendance config is per class ✅ DECIDED

`attendance_settings` with nullable `class_id`; global default row plus optional
per-class overrides, resolved by `coalesce`.

### D-014 — Rejections require a written reason, shown to the student ✅ DECIDED

### D-015 — Admin gets audit-log + integrity access, not attendance records ✅ DECIDED

### D-016 — Disputes are judged by the admin ✅ DECIDED

Never by the rep who made the decision — otherwise D-017 can never fire.
**Narrow exception to §6:** admin may read only records with an **open dispute**,
enforced by RLS. Recorded deliberately because it qualifies a locked requirement.

### D-017 — Disputes won by the student don't count against the 2/semester limit ✅ DECIDED

### D-018 — Dispute clock: 1 hour from `decided_at` ✅ DECIDED

Not from end of class — otherwise the right expires before the record is decided.

### D-019 — Undecided records escalate: 2h → watcher, then admin ✅ DECIDED

### D-020 — Holidays & cancellations in v1 ✅ DECIDED

Admin: institutional holidays + emergencies. Course rep: own class only, and **only
before the attendance window opens** (retroactive cancellation would let a rep erase
their own absence). Cancelled/holiday sessions are excluded from attendance
denominators.

### D-021 — Fixed weekly timetable, sessions materialised ✅ DECIDED

Generated per week across the semester, skipping holidays and the exam period.

### D-022 — Courses are shared across classes ✅ DECIDED

`class_courses` join table; `courses.class_id` dropped.

### D-023 — In-app notifications only ✅ DECIDED — no email provider.

---

## 2026-07-21 — Environment reconciled

### D-024 — Repo is `~/attendance`, remote `re2attendance/Attendance-System` ✅ DECIDED

Not `~/projects/attendance` (a scratch dir I created in error and have removed).
Confirmed on the yahoo-linked GitHub account.

### D-025 — Supabase project `attendance` (`xwmgqbzxtfkwnaeaphhz`) ✅ DECIDED

Org `re2attendance`, region eu-west-3 (Paris), Postgres 17. Already existed; MCP now
authenticated against the correct account.

### D-026 — Prior v1 build abandoned, not salvaged ✅ DECIDED

The repo contained a complete Phases 0–6 build, ended by commit `ab23865`
_"Reset to zero: clear the tree for a new build"_. Its 18 migrations survive at commit
`9bd41fe` and on the **`archive/v1`** branch (pushed to origin).

Rebuilding rather than salvaging, because the v1 permission model is incompatible with
the current spec: v1 had lecturers logging in ("the instructor's section control room",
session lifecycle owned by instructors), whereas the current brief states lecturers
**never log in and have no role in the app**. That difference reaches into RLS, the
session model and the whole verification chain — it is not a refactor.

The orphaned Supabase migration history (18 rows, ~178KB of SQL, no surviving objects)
was **cleared on 2026-07-21** so the CLI can apply a fresh `0001` onward. Safe: the SQL
exists in git history and on `archive/v1` at origin.

### D-027 — `.env.local` regenerated ✅ DONE

The old file pointed at the **local** Supabase stack (`127.0.0.1:54321`) using
Supabase's public demo keys, plus a `CRON_SECRET` from the v1 design — no real secrets
were exposed. Replaced with the hosted project's URL and modern publishable key
(`sb_publishable_…`, not the legacy JWT anon key). `.env.example` is committed
alongside; `SUPABASE_SERVICE_ROLE_KEY` is deliberately omitted from both.

### D-028 — Chrome DevTools MCP adopted ✅ DECIDED

Approved 2026-07-21. Justification is specific to this build: it can override browser
geolocation, which is the only practical way to test the campus geofence — submitting
as a student "on campus", then kilometres away, then with degraded GPS accuracy —
without physically travelling. Phase 3 is close to untestable without it. Also provides
real screenshots at phone widths for the responsive work.

---

## 2026-07-21 — Phase 0 scaffold

### D-029 — Next.js 16.2.10 / React 19.2.4 / Tailwind 4.3.3 ✅ DECIDED

Scaffolded with `--empty` deliberately: the default template ships marketing
boilerplate that would have to be deleted before real UI lands anyway.

### D-030 — TypeScript strict, plus `noUncheckedIndexedAccess` ✅ DECIDED

Beyond the brief's "strict mode". `noUncheckedIndexedAccess` forces array and record
lookups to be treated as possibly-undefined, which is exactly the class of bug that
turns into a silent wrong-attendance-row read. Also `noImplicitOverride` and
`noFallthroughCasesInSwitch`.

### D-031 — Modern publishable key over legacy anon JWT ✅ DECIDED

`sb_publishable_…` rotates independently of the project JWT secret, so a leaked client
key can be revoked without invalidating every session.

### D-032 — Playwright deferred, `--passWithNoTests` in CI until Phase 1 ⛔ TEMPORARY

Phase 0 introduces no business logic, and inventing a smoke test to make the suite
non-empty would be exactly the dead code §2.9 forbids. The first real tests are the
Phase 1 Zod email/index schema and the pgTAP RLS proofs. **Remove the flag then.**
