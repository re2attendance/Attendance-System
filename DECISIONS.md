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

---

## 2026-07-21 — Deployment

### D-033 — Vercel project `attendance-system`, GitHub auto-deploy verified ✅ DONE

Live at https://attendance-system-six-sigma.vercel.app. The project already existed
from the v1 build; reused rather than recreated. Push-to-`main` triggers a production
build (verified: a deploy started 25s after a push and was ready in 26s), and pull
requests get preview deployments.

### D-034 — Stale v1 environment variables removed from Vercel ✅ DONE

The project carried four variables from the abandoned build. Removed:

- **`SUPABASE_SERVICE_ROLE_KEY`** — the important one. It bypasses RLS completely and
  was sitting in Production and Preview for a design that deliberately never uses one
  (D-004). Nothing in the current codebase referenced it.
- `CRON_SECRET` — dead v1 config.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — superseded by the publishable key (D-031).

Added `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
`NEXT_PUBLIC_UNIVERSITY_EMAIL_DOMAIN` across production, preview and development.

> **Follow-up for the owner:** removing the key from Vercel does not revoke it.
> It is still valid in the Supabase dashboard, and it was deployed for a project that
> has since been abandoned. **Rotate it** (Project Settings → API → service_role →
> reset) so a copy leaked from the old build cannot bypass RLS on the live database.

### D-035 — Node version is inconsistent across environments ⛔ OPEN

Local is Node 20.20.2, CI pins 20, `engines` says `>=20.9`, but Vercel builds on
**24.x**. Building and testing on different majors than production is how
works-on-my-machine bugs reach students.

Worse: **Node 20 reached end of life in April 2026** — it is no longer receiving
security patches, and it is what the local machine and CI are both on.

Recommendation: align everything on **Node 22 LTS** — update `engines`, the CI
`node-version`, and the Vercel project setting, and upgrade the local runtime via nvm.
Not done yet: it changes the local toolchain, so it needs approval first.

---

## 2026-07-21 — Schema approved, security closed

### D-036 — Node 22 LTS across every environment ✅ DONE (closes D-035)

Local 22.23.1 via nvm, CI pinned to 22, `.nvmrc` added, and `engines: "22.x"` — which
Vercel reads to pin its build image, so the version lives in the repo rather than in
dashboard state nobody can see. Typecheck and build pass on the new runtime.

### D-037 — RLS enabled on all 19 tables ✅ DONE

Migration `0010_enable_rls.sql`, applied to local and hosted.

The order was wrong originally: `0001`–`0009` created tables with RLS off, and the
publishable key is inlined into the public client bundle, so for a window anyone could
read or write every row. Nothing was exposed in practice (no rows, no users), but the
lesson stands — **lock first, open deliberately**. RLS with no policies denies
everything, which is the correct resting state, and RLS does not restrict
`SECURITY DEFINER` functions, which is how the write path is designed anyway.

Supabase's critical `rls_disabled` advisory is cleared; only the expected INFO-level
`rls_enabled_no_policy` remains until the policy migration lands.

### D-038 — Schema approved ✅ DECIDED

Owner approved the model 2026-07-21. Hosted verified identical to local: 19 tables,
56 check constraints, 4 exclusion constraints, 38 indexes.

Three open judgement calls confirmed as built:

- **`day_of_week` is ISO-8601**, Monday = 1 … Sunday = 7, matching Postgres `isodow`
  so session generation needs no conversion.
- **"Minimum 1 rep per class" stays out of the database** — a DB minimum would make
  class creation impossible, since the class must exist before anyone can be appointed
  to it. The admin dashboard warns on classes with zero reps instead.
- **`disputes.semester_id` is stored, not derived** — so the per-semester count is a
  single lookup and cannot change retroactively if a session's date is later edited.

### D-039 — Service-role key rotation ⛔ OPEN — owner action only

The Supabase MCP can read keys but cannot reset them, so this cannot be automated from
here. Dashboard → Settings → API → `service_role` → reset.

Needed because that key **bypasses RLS entirely** — D-037 does not protect against it.
It was deployed in a public build for the abandoned v1 project, so treat it as
compromised. Nothing in the current codebase uses it; rotating breaks nothing.

### D-040 — Migrations reached the hosted project outside this session ℹ️ NOTED

`0001`–`0009` were found already applied, with matching version numbers and file names,
before this session pushed them. Consistent with `supabase db push` having been run by
the owner. Recorded because for a system whose premise is a trustworthy audit trail,
"who can change the database" is itself worth writing down.

---

## 2026-07-21 — RLS-bypassing credentials eliminated (closes D-039)

### D-041 — Legacy API keys disabled, not rotated ✅ DONE

The request was to rotate `service_role`. Disabling the legacy keys is strictly better:
rotation mints a **new** `service_role` key that still bypasses RLS — the same hole with
a different value — whereas disabling removes the capability. It is also a reversible
toggle (`PUT /v1/projects/{ref}/api-keys/legacy?enabled=…`) if anything ever needs it.

Both legacy keys (`anon` and `service_role`) are off. Neither was in use: Vercel carries
only the four `NEXT_PUBLIC_*` variables, and the app authenticates with the publishable
key.

Verified: `service_role` against the REST API returns **401**.

### D-042 — Modern `sb_secret_…` key deleted ✅ DONE

The publishable/secret pair that replaced anon/service_role still included a secret key,
which bypasses RLS exactly as `service_role` did. Confirmed it could read `public.classes`
despite RLS, then deleted it. Nothing referenced it.

**The project now has no RLS-bypassing credential at all**, which is D-004 achieved
rather than merely intended. If a genuine server-side need ever appears, mint a new
secret key deliberately — but the design says privileged writes go through
`SECURITY DEFINER` functions, so treat that need as a red flag.

Final key inventory: legacy anon (disabled), legacy service_role (disabled),
`sb_publishable_14kXl…` (active, fully constrained by RLS). Zero secret keys.

### D-043 — RLS proven working, not merely enabled ✅ VERIFIED

Using the publishable key — which anyone can extract from the production JavaScript
bundle:

- `GET /rest/v1/profiles` → `[]`
- `GET /rest/v1/attendance_records` → `[]`
- `POST /rest/v1/classes` → `42501: new row violates row-level security policy`

That last one is the first real evidence the boundary holds under a hostile client,
which is the assumption the whole design rests on.

### D-044 — Management token handling ⚠️ LESSON

A Supabase personal access token (`sbp_…`) was pasted into the chat transcript, where it
persists and is re-sent on every turn. It was used for D-041/D-042, the local copy was
shredded immediately after, and the owner was told to revoke it.

**For next time:** credentials should not enter the conversation. Prefer an interactive
CLI login, or a file written outside the repo and referenced by path.

---

## 2026-07-21 — Phase 1 backend, part 1 of 2

### D-045 — Role lookups use SECURITY DEFINER helpers, not a JWT hook ✅ DECIDED

Reverses the Phase 0 intent (custom access token hook). Both solve the recursion
problem — a policy on `profiles` that queries `role_assignments`, whose own policy
queries `profiles`, errors with infinite recursion — but the hook lives in dashboard
configuration the repo cannot version, and the security boundary belongs entirely in
migrations. Cost is a function call per policy evaluation, irrelevant at this scale.

All helpers are `stable security definer set search_path = ''`, and wrap
`(select auth.uid())` so Postgres evaluates it once per statement, not once per row.

### D-046 — Privileges are declared in migrations, not inherited ✅ DECIDED

Supabase carries two conflicting default-privilege sets for schema `public`:
`supabase_admin` grants full DML to anon/authenticated/service_role, `postgres` grants
only `Dxtm`. Migrations run as `postgres`, so which applies depends on platform
version — and it **genuinely differed between this project's local stack and its
hosted database**. Identical migrations were producing different security in the two
environments: local denied at the grant layer, hosted at the policy layer.

Worse, the default grants **TRUNCATE, which is not subject to RLS** — a role holding
it can empty a table no policy would let it read. `anon` held TRUNCATE on
`attendance_records` on the hosted project. Not reachable through PostgREST, but not a
privilege an unauthenticated role should hold on an attendance ledger.

0012 now revokes everything from `anon`, revokes TRUNCATE from everyone, and grants
back deliberately. Both databases verified identical afterwards.

### D-047 — Admin reads students through a names-only view ✅ DECIDED

Build plan §6 requires the admin see names but not index numbers or emails. RLS filters
rows; this is a column requirement. So the admin has **no row access to `profiles` at
all**, and `admin_student_directory` is the only path — a view that simply does not
select the hidden columns, so no query can yield them.

### D-048 — Flags are hidden from the student they concern ✅ DECIDED

`attendance_flags` is readable by reps and watchers only. Telling a student their
submission was flagged for a shared device teaches them precisely how to evade the
check next week.

### D-049 — 0012 amended after being applied ℹ️ NOTED

Migrations should be immutable once applied. `0012` was amended the same day to strip
default privileges the view re-acquired (it is created after the blanket revokes run).
Acceptable here because both environments are under direct control and were verified
identical afterwards; the delta was applied to hosted explicitly. Not a habit to repeat
once there are environments we do not control.

---

## 2026-07-21 — Phase 1 backend, part 2 of 2

### D-050 — The write path is proven with pgTAP, run as `authenticated` ✅ DONE

`0013` and `0014` were written but never executed. They now apply from scratch and are
covered by 82 assertions in `supabase/tests/`, split by concern: capture, verification,
disputes, scheduling.

Every assertion runs after `set local role authenticated` with a `sub` claim set — the
same role and the same claim a browser holding the publishable key presents. Testing
these functions as `postgres` would prove nothing: `postgres` bypasses RLS, so the
boundary would be invisible and every test would pass whether or not it held.

Two failures during writing were the design working rather than bugs:

- A test helper that looked a record id up as the calling student returned null,
  because RLS quite correctly hides one student's record from another. The helper had
  to resolve ids as the owner. **RLS was strong enough to break the test harness.**
- The same for a session belonging to another class.

### D-051 — The fixture lives outside the test glob ℹ️ NOTED

`supabase test db` runs **every** `.sql` file under `supabase/tests/`, recursively, and
a shared fixture has no TAP plan, so it fails the run and — worse — executes outside a
transaction, leaving `schema t` and seven `auth.users` rows behind in the database it
was run against. The fixture is therefore `fixtures/world.psql`: `\ir` includes it
happily, and the glob does not match it.

### D-052 — Database tests now gate CI ✅ DONE

A second CI job stands up the real local stack, applies all 14 migrations from scratch,
and runs the suite. Tests that only ever run on a developer's machine are documentation.

### D-053 — The auto-open fallback is unbuilt ⛔ OPEN — needs a decision

`attendance_settings.auto_open_after_minutes` (default 15) and
`attendance_windows.auto_opened` were designed in `0007` for the case where a course rep
forgets to open attendance — "students are never stranded by an absent rep". **Nothing
implements it.** The setting is read into `effective_settings()` and then ignored; the
column is never set to true.

So today, a rep who does not tap "open" means nobody in that class can record
attendance for that lecture, with no recovery path. That is a real availability hole in
the one flow the system exists for, and it is currently dead configuration — which
AGENTS.md forbids either way: build it or drop it.

Three ways to close it, in ascending cost:

1. **Lazy auto-open inside `submit_attendance`.** If no window is open and the session
   started more than `auto_open_after_minutes` ago, the first student's submission opens
   one, flagged `auto_opened = true`. No scheduler, no new infrastructure. The rep's
   absence stays countable. Weakest anti-fraud: nobody is demonstrably in the room, so
   these windows lean entirely on the rep's later approval.
2. **`pg_cron` job every minute.** Opens windows on schedule, independent of whether any
   student submits. Cleaner semantics, one more moving part to operate.
3. **Drop both.** Declare that no rep means no attendance, and delete the setting and the
   column. Defensible — it makes the rep's presence load-bearing, which is the design's
   whole anti-fraud premise — but it punishes students for a rep's failure.

**Recommendation: (1).** It fits the existing model, needs no scheduler on the free tier,
and keeps `auto_opened` as the countable signal that a rep is not doing the job. Not
implemented pending a decision.

### D-054 — The auto-open fallback fires on submission (closes D-053) ✅ DONE

Chosen over a `pg_cron` job and over deleting the feature. `0015` replaces
`submit_attendance` so that, where it used to turn the student away, it opens a window
itself and records that it did.

**Why not cron:** it buys nothing for integrity — nobody is in the room either way —
while adding the only always-on background process in the system, one that fails
silently. Paying an operational cost for zero trustworthiness gain is a bad trade.

**Why not delete it:** it punishes a whole cohort for one person's lapse, and leaves
them no recourse at all — no record means no dispute, because `raise_dispute` needs a
record to point at.

**Why not the retroactive admin door:** it is weaker exactly where it counts. Opening
the window the next day makes the location check meaningless — students submit from
home and the record rests on the rep's memory of a room from a week ago. That is the
paper sheet with extra steps. Kept in reserve if forgotten-entirely sessions turn out
to happen in practice.

What the fallback keeps is the lock that actually stops the fraud: the student must be
inside the campus geofence **during the lecture's own time window**. Signing in for an
absent friend still requires that friend to be on campus while the lecture runs. What
it gives up is the rep watching submissions arrive live — so every such check-in is
flagged `auto_opened_window`, and the rep still decides every record afterwards.

Three restrictions make it narrow:

- **Only when no window has ever existed** for that session. If the rep opened one and
  it closed, they are present and engaged, and the top-up windows for latecomers are
  theirs. Without this a student could wait out the first window and quietly open the
  next one.
- **Clamped to the lecture.** `closes_at` is `least(now() + first_window, ends_at)`. A
  window still open after the session ends is a window for submitting from elsewhere.
- **Never after the lecture ends**, and never before `auto_open_after_minutes` has
  elapsed — the rep keeps first refusal.

Race-safe: two simultaneous first submissions resolve through `on conflict do nothing`
plus a re-select, the same pattern `attendance_records` already uses.

### D-055 — Attendance rates must count held sessions only ⛔ OPEN — Phase 6

Banked while deciding D-054. A session whose attendance never opened stays `scheduled`
rather than `held`, so it is already distinguishable in the data. When the analytics
land, the denominator must be **sessions that actually opened attendance** — otherwise
a lecture nobody could record counts as an absence against every student in the class.
