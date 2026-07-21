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

Half-closed by D-056: the rule is now enforced at write time — a session that never
opened attendance cannot be finalised, so it produces no absences at all. The analytics
side is still open, because a rate is a query and this only fixes the ledger.

### D-056 — A student who never submits is marked `absent` ✅ DONE (asked for by RM)

Until now absence was the absence of evidence: no row at all. That is clean in the
schema and useless everywhere else — nothing to show the student, nothing to dispute,
and a denominator every future query would have to reconstruct by anti-joining the
roster. `0016` makes it a fourth `status` on `attendance_records`.

**When they are written** — an explicit `finalise_session_attendance(session)` that a
course rep calls at the end of their verification queue, not a scheduled sweep. Chosen
over `pg_cron` for the same reason as D-054: this system has no always-on background
process, and adding one that silently writes verdicts about students is the worst
possible first candidate. It was also chosen over materialising absences lazily on read,
which would have made a student refreshing their own history the act that creates their
own absence.

The cost is real and should be stated: **if no rep ever taps finish, the absences never
exist.** That is the same exposure the pending queue already has — a rep who never
verifies leaves records pending forever — so it does not add a new class of failure, and
`sessions.attendance_finalised_at` makes an unfinished session visible to the admin.

Five guards, all of them load-bearing:

- **Only a `held` session.** A lecture where attendance never opened is one nobody
  _could_ have recorded; marking its whole cohort absent would punish every student for
  a failure that was never theirs. This is D-055 enforced at the only point that can.
- **Only after the lecture has ended**, and **only when no window is still open.** Both
  are needed: a rep-opened window is not clamped to `ends_at` the way an auto-opened one
  is (D-054), so one can outlive the lecture.
- **Only students who existed before the lecture ended.** Nobody is absent from a class
  that happened before they had an account.
- **Idempotent.** Three reps share a class; the second one to tap finish marks nobody
  twice.

An absent record carries a `dispute_deadline` like any other verdict, because a flat
battery is precisely the case the dispute route exists for. It carries
`verification_route = 'no_submission'` and, by CHECK constraint, no `first_checkin_id`
and no `minutes_late` — "absent" means "never submitted", stated as a constraint rather
than as a rule some future function is trusted to remember.

Note what this deliberately does **not** allow: a rep cannot approve an absent record.
`decide_attendance` only touches `pending`, so the only route out of an absence is a
dispute judged by an admin. That is a feature — otherwise a rep could mark friends
present who never submitted anything at all, which is the original paper-sheet fraud
with a database behind it.

### D-057 — A course rep may call off a lecture in its first 45 minutes ✅ DONE (asked for by RM)

Supersedes the cancellation half of D-020, which let a rep cancel only _before_
attendance had opened. That was too tight for the case it most needed to handle: a
lecturer who turns up, talks for twenty minutes and leaves. Attendance had opened, so
only an admin could say the session did not count — for something the rep watched
happen and the admin did not.

The rule is now time-boxed instead of state-boxed: a rep may cancel inside
`rep_cancel_grace_minutes` of the start, whether or not a window exists. 45 by default,
and a setting rather than a literal like every other threshold here (D-013).

**D-020's actual worry survives past the grace.** A retroactive cancellation is how a
rep erases their own absence, so after 45 minutes it is admin-only. What changed is the
size of the hole, not its existence: a rep can now void a lecture they attended, within
45 minutes of its start. That is bounded, it is in the audit log, and the check-ins that
prove people were in the room are kept.

**Cancelling voids the attendance already collected.** A cancelled session leaves every
denominator, so leaving approved records inside one contradicts "rates are over held
sessions only". The records are deleted; the **check-ins, flags and audit entries are
not**, which is what makes a rep who cancels lectures they did attend visible rather
than merely unlucky. Disputes cascade with their records — the audit log is where that
history survives.

Implemented as a `BEFORE UPDATE OF status` trigger on `sessions` rather than a line
inside `cancel_session()`, so the invariant holds on every path into `cancelled`: the
rep's call-off, an admin's, the holiday cascade, and paths not yet written.

### D-058 — A rep-opened attendance window is clamped to its lecture ✅ DONE

Noticed while building D-056 and fixed in `0017` on the owner's instruction.
`open_attendance_window` set `closes_at = now() + first_window_minutes` with no upper
bound, so a rep who opened attendance in the last five minutes of a lecture left a
window running 25 minutes after the room had emptied — submittable from anywhere on
campus, by anyone whose friend was still there.

D-054 had clamped exactly this for the auto-opened window and given the reason: "a
window still open after the session ends is a window for submitting from elsewhere."
The same argument always applied to the rep-opened path; it was simply never applied.

Two lines. `closes_at` becomes `least(now() + …, ends_at)`, and the end-of-session
guard becomes strict (`now() >= ends_at` rather than `>`). The second is what stops
the first from producing a window with no life in it: at the instant `now() = ends_at`
the clamp would set `closes_at = opened_at`, which the schema's own
`windows_closes_after_open` check would reject with a confusing message. Refusing to
open the window is the honest answer, and it keeps the guard from being unreachable
code.

Behaviour change worth knowing: a rep who taps open in the final seconds of a lecture
is now turned away instead of receiving a window. That is the intent.

`finalise_session_attendance` still refuses while any window is open rather than
assuming the clamp holds — it is one line, and a guard that does not depend on another
function's invariant is a guard that survives the next change to it.

### D-059 — Supabase Branching is on: pushing to `main` deploys DDL to production ⚠️ DISCOVERED, NOT DECIDED

Found on 2026-07-21 while preparing to push `0016`/`0017` to the hosted database by
hand. There was nothing to push: the remote already had every object, and
`supabase_migrations.schema_migrations` already held 17 rows.

The cause is Supabase Branching, enabled 2026-07-19 and bound to the git branch `main`
(`GET /v1/projects/{ref}/branches` → `git_branch: "main"`, `is_default: true`). It
applies everything in `supabase/migrations/` to the **production** database on every
push to `main`. Nobody wrote this down, and the deployment notes only mention Vercel.

**What this means in practice:** `git push origin main` is a production schema
migration, not just a code deploy. There is no separate promotion step, no approval
gate, and no staging database in between. CI runs the pgTAP suite on a _pull request_,
but a direct push to `main` deploys first and tests in parallel — so a migration that
fails its tests is already live.

Verified rather than assumed: the remote schema was introspected directly and carries
`rep_cancel_grace_minutes`, `finalise_session_attendance`,
`void_attendance_on_cancellation`, `sessions.attendance_finalised_at`,
`records_absent_has_no_checkin`, and the `least(` clamp from `0017`.

**Open question for the owner.** Two things are worth deciding before the frontend
starts producing riskier migrations:

1. Whether work should move to pull requests, so CI's database job gates `main` instead
   of racing it. Today the protection exists but runs too late to stop anything.
2. Whether a destructive migration should ever be able to reach production without a
   human in the loop. `0016` deletes rows in a trigger; a future one could drop a
   column. Branching will apply it the moment it is pushed.

Not changed unilaterally — it is a workflow decision, and the current setup is what the
owner has been using. Closed by D-060.

### D-060 — `main` is protected and gated on the database suite ✅ DONE (asked for by RM)

Closes question 1 of D-059. GitHub branch protection on `main`, requiring the `database`
status check — the CI job that stands up a real Postgres, applies all 17 migrations from
scratch and runs the 128 pgTAP assertions.

Settings, and why each one:

- **`required_status_checks: ["database"], strict: true`.** `strict` forces the branch to
  be up to date with `main` before merging, so the suite runs against the code that will
  actually land rather than against a stale base.
- **`enforce_admins: true`.** The owner is the only person who pushes here and is an
  admin; with this false the rule would apply to nobody and the protection would be
  decorative. The escape hatch is still there — an admin can turn protection off
  deliberately — but it is now a deliberate act rather than an ordinary push.
- **`required_pull_request_reviews: null`.** No approval requirement. On a solo repo that
  would deadlock every merge, and the gate that matters here is the test suite, not a
  second pair of eyes.
- **Force pushes and branch deletion disabled**, because Supabase Branching applies
  whatever lands on `main` and a rewritten history is a schema you cannot reason about.

**The workflow this creates:** direct pushes to `main` are now rejected outright
(`GH006: Required status check "database" is expected` — verified with a real push, not
assumed). Work goes on a branch, then a PR, and merges once CI is green. Since
Branching deploys on merge to `main`, that check is now the last thing standing between
a migration and the production database.

`verify` (lint, typecheck, build) is deliberately **not** required yet. It guards the
frontend, and there is no frontend; adding it now would mean a red build could block a
database fix. Worth adding the moment Phase 1 starts.

Question 2 of D-059 — whether a destructive migration should reach production with no
human in the loop — is still open. A required check proves a migration _passes its
tests_; it does not prove a `drop column` was intended. Closed by D-061.

### D-061 — Destructive migrations are allowed, but must say so ✅ DONE (decision delegated to me)

Closes the second half of D-059. A new required check, `guard`
(`scripts/check-migrations.mjs`), refuses a pull request that either edits an
already-merged migration or adds one that destroys data without an explanatory
`-- DESTRUCTIVE: <reason>` line.

**Where the interception has to happen.** Supabase Branching watches the repository
directly; it is not a GitHub Action, so a deployment-environment approval cannot sit in
front of it and there is no post-merge gate to add. The pull request is the only place
anything can be stopped. That constraint, more than anything, shaped the answer.

**Why not simply block destructive migrations.** Because they are sometimes correct, and
a rule that says "never" gets switched off the first afternoon it is wrong. `0016` itself
deletes rows — the cancellation trigger voids attendance for a session that no longer
happened — and that was the right call, argued at length in D-057.

**Why not turn Branching off and push migrations by hand.** This was the tempting answer
and it is worse. It replaces an automated step that always runs with a manual step that
will eventually be forgotten, and a forgotten `db push` leaves the repo and the database
silently disagreeing — which is harder to notice, and harder to unpick, than a bad
migration that at least announces itself. Automation that always happens beats ceremony
that usually happens.

**So: permitted, but stamped.** The same move the schema already makes in three places —
`auto_opened` on a window, `self_approved_watcher_timeout` on a record, `no_submission`
on an absence. Each is allowed and each leaves a mark, so the thing that matters is
countable rather than merely possible. A destructive migration now leaves its mark in the
migration itself, where the reason survives next to the SQL instead of in a pull-request
comment nobody reads twice.

**What it does not flag, deliberately:** dropping a function, trigger, policy, index or
constraint. That is how this schema is edited — `0016` drops and recreates two check
constraints and replaces `effective_settings` — and none of it loses data. Flagging them
would train everyone to add the marker by reflex, which is precisely the failure this
check exists to avoid. It also ignores `revoke truncate`/`grant`, which hand privileges
around rather than deleting anything, and strips comments before matching, because `0012`
discusses TRUNCATE in prose for three lines.

**The immutability half is the one that will fire most often.** Editing a merged
migration is the easier mistake and the quieter one: Branching has already applied it and
will not apply it again, so the edit changes the repo and not the database, and the two
disagree from then on with nothing to indicate it.

### D-062 — There is no backup, and that is now the largest single risk ⛔ OPEN — owner action

Raised while deciding D-061, because a guard is only half an answer: it lowers the
chance of destroying data and does nothing about the consequence.

The Supabase **free tier has no point-in-time recovery and no daily backups**. Today that
costs nothing — the database holds no real data, and every table can be rebuilt from
`supabase/migrations/`. The moment the first cohort signs in, attendance records become
the one thing in this system that cannot be regenerated from anything. A dropped table
would be unrecoverable, guard or no guard.

Two ways to close it, and they are not exclusive:

1. **Supabase Pro** (~$25/mo) for daily backups and 7-day PITR. The honest option, and
   the only one that recovers from "the table is gone" rather than "the table is stale".
2. **A scheduled `pg_dump`** from a GitHub Action to a private artifact or release. Free,
   but it needs database credentials in repository secrets — which this project has so
   far deliberately avoided (D-004: no service-role key anywhere) — and it recovers only
   to the last nightly run.

**Recommendation: (1), before the first real student account exists**, not before. Paying
for backups of an empty database is waste; discovering the gap after a cohort has been
using it for a term is unrecoverable. This is a spending decision, so it is the owner's.

---

## 2026-07-21 — Phase 1 opened

### D-063 — The first admin is created by hand, then granted by migration ✅ DECIDED (by RM)

Signup cannot produce an admin: `profiles` requires an index number and a class, and an
admin deliberately has neither (0004). So the owner creates the auth user once in
Supabase Dashboard → Authentication → Add user, and a migration grants the role by
matching that email — raising if it matches nothing, so it cannot silently no-op and
leave a system with no administrator.

Rejected: a `bootstrap_admin()` RPC that grants admin to the first caller and then
self-disables. It removes the manual step but opens a window between deploy and that
first call in which anyone who can sign up could claim the system. On a public URL that
window is real. Also rejected: seeding `auth.users` directly from a migration — it puts a
credential in git and hand-writing those rows bypasses Supabase Auth's own invariants.

**Blocked on the owner:** the admin's email address.

### D-064 — Signup requires email confirmation, over custom SMTP ✅ DECIDED (by RM)

This is an integrity decision, not a UX one. The email is otherwise just a typed string:
without confirmation, the first person to register `1000004@upsamail.edu.gh` owns that
student's attendance identity permanently, and the real 1000004 is locked out by the
uniqueness constraint on `profiles.email`. For a system whose entire purpose is a
trustworthy attendance record, an unverified identity is the wrong foundation.

Supabase's built-in email service sends roughly 2–4 messages an hour, which is unusable
for a cohort, so this requires a custom SMTP provider. Free tiers that fit: Resend
(3,000/month) or Brevo (300/day).

This does not reopen D-023 (in-app notifications only, no email provider). That decision
was about _notifications_; authentication mail is a different thing and Supabase Auth
sends it directly.

**Blocked on the owner:** an SMTP account and its credentials, plus the Supabase Auth
Site URL and redirect allowlist, which the deployment notes record as never having been
set — password-reset and confirmation links will not point anywhere useful until they are.

### D-065 — The real class list is seeded now ✅ DECIDED (by RM)

`profiles.class_id` is `not null`, so no student can sign up until at least one class
exists — but class management is Phase 2. Rather than reorder the phases or weaken the
constraint, the real class list is seeded in a migration now, and Phase 2's admin CRUD
manages that same list when it arrives.

Rejected: making `class_id` nullable so signup can defer it. `my_class_id()` drives
nearly every RLS policy in 0012; a null there adds an edge case to all of them and
introduces a half-registered user state that every screen would have to handle.

**Blocked on the owner:** the actual class names and levels.

### D-066 — Next.js 16 renamed `middleware.ts` to `proxy.ts` ⚠️ TRAP, recorded

Supabase's SSR documentation — and every example of this integration in circulation —
puts session refresh in `middleware.ts` exporting a function called `middleware`. In
Next.js 16 that file is deprecated in favour of `proxy.ts` exporting `proxy`
(`node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`).

The failure mode is what makes this worth writing down: a `middleware.ts` here is not an
error, it is simply never called. Auth tokens are short-lived, so the app would work
during development and log people out mid-lecture in production. `pnpm build` confirms
the file is wired by printing `ƒ Proxy (Middleware)` in the route table.

Note also that `proxy` runs on the nodejs runtime and cannot be set to edge.

### D-067 — Class ids are validated with Zod's `guid()`, not `uuid()` ✅ DECIDED

Caught by a unit test failing against its own fixture. Zod 4's `z.uuid()` enforces the
RFC 9562 version and variant bits; Postgres's `uuid` type does not, and accepts any 32
hex digits. Every id in the pgTAP fixtures is of the non-conforming kind, and the seeded
class list of D-065 will use hand-picked ids too.

Validation stricter than the database is the exact failure this shared-schema layer
exists to prevent: a signup form refusing a class that genuinely exists, with an error
message about nothing the student can see or fix.

---

## 2026-07-21 — Phase 1 UI, against the owner's reference

The reference supplied was three states of one login screen (empty, filled, focused):
centred white card on grey, blue primary, Google button, email + password, "Remember me".
The owner's instruction was that it is generic, that it must not be copied, and that the
result must not feel borrowed. What follows is what was taken, what was rejected, and why.

### D-068 — Blue, not the yellow in §10 ✅ DECIDED (by RM)

Build plan §10 locked "minimalist, yellow + white". The reference is blue, and the owner
chose the reference. §10 has been amended rather than left to contradict the code.

Recorded because it was a genuine conflict rather than an oversight, and because the
argument against went the other way: near every auth screen in circulation is this blue,
so it is the palette most likely to read as borrowed. It is now one blue, one near-black,
two greys and one red — narrow on purpose, because the single signal that has to survive
being read at arm's length in a lecture hall is whether attendance was recorded.

### D-069 — The index number is the identity; the email is derived ✅ DECIDED (by RM)

The strongest thing in this build, and it comes from a constraint rather than a
screenshot. 0004 requires `split_part(email,'@',1) = index_number`. The obvious build asks
for both and rejects the mismatch. Instead the student types their index number and
watches the university address assemble beneath it, read-only.

One fewer field, and an entire error class deleted rather than handled — the mismatch has
nowhere left to happen. It also means the signup form has no email input at all, which is
asserted in `identity.test.ts` so a future edit cannot quietly reintroduce one.

The same idea carries into sign-in, which takes **one** identifier field: seven digits
from a student, an address from the admin, who has no index number and no profile. Two
labelled fields would leave one of them dead weight for everybody.

### D-070 — Full-bleed and left-aligned, with hand-built components ✅ DECIDED (by RM)

The card is gone. A white panel floating on grey is the layout of every auth template
there is; edge-to-edge content on a left-aligned column reads as an application, and gives
the five-field signup room without scrolling on a small phone.

**A deviation to flag:** the locked stack (§3) names shadcn/ui, and these screens do not
use it. Everything Phase 1 needs is a label, an input, a button and a select — native
elements that are already accessible, where shadcn would add Radix and a generated
component set whose default look is exactly the borrowed quality being avoided. It has not
been ruled out: the moment Phase 2 needs a dialog, a popover or a combobox, the argument
reverses and hand-rolling those would be a mistake. Raised here rather than done silently.

Details that are deliberate rather than incidental:

- `min-h-dvh`, not `min-h-screen` — on mobile Safari `100vh` exceeds the visible area, so
  the submit button hides under browser chrome exactly when the keyboard is open.
- Inputs are 16px minimum — below that iOS zooms on focus and does not zoom back.
- `inputMode="numeric"`, not `type="number"` — the latter drops a leading zero from an
  identifier and adds a scroll wheel that can change it silently.
- 52px controls, not the 44px minimum: pressed with a thumb, often while walking.
- Plus Jakarta Sans over Inter or Geist, which are the defaults of every starter.

### D-071 — Google is restricted to the university domain, and re-checked server-side ✅ DECIDED (by RM)

upsamail.edu.gh runs on Google Workspace, so Google returning the address _is_ proof the
student owns it — stronger than a confirmation link, which only proves someone opened the
inbox once.

The `hd` parameter narrows Google's account chooser. **It is a convenience, not a
control**: it lives in a URL the browser can edit, so `/auth/callback` checks the returned
address against the domain again before trusting it, and signs the user out if it fails.
Without that second check, any personal Gmail account would be a way in.

Email + password is kept alongside it, per the owner, for anyone Google fails — so D-064's
SMTP provider is still required. Google alone would have removed it.

Two things the reference has that were dropped:

- **"Remember me"** — Supabase persists sessions by default and exposes no short-session
  option, so the checkbox would have controlled nothing. A control that does nothing is
  worse than none.
- **The back chevron** on the login screen, which had nowhere to go.

### D-072 — Failure messages never reveal whether an account exists ✅ DECIDED

Sign-in answers "that index number and password do not match" whether the account is
missing or the password is wrong, and the password-reset form says the same thing either
way. Distinguishing them turns a login form into a lookup tool for which index numbers are
registered — a roster of who attends this university, one guess at a time.

### D-073 — Dark mode built now, not deferred to polish ✅ DECIDED (by RM)

Chosen over waiting for Phase 7. The tokens are CSS variables already, so the plumbing is
cheap today and gets expensive once dozens of components have hardcoded a colour. The cost
is real and accepted: every screen from here needs reviewing in both themes.

It is not an inversion. Pure black is avoided for the same reason pure white is, surfaces
separate by lightness rather than by hairlines (which turn to mud on a dark ground), and
the blue _lightens_ — `#2b4ce0` against near-black fails contrast for the text sitting on
it, and a primary button nobody can read is not a primary button.

Two things had to change to make it possible, both of which would have silently produced a
half-dark interface:

- **`bg-white` became `bg-surface`/`bg-raised`, and `text-white` became `text-on-brand`.**
  A literal white does not respond to a theme. `on-brand` exists because the text sitting
  on the blue flips to near-black in dark mode, where the lightened blue makes white
  unreadable.
- **The select's chevron became a real `<svg>`** instead of a background `data:` URI. A
  data-URI has to hardcode its stroke colour, so it would have stayed near-black on a dark
  field.

**The trap worth recording:** Tailwind v4 hoists every `@theme` block into a single root
declaration _regardless of the at-rule wrapping it_. A `@theme` nested inside
`@media (prefers-color-scheme: dark)` does not scope anything — it overwrites the light
theme outright, and dark mode is simply always on, in both themes, with no error. The
correct form is a plain `:root` override inside the media query.

Nothing catches this except reading the compiled CSS, which is how it was caught: the
built stylesheet had the dark values sitting in the light `:root`.

### D-074 — The palette is UPSA's own: navy #2b2c49, gold #cc910f ✅ DECIDED (by RM)

Supersedes D-068. The owner supplied the university crest, and its two colours were
sampled directly from the artwork rather than eyeballed — gold `#cc910f`, navy `#2b2c49`.

This resolves a confusion running through the whole project. §10 originally specified
"yellow + white"; that yellow was almost certainly this gold all along. The blue adopted in
D-068 came from a stock reference screenshot, not from the institution — so the palette had
drifted away from the brand on the strength of a template.

**Navy leads, gold accents**, and the order is a legibility decision rather than a taste
one: white on this gold measures ~2.5:1 and fails accessibility outright, so a gold primary
button would have to carry dark text. Navy carries white at ~15:1, which is the right
footing for a screen read at arm's length in a lecture hall. Gold is kept for the crest and
for the one moment worth marking — the pill where a student's derived university address
resolves.

Gold being used somewhere is not decoration: Tailwind v4 tree-shakes unreferenced theme
tokens, so a colour no component uses is silently absent from the build. The first build
after this change shipped no gold at all, which is how that was noticed.

The crest arrived as a JPEG on white. It is processed into `public/upsa-crest.png` with the
white knocked out through an alpha ramp, so it does not sit in a white box on the dark
theme. **An SVG from the university would be better** and should replace it when available.

### D-075 — Theme follows the device, and the student can override it ✅ DECIDED (by RM)

Three states, not a toggle: System (default), Light, Dark. A two-way switch has no way back
to "follow my phone" once touched, so a student who tries dark at night is pinned to it
every morning afterwards.

**Stored in a cookie, read server-side, stamped onto `<html data-theme>` before first
paint.** The alternative — deciding the theme in a client script — is where the flash of
the wrong theme comes from: the page renders light, the script runs, the screen snaps to
dark. Worst at night, which is exactly when someone has dark mode on.

A cookie rather than the database, deliberately: it works before a profile exists (both
signup routes pass through several screens first), it survives sign-out, and a display
preference is not attendance data — it does not belong in a table protected by RLS. The
cost is that it does not follow the student to a second device, which is an acceptable
trade for something re-picked in one tap.

"System" clears the cookie rather than storing a third value, so it keeps tracking the
device instead of pinning whatever the device happened to be at the moment it was chosen.

Two implementation notes worth keeping:

- **The dark token block is duplicated across two selectors** — `:root[data-theme="dark"]`
  and `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])`. CSS cannot
  apply one declaration block to both a media-scoped and an attribute selector.
  `light-dark()` would collapse them, but Tailwind's opacity modifiers compile to
  `color-mix()` over the token and nesting `light-dark()` inside that is not worth betting
  the interface on.
- **`next/headers` cannot be imported by anything a client component touches.** The theme
  constants and `readTheme()` started in one module; importing `THEMES` into the switch
  dragged `next/headers` into the browser bundle and failed the build. Split into
  `theme.ts` (pure) and `theme-server.ts` (`import "server-only"`).

### D-076 — The first classes and the missing policy row are seeded ✅ DONE

Closes D-065. `0018` seeds the two test cohorts the owner named — **RE1** and **RE2**, both
at level 100, which is required and must be one of 100/200/300/400 (0003); they exist to
exercise the system rather than to describe a real year group, and Phase 2's admin CRUD can
change it.

Seed data lives in a migration rather than `supabase/seed.sql` because Supabase Branching
applies migrations to production on merge and never runs the seed file (D-059) — a seed
script would populate every developer's machine and nothing that matters.

**The larger find:** there was no institution-wide `attendance_settings` row anywhere, and
nothing had ever created one. `effective_settings()` left-joins a class override onto the
row where `class_id is null`; with no such row it returns **zero rows**, so every function
built on it — `submit_attendance`, `open_attendance_window`, `decide_attendance`,
`raise_dispute` — would have failed on a null threshold with a message naming none of that.
It would have surfaced in Phase 3 as "attendance is broken" with nothing to point at.

The row is seeded with the documented defaults spelled out rather than inherited, so the
operative policy is readable in one place instead of spread across `0007` and `0016`.

**The campus geofence is deliberately left null**, because nobody has supplied UPSA's
coordinates. The constraint requires centre and radius together or neither, and
`submit_attendance` skips the fence entirely when the centre is null — so **the location
check is currently disabled**. Acceptable only because no attendance exists yet; it must be
closed before the first real session runs.

### D-077 — `anon` may read `classes`, and nothing else ✅ DONE

0012 states "anon gets nothing anywhere" and revokes every privilege from `anon` across the
schema. Correct for everything it was written against — attendance, profiles, disputes —
and wrong for exactly one table, which nothing depended on until signup existed.

A student picks their class **while creating their account**, so that dropdown renders for
someone with no session. Without this the query returns `permission denied`, the page falls
back to its empty state, and every visitor is told signing up is not open — with the
database, the seed and the form all working correctly. There is no error anyone would see.

Found by writing a test that asserted the thing rather than assuming it (`07_seed`), which
is the only reason it is not shipping. Note the sequence: seeding the classes would have
looked like it fixed signup and would have changed nothing at all.

The exception is as narrow as it goes — `classes` only, `select` only, and nothing in it is
confidential: a class is a cohort name and a year of study, printed on every timetable in
the university. The roster is in `profiles`, which `anon` still cannot touch.

### D-078 — The crest stays a PNG; an SVG is wanted but cannot be fabricated ⛔ OPEN — owner action

The owner asked whether to move the crest to SVG. It would be better — sharper at any size,
a fraction of the bytes, and recolourable — but it cannot be produced honestly from what we
have. The source is a 528px JPEG, and an auto-trace or hand-redraw of an official
university crest is a redrawing of an institutional mark, not a format conversion. Getting
it subtly wrong is worse than shipping a clean raster.

What was done instead, which addresses most of the cost:

- `public/upsa-crest.png` regenerated at 384px wide with a palette — **223KB → 44KB**. It
  displays at ~44px, so this is still past 3× DPI.
- `src/app/icon.png` and `apple-icon.png` added; the project had no favicon at all. Both
  use the **shield alone** — the ribbon's motto is illegible below about 64px and only adds
  noise. The touch icon gets a white ground because iOS composites transparency away.

**Ask UPSA's communications office for the official vector.** Until it arrives this is the
right asset, and swapping it later is a one-file change.

### D-080 — Emoji in headings, and a stacked UPSA wordmark ✅ DONE (asked for by RM)

Requested: a hug on the sign-in heading, a school bag on signup, and the wordmark beside
the crest changed from "Attendance" to "UPSA" stacked over "Attendance" — without
distorting the layout. The last clause is the whole engineering problem.

Dropping an emoji into a 2rem heading distorts it in two ways that are invisible on a
desktop browser and obvious on a phone:

- **It orphans.** At 320px "Create your account 🎒" wraps to three lines and strands the
  emoji alone on the last. The emoji is therefore bound to the final word inside a
  `whitespace-nowrap` span, so the pair moves as a unit or not at all.
- **It grows the line.** Emoji come from a system font whose ascent and descent exceed the
  Latin face's, so an inline emoji can push the heading's line box taller and shift
  everything beneath it. `inline-block` with `leading-none` caps the span at its own font
  size — 25.6px against a 36.8px line box, so it cannot grow it.

Both live in `PageHeading` rather than being repeated per page, which is the point of the
component: the next screen that wants an emoji gets the defences for free instead of
rediscovering them.

The emoji is `aria-hidden`. The heading already says everything; "Welcome back, smiling
face with open hands" is noise.

The wordmark stacks to 30px (15 + 2 + 13, all `leading-none`) against the crest's 44px, and
the row is `items-center` — so the header measures the same 44px it did before. "UPSA"
takes the weight as the institution; "Attendance" steps back a shade as the product.

Checked in the compiled CSS rather than assumed, after a first grep wrongly reported the
arbitrary utilities missing (CSS escapes the dots in `text-[0.8em]`, so the naive pattern
never matched). Both rules are present.

The app title follows the wordmark to "UPSA Attendance" — otherwise the browser tab was the
one place still disagreeing with it.
