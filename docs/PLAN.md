# PLAN — University Attendance Management System

Status: **awaiting approval** (Phase 0). No application code written yet.

This plan is the contract for Phases 1–12. It records the architecture, the data model, the phase breakdown, and the risks I think are most likely to bite. Where the build prompt gave a default and I took it, that is noted rather than re-argued.

---

## 1. Confirmed inputs

Answers taken from §2 of the build prompt, defaults accepted unless stated:

| # | Question | Answer |
|---|---|---|
| 1 | Tenancy | Single tenant, schema-ready for multi (`institutions` table exists and every org-scoped row carries `institution_id`; no tenant routing) |
| 2 | Instructor role | Yes — Admin, Instructor, Course Rep, Student |
| 3 | Timezone | Single institutional timezone in settings; all logic server-side in UTC |
| 4 | Registration | Invite-only; self-registration behind an admin toggle |
| 5 | Anti-proxy | Rotating code + device binding; geofence modelled but flag off (**decided**) |
| 6 | Attendance threshold | Yes, configurable per course via `attendance_rules.min_attendance_percent` |
| 7 | Scale | ~10k students, ~200 concurrent sessions |
| 8 | Compliance | GDPR-equivalent |

Three decisions taken this phase, recorded as ADRs in `DECISIONS.md`:

- **ADR-001 — Prisma dropped entirely.** `supabase/migrations/` is the only migration system; `supabase gen types typescript` is the only type generator.
- **ADR-002 — Local Supabase via Docker** is the development and CI database. A remote project is provisioned at deploy time (Phase 12).
- **ADR-003 — Anti-proxy ships as code + device binding**, geofence columns present but flag-off.

---

## 2. Architecture

### 2.1 The shape

Next.js App Router, Server Components by default. Three ways data moves, and only three:

1. **RSC reads** — `features/<x>/queries.ts`, using the cookie-bound Supabase client. RLS-enforced, carries the user's JWT.
2. **Writes** — `features/<x>/actions.ts`, Server Actions wrapped in `lib/safe-action.ts`. Same RLS-enforced client.
3. **Jobs** — `src/jobs/*.ts`, pure functions invoked by thin cron route wrappers, using the service-role client. **This is the only place RLS is bypassed**, and it is `import 'server-only'` + ESLint-fenced.

Client-side data (the rep queue, live counts) goes through TanStack Query fed by Supabase Realtime. Everything else is server-rendered.

### 2.2 The security boundary

RLS is the security boundary. Not middleware, not `can()`, not the UI.

- Middleware does **session refresh and coarse route protection only**. It is a UX convenience — a redirect, not a gate. Anything it protects is also protected at the database.
- `lib/auth/permissions.ts` (`can(user, action, scope)`) **mirrors** RLS so the UI can hide what the user can't do. It never replaces RLS. If `can()` and RLS disagree, RLS is right and `can()` is a bug.
- Every table: RLS enabled, deny-by-default, and a pgTAP test proving the matrix in `docs/SECURITY.md`. A policy without a test is not done.
- Policies call one `SECURITY DEFINER` helper, `auth_has_role(role, scope_type, scope_id)`, with `search_path` pinned to `public, pg_temp`. Policies stay simple so they stay index-friendly.

With Prisma gone (ADR-001), the RLS-bypass surface is exactly one file: `lib/supabase/admin.ts`.

### 2.3 Time

Server time is the only clock that decides anything. Client clocks are display-only and are assumed hostile.

- All timestamps `timestamptz`, stored UTC.
- `submitted_at` is written by the **database** (`default now()`), never accepted from the client. Same for `approved_at`, `code_rotated_at`.
- The live session card (§11.5) renders a countdown from a server-supplied anchor plus a measured client/server offset. It is a *prediction* of what the server will decide, and it is allowed to be wrong by a second. The server never reads it.
- `lib/time.ts` owns tz conversion and semester math. `date-fns-tz` for the institutional-timezone display layer.

### 2.4 The rules engine

`features/attendance/rules/derive-status.ts` is a pure function. No I/O, no `Date.now()`, no imports from the app. Every input is a parameter, including the clock. It is the single source of truth for status, shared by:

- the approval action (server, authoritative),
- the auto-close job (server, authoritative),
- the live session card (client, preview only).

Timing anchors on `submitted_at`, never `approved_at` — a student who submits at minute 2 and is approved at minute 12 is **present**. Approval latency is recorded separately as `verification_latency_seconds`, a rep-performance metric, not a student penalty.

Rules are **versioned and immutable once used**. A session pins the rule version in force at open time (`rules_snapshot_id`). Changing rules in week 10 cannot rewrite week 2's history. This is the single most important modelling decision in the system and everything about disputes depends on it.

---

## 3. Data model

Full detail lands in `docs/DATA_MODEL.md` + ERD in Phase 2. The shape:

**Org** — `institutions`, `faculties`, `departments`, `programs`, `academic_years`, `semesters`, `academic_calendar_events`

**People** — `profiles` (1:1 `auth.users`), `user_roles` (additive + scoped), `invitations`

**Curriculum** — `courses`, `class_sections`, `enrollments`, `course_rep_assignments`

**Scheduling** — `schedule_rules`, `attendance_sessions`, `session_makeups`

**Attendance** — `attendance_records`, `permission_reasons`, `attendance_disputes`, `attendance_rules`, `attendance_rule_snapshots`

**System** — `audit_log`, `notifications`, `notification_preferences`, `email_events`, `job_runs`, `feature_flags`

### 3.1 The load-bearing constraints

These are the ones that, if wrong, make the whole thing wrong:

- **`attendance_records`: `UNIQUE (student_id, session_id)`.** One row per student per session. This table is the ledger.
- **Absences are rows, not absence-of-rows.** `close_session()` writes an `absent` record for every enrolled, non-withdrawn student with no record. Percentages are meaningless otherwise, and this is the step most implementations forget.
- **`enrollments` is a real many-to-many table** with `status` and `dropped_at`. Attendance percentage without it is fiction.
- **Roles are rows** (`user_roles`), not an enum on the profile. A user is Student *and* Course Rep simultaneously; permissions are additive and scoped.
- **Rep grants are rows** (`course_rep_assignments`) with `starts_at`/`ends_at`/`revoked_at`, so "who was rep when this was approved?" has an answer at the end of term.
- **Conflict of interest is a DB constraint**, not a UI check: a rep cannot approve their own record. Enforced in RLS *and* covered by an RLS test.
- **`audit_log` is append-only.** No UPDATE or DELETE grant to any role, including service role, enforced by a trigger that raises.
- **`rejected` ≠ `absent`.** Rejection means "claimed present, wasn't". Both may count against attendance; they must remain distinguishable forever.

### 3.2 Performance

- Index every FK. Composites for the real queries: `(class_section_id, date)`, `(student_id, status)`, `(session_id, status)`. Partial indexes on the pending statuses — that's the rep queue's hot path.
- Attendance percentages come from a summary table maintained on write, **not** `COUNT(*)` across a term on every dashboard load. Cancelled and excused sessions are excluded from denominators.
- `updated_at` triggers everywhere.

---

## 4. Phase breakdown

Every phase ends with the gate (`pnpm typecheck && pnpm lint && pnpm test && pnpm build`), migrations applying cleanly from scratch, RLS tests green, and a report in the §16 format. I stop after each phase and wait.

| # | Phase | Ships | Gate additions |
|---|---|---|---|
| 0 | **Plan** | This doc, `CLAUDE.md`, `DECISIONS.md` | Your approval |
| 1 | **Foundation** | Next + TS strict + Tailwind + shadcn + CI; design tokens wired; `/dev/tokens` reference page | Builds and deploys empty; indigo dead; light/dark verified |
| 2 | **Data model** | Full schema, migrations, RLS, pgTAP tests, ERD, seeds | Migrate-from-scratch; RLS matrix green |
| 3 | **Auth** | Signup/login/verify/reset, `@supabase/ssr`, middleware, invite flow | Role-scoped route protection E2E |
| 4 | **Academic core** | Courses, sections, enrollments, semesters, calendar, CSV import (dry-run + row errors), rep assignment | CSV import rejects cleanly with per-row report |
| 5 | **Sessions** | Schedule rules → generated sessions, open/close/cancel, auto-close cron writing absences, session codes | Auto-close job idempotent under double-fire |
| 6 | **Attendance** | Report Present, rules engine, rep verify queue (realtime, bulk, race-safe), anti-proxy | Concurrent-approval race test; `deriveStatus` exhaustive |
| 7 | **Permissions** | Permission requests, attachments, review, disputes | Magic-byte validation; signed-URL TTL |
| 8 | **Dashboards** | Four dashboards, charts, server-side tables, low-attendance detection | No N+1 on the register grid |
| 9 | **Notifications** | React Email, queued sending, preferences, webhooks, digests | Resend outage does not fail an approval |
| 10 | **Reports** | CSV/Excel/PDF, async job path, export audit | Every export writes an audit row |
| 11 | **Hardening** | Rate limits, headers/CSP, a11y pass, E2E suite, Sentry, rep-queue load sanity | axe clean on every route |
| 12 | **Docs & release** | All docs, runbook, deploy guide, remote Supabase project | From-scratch install verified |

### 4.1 Build order within the phases

The structure doc names six files that decide whether this project is good, and an order: **1 → 2 → 3 → 5 → 6 → 4**. I'm following it, which means the phase table above is the *delivery* order but within Phases 2–6 the priority is:

1. `features/attendance/rules/derive-status.ts` — pure, snapshot-driven, `submitted_at`-anchored
2. `supabase/migrations/0011_rls_policies.sql` — the actual security boundary
3. `lib/safe-action.ts` — auth → zod → authz → ratelimit → run → audit, in one place nobody can skip
4. `app/(app)/rep/sessions/[sessionId]/verify/page.tsx` — used 200 times an hour by a human
5. `app/(app)/student/today/page.tsx` — 2 taps on bad signal, or nobody uses the system
6. `jobs/close-sessions.ts` — no absences exist until this runs; must be idempotent

The rules engine gets written and exhaustively tested **before** any table depends on its output.

---

## 5. Design direction

Committed as given in §11, not reinterpreted. The parts I'll be held to:

- Tokens defined once in `globals.css` + Tailwind theme. **No hex anywhere else.** A `/dev/tokens` page in Phase 1 renders every token, status chip and control state, and becomes the reference the rest of the build derives from.
- **Yellow is never text on a light surface** (`#FACC15` on white is ~1.4:1) and **never a status colour**. Five uses total: primary button fill, active-nav bar, focus ring, live-session hairline, session-code ring. A sixth use means deleting one.
- Statuses are quiet chips — colour lives only in the 6px dot, desaturated ~20%.
- Phone-first at 360×640. Tables become cards below `md`; never horizontal-scroll a data table on a phone. 44×44 minimum hit target. Primary actions in the thumb zone.
- Inter for UI at 14px default; JetBrains Mono with tabular figures for every number, code, matric and timestamp. Nothing on a dashboard is 18px.
- Cards: 1px `--line`, radius 8, **no shadow**. Shadows only on things that float.
- Motion budget 120–180ms, opacity and 4px transforms. The session hairline and the code ring are the only orchestrated motion in the product, and both degrade to information (not decoration) under `prefers-reduced-motion`.

The signature element — the live session card with the yellow hairline filling as the present-window elapses — is the rules engine made visible. It ships in Phase 6 and it is the thing to get right.

---

## 6. Risks, ranked by how much they'd hurt

**1. Docker is not installed in this WSL instance.** `npx supabase start` needs it, so Phases 2+ are blocked until it's there. Phase 1 is unaffected. Needs Docker Desktop with WSL2 integration enabled, or Docker Engine installed directly in WSL. **This is the one thing I need from you before Phase 2.**

**2. ~~OneDrive-synced folder on `/mnt/c`~~ → RESOLVED (ADR-006).** Repo moved to `~/attendance` on the WSL filesystem. **Replaced by a new risk: the work is no longer backed up.** OneDrive was doing that, badly; nothing is doing it now. Git is initialized locally, but a local repo on a single WSL disk is not a backup — `wsl --unregister` ends the project. **Adding a git remote and pushing is a Phase 1 exit condition**, not a nice-to-have.

**3. The auto-close job is load-bearing and easy to get wrong.** No absences exist until it runs. If it double-fires it must not double-write; if it misses a run, records must still be correct when it next runs. `job_runs` gives idempotency by run key, and the absence write is an idempotent upsert against the unique constraint. This gets a dedicated integration test that fires it twice concurrently.

**4. Rule versioning is easy to get subtly wrong.** If a session doesn't pin its snapshot at open time, or if the snapshot is read by reference rather than copied, an admin editing rules in week 10 silently rewrites week 2. Disputes then become unwinnable. The snapshot is copied, immutable, and referenced by every record.

**5. Realtime is not a guarantee.** The rep queue must survive a dropped connection — hence the stale-data banner and refetch-on-reconnect. A rep who can't see pending requests is a rep who marks the whole hall absent.

**6. The offline queue on the student side.** §11.6 calls it the #1 future complaint if skipped. It's also the easiest place to create duplicate submissions. Idempotency key per (student, session), and the unique constraint is the backstop.

**7. Scale sanity.** 300 students × 40 sessions is a 12,000-cell register grid. Server-side pagination and virtualization, not a client-side sort of the whole term.

---

## 7. Explicitly out of scope

Biometrics/facial recognition, NFC/RFID, native mobile apps, LMS/SIS integration (documented seam only), grade management, billing. If you want one, it becomes a phase — I won't smuggle it in.

---

## 8. Phase 0 exit

1. ~~Approval of this plan~~ — **approved 2026-07-17.**
2. ~~Decision on the OneDrive/`/mnt/c` location~~ — **delegated and decided: ADR-006, repo moved to `~/attendance`.**
3. **Docker** — still outstanding (risk 1). Not needed for Phase 1; **required before Phase 2 starts.**

Phase 1 exit conditions, on top of the gate and the §14 acceptance criteria:

- A git remote exists and the repo is pushed (risk 2). Until this is true the project lives on one disk.
- Docker is installed and `npx supabase start` comes up clean, so Phase 2 isn't blocked on it.
</content>
