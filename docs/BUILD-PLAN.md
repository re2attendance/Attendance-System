# University Attendance System — Build Plan & Working Brief for Claude Code

> **How to use this document:** This is your project brief and standing instruction set. Read it fully before writing any code. Act as the **senior software engineer** on this project: challenge weak assumptions, flag risks early, propose better approaches, but **ask before implementing anything not explicitly agreed**. We build in **phases**, deploy early, and verify every phase before moving on.

---

## 1. Mission

Build a production-grade, industry-standard **attendance management system** for a university, delivered as a responsive web app. It replaces the old paper attendance sheet (which was passed around class and was trivially abused — students signed in for absent friends). The new system's entire reason to exist is **trustworthy attendance**, so integrity of the attendance record is the number-one product requirement, not an afterthought.

The system modernizes attendance with secure authentication, role-based access, GPS presence checks, a human verification workflow, and a dispute mechanism.

---

## 2. How you should operate (senior-engineer working agreement)

1. **Think in phases.** Do not attempt the whole system at once. Follow the phase plan in §9. Complete, deploy, and get sign-off on each phase before starting the next.
2. **Deploy first, build second.** Before any feature work, stand up a deployed skeleton (Vercel + Supabase) so every commit is verifiable in a live environment. Every phase ends deployed and demoable.
3. **Ask before building.** When a requirement is ambiguous, incomplete, or has multiple reasonable interpretations, stop and ask. A short list of pointed questions is always better than guessing. Batch your questions per phase.
4. **Advise with sharp, specific ideas — never generic ones.** You are expected to think about what's missing and actively propose improvements: features, safeguards, UX details, integrations, things I haven't thought of. But **every suggestion must be concrete and tailored to this system** — no filler like "you could add analytics" or "consider caching." Say exactly what, exactly where, and exactly why it makes _this_ attendance system better. **Nothing gets implemented until I approve it.** Propose → explain the trade-off → wait for my yes. Never silently add scope.
5. **🚨 STOP before any production UI. This is a hard rule.** There is a clear line between (a) throwaway/functional UI you build just to verify the backend works, and (b) the **real, production-facing UI** that ships. The moment you are about to start building actual production UI — real screens, real components, the things I and users will actually look at — you must **STOP and tell me explicitly** so I can send you the reference designs/screenshots first. Do **not** start production UI from your own imagination. Building the real interface before I've handed you references is a mistake. Backend-verification scaffolding is fine to build freely; the polished UI is gated on my references, every time.
6. **Small, reviewable commits.** Conventional commit messages, one logical change per commit, push regularly so I can review as we go.
7. **Security and data integrity are non-negotiable.** Treat every attendance write as potentially fraudulent input. Assume the client is hostile.
8. **Leave a paper trail.** Document decisions in the repo (`/docs`), keep a running `DECISIONS.md`, and keep this plan updated as scope evolves.
9. **No dead code, no TODO graveyards.** If something is deferred, log it in the backlog, don't leave it half-wired.

---

## 3. Locked tech stack

Use exactly this stack unless you raise a concrete reason to change and it's approved:

- **Framework:** Next.js (App Router), React 19, TypeScript (strict mode)
- **Styling/UI:** Tailwind CSS, shadcn/ui, Framer Motion (for motion/transitions)
- **Forms & validation:** React Hook Form + Zod (Zod schemas are the single source of truth, shared client + server)
- **Data fetching/cache:** TanStack Query
- **Backend / DB / Auth / Storage / Realtime:** Supabase (Postgres, Auth, Row-Level Security, Storage, Realtime)
- **Hosting:** Vercel (frontend), Supabase cloud (backend)

**Recommend (for approval) as you go:** a testing stack (e.g. Vitest + React Testing Library + Playwright for e2e), ESLint + Prettier, a charting library that fits the filters we need, and a schema-migration workflow via the Supabase CLI. Propose these in Phase 0 rather than assuming them.

---

## 4. Tooling, MCPs, skills & accounts — resolve in Phase 0

This project should feel **remarkable**, not average — so I want us using the best **free, safe** tooling available to hit that bar. Before production work, produce a short document listing:

- **MCPs** you want connected and why (must be **free and safe to use**). Think hard about which MCPs genuinely raise the quality of _this_ build — don't just list popular ones. At minimum evaluate:
  - **Figma MCP** — this is important. I'll be sending reference designs (see the UI gate in §2.5), and a Figma MCP lets you read those designs directly — pulling layout, spacing, colors, and component structure straight from the source instead of eyeballing a screenshot. Prioritize wiring this up so production UI matches my references faithfully.
  - **Supabase MCP** — for schema, migrations, and query work against our database.
  - Any other MCP you can justify as making the project better (e.g. tooling for testing, accessibility, component generation, or design-to-code). For each, state what it does, why it earns its place here, and confirm it's free and safe.
- **Skills** you'll rely on, and what each buys us.
- **Accounts I need to create** (Supabase, Vercel, GitHub, Figma, and any others), with exactly what each is for and what tier — keep it free-tier wherever possible.
- **Secrets/env vars** the project needs, and how they'll be managed (never commit secrets; use `.env.local` + Vercel/Supabase env settings).

Present this as recommendations for my approval — same rule as everywhere else: **propose, justify, wait for my yes.** Then wait for me to provision anything before you depend on it.

---

## 5. Domain model (entities)

Design the schema around these core entities. Propose the final relational model (tables, keys, relationships, constraints) for review before creating migrations.

- **User** — base identity from Supabase Auth. Every non-admin user is a student first.
- **Student profile** — full name, 7-digit student ID (index number), class, level. Names are **not** unique (students share names); uniqueness is enforced on **email** and **index number**.
- **Role assignment** — links a user to one or more roles: `admin`, `student`, `course_rep`, `watcher`. A course rep and a watcher are students with elevated privileges, not separate accounts.
- **Class** — a cohort of students (belongs to a level 100–400).
- **Course** — a subject taught to a class.
- **Room** — physical location; may carry a geofence (coordinates + radius) if attendance is location-bound to the room/campus.
- **Session** — a scheduled instance of a course for a class in a room, with a start/end time (the "duration of the lecture"), and an **assigned lecturer (name/reference only — lecturers do NOT log in and have no role in the app)**.
- **Attendance record** — a student's attendance for a session: status (`pending` / `approved` / `rejected`), captured location, timestamp, lateness/earliness, who verified it.
- **Dispute** — raised by a student against an attendance record's status; tracks state (`open` / `resolved`), reason, resolution, and counts against the student's per-semester limit.
- **Semester / term** — needed to scope the "max 2 disputes per semester" and analytics windows. Confirm how terms are defined.
- **Audit log** — append-only record of every attendance/dispute status change (who, what, when, before → after).

---

## 6. Roles & permissions

Enforce these both in the UI **and** at the database layer via Supabase Row-Level Security. RLS is the real boundary; UI checks are convenience only.

### Admin

- Pre-configured during development (not a student, is the developer). Do not build public admin signup.
- Can create: **classes, courses, rooms, sessions, levels (100–400)**, and assign a **lecturer** to a session.
- Can **appoint course reps** for a class (**min 1, max 3 per class**) and assign the **watcher** role.
- Dashboard shows: cards for number of classes and number of registered students, and a student list showing **full names only** — index numbers and emails are **hidden**.
- **Cannot** see attendance records. Deliberately limited functionality.

### Student

- Signs up with a university email in the format `<7-digit-index>@<university-domain>` (e.g. `xxxxxxx@upsamail.edu.gh`). Any other email format is **rejected at signup** with a message telling them to use their school-specific email.
- Onboarding collects: full name, class, 7-digit student ID. **The first 7 digits of the email must match the entered student ID**, or registration is refused. Reject if the email or index already exists.
- Can: submit attendance for their sessions (subject to the GPS check), view their own attendance history and charts, see upcoming classes on a weekly calendar (highlighted) plus a text list, and **raise disputes (max twice per semester)**.

### Course Rep

- A student appointed to the role. Must already be a registered student. On appointment, their **dashboard auto-updates** to reflect the new role.
- Can: **verify (approve/reject)** the attendance requests of students in their class, decide on upcoming attendance, view resolved and unresolved disputes, and view the class analytics (see §8).
- Can only **alter an already-decided attendance record when a dispute has been raised** against it — never arbitrarily.
- A course rep **cannot approve their own attendance** — that goes to the watcher.

### Watcher

- A student role whose sole job is to **approve/reject course reps' own attendance**.
- **Fallback rule:** if the watcher is absent, course reps may approve their own attendance. Design this so "watcher absent" is an explicit, auditable condition, not a silent bypass — decide with me how absence is determined (e.g. watcher hasn't acted within a time window, or is themselves marked absent for that session).

---

## 7. Core business rules & flows

### 7.1 Authentication & onboarding

- Email-format gate at signup (Zod-validated, enforced server-side too).
- Index-number ↔ email-prefix consistency check.
- Uniqueness on email and index.
- Role bootstrapping: everyone starts as `student`; elevated roles are granted by admin.

### 7.2 Attendance capture (integrity-critical)

- A student submits attendance for an **active session** (within its scheduled time window).
- A **GPS presence check** must confirm the student is inside the configured campus/room geofence **before** the request can be submitted.
- **⚠️ Senior-engineer flag — GPS is spoofable.** Browser geolocation can be faked, and this app exists specifically to stop attendance fraud. Do not treat a passing GPS check as proof of presence. Before building this, let's agree on layered mitigations, e.g.: validate coordinates and accuracy server-side (reject low-accuracy or impossible jumps), bind submission to the session's live time window, and treat the course rep's human approval as the real backstop. Flag GPS as a deterrent, not a guarantee, and design the verification workflow accordingly. **Raise this with me and propose the mitigation set in the relevant phase.**
- Capture lateness/earliness relative to session start.

### 7.3 Verification workflow

- Every student attendance request lands in the responsible **course rep's** queue as `pending`.
- Course rep approves or rejects (e.g. rejects if the student isn't actually seen in class).
- Course reps' **own** attendance is routed to the **watcher** (with the absence fallback in §6).
- Use Supabase **Realtime** so queues and statuses update live.

### 7.4 Disputes

- A student may dispute the status of their attendance record, **max 2 times per semester** — enforce the count in the DB, not just the UI.
- A dispute is the **only** trigger that lets a course rep alter an already-decided record.
- Track open vs resolved; every change writes to the audit log.

### 7.5 Holidays / class cancellations _(confirm — present in earlier scope, not in this doc)_

- Earlier discussions included holiday/cancellation rules (admin-wide holidays, per-class cancellations, course-rep proposals needing approval). This document doesn't mention them. **Ask me whether holidays are in scope for v1** before designing around them.

---

## 8. Dashboards & analytics

### Admin dashboard

Simple: cards (class count, registered-student count), student list (names only), management actions. No attendance data.

### Course rep dashboard

- Full attendance history for the class.
- Charts filterable by **day / week / month / year / specific course**.
- History filterable by **truant vs regular** students (define the truancy threshold with me).
- A call-to-action to record their own attendance (watcher-verified).
- View of upcoming attendance to decide on.
- Resolved and unresolved disputes.
- **Student ranking** by number of days attended and by lateness/earliness.
- Mobile: sidebar/nav menu that collapses appropriately.

### Student dashboard

- Personal attendance history and charts.
- **Upcoming classes on a weekly calendar**, highlighted, with a text list at the bottom.
- Any warnings/notices surfaced to them.

---

## 9. Phased build plan

Each phase: define scope → ask outstanding questions → get reference images (if UI) → build → test → **deploy** → demo → sign-off → next.

### Phase 0 — Foundations & deployment skeleton

- Repo, TypeScript strict, ESLint/Prettier, folder architecture, commit conventions.
- Supabase project + Vercel project wired; a trivial deployed page proving the pipeline.
- Design-system setup: Tailwind config, shadcn/ui, theme tokens for the **yellow + white minimalist** direction (see §10), Framer Motion baseline.
- Deliver the tooling/MCP/skills/accounts/env document from §4.
- Propose testing + migration workflow for approval.
- **DoD:** live URL, CI green, agreed tooling, schema proposal drafted.

### Phase 1 — Auth & onboarding

- Supabase Auth, email-format gate, index/email consistency check, uniqueness, onboarding flow, role bootstrapping, pre-configured admin.
- RLS foundations for user/profile tables.
- **DoD:** a real student can sign up, get rejected on a bad email/index, and reach an (empty) dashboard; admin can log in.

### Phase 2 — Admin domain management

- CRUD for classes, courses, rooms, levels, sessions (with lecturer assignment).
- Appoint course reps (enforce 1–3/class), assign watcher.
- Admin dashboard (cards + name-only student list).
- **DoD:** admin can fully set up a class's academic structure; role appointments reflect on the appointee's dashboard.

### Phase 3 — Attendance capture

- Session-aware attendance submission within the time window.
- GPS geofence check with the **agreed anti-spoofing mitigations** (§7.2). Server-side validation.
- Lateness/earliness capture.
- **DoD:** a student on campus can submit; off-campus or out-of-window submissions are blocked; records land as `pending`.

### Phase 4 — Verification workflow

- Course rep approve/reject queue; watcher approval of course reps; absence fallback; realtime updates; audit logging.
- **DoD:** the full pending → approved/rejected lifecycle works across all roles with a live-updating queue and an audit trail.

### Phase 5 — Disputes

- Raise dispute (enforced 2/semester), resolution flow, dispute-gated record alteration, audit entries.
- **DoD:** a student can dispute within the limit and not beyond it; only disputed records are alterable by the course rep.

### Phase 6 — Dashboards & analytics

- Charts with all required filters, truant/regular filtering, student rankings, student weekly calendar + text list, warnings surfacing.
- **DoD:** each role's dashboard matches the reference designs and the filters/rankings compute correctly on real data.

### Phase 7 — Hardening & polish

- RLS audit across every table, e2e tests of critical flows, accessibility pass (keyboard, contrast, ARIA), performance (query/index review, loading states), empty/error states, motion polish, notifications.
- **DoD:** security review passes, tests green, responsive on phones, ready for real use.

---

## 10. Design direction

- **Aesthetic:** minimalist, **blue + white** palette, clean and modern — reference the feel of Supabase's own UI. _(Amended 2026-07-21 by D-068: the reference designs supplied are blue, and the owner chose the reference over the original yellow.)_
- **Responsive-first**, with special attention to **phones** (this will be used on the go in class).
- Purposeful motion via Framer Motion — subtle, not decorative noise.
- **🚨 Hard gate (repeat of §2.5): before building any real/production screen, STOP and tell me, then wait for my reference designs.** I'll provide them as screenshots and/or Figma files — pull from Figma via the Figma MCP where possible so the build matches the source. Never invent the production UI yourself. Functional scaffolding to test the backend is exempt; the real interface is not.

---

## 11. Open questions to resolve before/early in each phase

Ask these (and any others you find) at the right phase rather than assuming:

1. **Semester/term definition** — how are terms bounded (needed for the 2-dispute limit and analytics)?
2. **Geofence source** — one campus-wide geofence, or per-room coordinates? Who sets the radius?
3. **GPS anti-spoofing** — which mitigations are we committing to for v1 (§7.2)?
4. **Watcher-absence rule** — how is "watcher absent" determined and made auditable?
5. **Truancy threshold** — what attendance rate/count makes a student "truant" for filtering?
6. **Holidays/cancellations** — in scope for v1 or deferred (§7.5)?
7. **Course ↔ session ↔ attendance granularity** — is attendance per session, and does a class have a fixed timetable of sessions, or does the admin create each session ad hoc?
8. **Notifications** — in-app only, or email too? (Affects whether we add an email provider.)
9. **Multiple roles per user** — can one student be both course rep and watcher (probably not — confirm), and can a watcher belong to the same class they watch?

---

## 12. Definition of done (every phase)

- Feature works end-to-end against the deployed environment.
- RLS enforces the intended access at the DB layer.
- Zod validation on both client and server for any input.
- Tests for the critical paths introduced this phase.
- Responsive and accessible.
- Committed with clear messages, pushed, and demoable at the live URL.
- `DECISIONS.md` and this plan updated if scope changed.

---

_Start with Phase 0. Confirm the stack, produce the tooling/accounts/MCP document, propose the schema, and ask your Phase 0 questions before writing feature code._
