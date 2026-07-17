# CLAUDE.md — University Attendance Management System

Read this before touching anything. It is kept current as the build progresses; if it contradicts the code, the code is wrong or this file is stale — fix whichever is actually out of date, don't route around it.

---

## What this is

Request-based attendance. Students submit an attendance request during a live session; a Course Rep physically verifies and approves or rejects. Students may instead request permission to miss. Final status is **derived** from configurable, versioned timing rules — never set directly.

The system has to survive reality: bad phones, reps who forget to close sessions, students who ask a friend to mark them present, disputes at the end of term, and a registrar who needs a defensible export.

---

## Stack (decided — do not relitigate)

| Concern | Choice |
|---|---|
| Framework | Next.js (latest, App Router), Server Components by default |
| Language | TypeScript, `strict: true` + `noUncheckedIndexedAccess` |
| Styling | Tailwind CSS + shadcn/ui (components live here and are ours to edit) |
| DB | Supabase Postgres — `supabase/migrations/` is the **single source of truth** |
| Types | `supabase gen types typescript` → `src/db/types.ts`. **No Prisma** (ADR-001) |
| Auth | Supabase Auth via `@supabase/ssr`, cookie sessions, middleware refresh |
| Storage | Supabase Storage, private buckets, signed URLs only |
| Realtime | Supabase Realtime (rep queue, live counts) |
| Forms | React Hook Form + Zod, one schema per feature, shared client↔server |
| Actions | `next-safe-action` (ADR-004) |
| Tables | TanStack Table, server-side pagination/sort/filter |
| Client data | TanStack Query |
| URL state | `nuqs` |
| Email | React Email + Resend |
| Testing | Vitest (unit/integration), Playwright (E2E), pgTAP (RLS) |
| Jobs | Vercel Cron + `job_runs` table for idempotency |
| Errors | Sentry + structured JSON logs with request IDs |
| Rate limiting | Upstash Redis (`@upstash/ratelimit`) |
| Deploy | Vercel |

---

## Never do these

1. **Never write to the DB from the client.** Never expose the service role key to the browser.
2. **Never bypass RLS in a request path.** `lib/supabase/admin.ts` is service-role, `import 'server-only'`, and importable **only** from `src/jobs/*` and `app/api/cron/*`. ESLint enforces this. If you need admin access in a page or action, you have designed it wrong.
3. **Never trust the client for anything that decides a status** — `status`, `submitted_at`, `student_id`, `role`, session codes, timestamps. Server time is authoritative for every timing decision. `submitted_at` is a DB default, not a payload field.
4. **Never set a status directly.** Status comes from `deriveStatus()`. If you're writing `status: 'present'` outside the rules engine or a migration default, stop.
5. **Never mutate a used rule version.** Rules are versioned and immutable once a session pins them. Changing rules in week 10 must not rewrite week 2.
6. **Never `any`.** No `@ts-expect-error` without a comment saying why. No `eslint-disable` without justification. Never disable a rule or a test to make the gate pass.
7. **Never ship mock/stub data paths in production code.** If it isn't built, it isn't wired to the UI.
8. **Never hardcode a hex.** Tokens live in `globals.css` + the Tailwind theme. Nowhere else.
9. **Never skip the confirmation dialog or the audit entry on a destructive action.** Both, every time.
10. **Never commit secrets.** `.env.example` only, every var documented.
11. **Never log PII.**
12. **Never hand-edit generated files** (`src/db/types.ts`).

---

## Commands

```bash
pnpm dev              # next dev
pnpm build            # next build
pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint
pnpm test             # vitest run
pnpm test:watch       # vitest
pnpm e2e              # playwright test
pnpm gate             # typecheck && lint && test && build  ← must pass before a phase is done

pnpm db:start         # npx supabase start   (needs Docker)
pnpm db:stop          # npx supabase stop
pnpm db:reset         # drop, re-run every migration from scratch, seed
pnpm db:seed          # scripts/seed.ts
pnpm db:types         # supabase gen types typescript --local > src/db/types.ts
pnpm db:test          # pgTAP RLS suite
pnpm db:diff -- NAME  # scaffold a new timestamped migration

pnpm email:dev        # React Email preview
```

`pnpm dev` must work after `pnpm db:reset && pnpm db:seed`. If it doesn't, that's a bug.

---

## The gate

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Plus: migrations apply cleanly from scratch, RLS tests pass, and the phase's acceptance criteria are demonstrably met. A phase is not complete with a failing gate. Fixing the gate by weakening the check is not fixing the gate.

---

## Folder map

```
supabase/migrations/   SOURCE OF TRUTH — tables, indexes, RLS, functions, triggers. Forward-only.
supabase/tests/        pgTAP. A policy without a test isn't done.
emails/                React Email templates, previewable
e2e/                   Playwright
scripts/               seed, reset, check-import-boundaries
src/middleware.ts      session refresh + coarse route protection ONLY — a redirect, not a gate
src/app/               thin pages: auth check + render feature components. No business logic.
src/features/<x>/      the real structure: actions | queries | schemas | components | hooks | index.ts
src/components/        ui/ (shadcn) · layout/ · data-table/ · charts/ · feedback/
src/lib/               supabase/ · auth/ · safe-action.ts · rate-limit · audit · time · env · logger
src/db/types.ts        generated. never hand-edit.
src/jobs/              pure functions; cron routes are thin wrappers
```

### Where does X go?

| X | Location |
|---|---|
| A page | `app/(app)/<role>/...` — thin. Auth check + render. No business logic. |
| A DB write | `features/<x>/actions.ts`, always via `safe-action.ts` |
| A DB read for RSC | `features/<x>/queries.ts` |
| A validation schema | `features/<x>/schemas.ts` — one schema, used by RHF *and* the action |
| A component used by 2+ features | `components/` |
| A component used by 1 feature | `features/<x>/components/` |
| Business logic | pure function in `features/<x>/`, unit-tested, no I/O |

### Import boundaries (ESLint, not vibes)

- `features/*` may not import another feature's internals — only its `index.ts`.
- `app/*` may not import `lib/supabase/admin.ts`. Ever.
- `lib/supabase/admin.ts` is importable only from `jobs/*` and `app/api/cron/*`.
- `features/attendance/rules/*` imports nothing from the app. It's a library.

### Naming

Files `kebab-case.ts`. Components `PascalCase` exports. Actions `verbNoun` (`approveAttendance`). Queries `getX` / `listX`. Schemas `xSchema` + inferred `XInput`.

### Server-first

`"use client"` only for state, effects, or event handlers. Push the directive as far down the tree as possible — `verification-row.tsx`, not `verify/page.tsx`.

---

## Security model

RLS is the security boundary. Middleware is UX. `can()` is UI convenience that **mirrors** RLS and never replaces it — if they disagree, RLS is right and `can()` is the bug.

- Every table: RLS on, deny-by-default, no exceptions.
- Policies call `auth_has_role(role, scope_type, scope_id)` — `SECURITY DEFINER`, `search_path` pinned to `public, pg_temp`.
- Every Server Action: **auth → Zod parse → authz → rate limit → execute → audit**. That sequence lives in `lib/safe-action.ts` so no action can skip a step. Don't write a raw Server Action.
- Roles are **additive and scoped rows** in `user_roles`, not an enum on the profile. A user is Student *and* Rep at once.
- A rep cannot approve their own attendance. Enforced in the DB, tested in pgTAP — not just hidden in the UI.
- `audit_log` is append-only. No UPDATE/DELETE grant to anyone, trigger-enforced.
- Route Handlers only for webhooks (signature-verified) and file/export streaming.
- Invitation tokens: hashed at rest, single-use, expiring, scoped.
- Attachments: private bucket, ≤10MB, allow-list `pdf/jpg/png/webp/heic`, **magic bytes validated server-side** (extension is not evidence), EXIF stripped, short-TTL signed URLs, purged on retention expiry.

---

## Domain rules that are easy to get wrong

- **Absences are rows.** `close_session()` writes an `absent` record for every enrolled student with no record. No rows = no absences = wrong percentages. This is the step everyone forgets. "Enrolled" is temporal (`enrolled_at <= starts_at and (dropped_at is null or dropped_at > starts_at)`), not a status check — otherwise every drop rewrites history.
- **`rejected` ≠ `absent`.** Rejected means "claimed present, wasn't". Keep them distinguishable forever, even if both count against attendance.
- **`unverified` ≠ `absent`** (ADR-010). Submitted on time, never decided. Leaves the denominator; counted separately; still decidable after close. Never charge a student for a rep's inaction.
- **Timing anchors on `submitted_at`, not `approved_at`.** Submit at minute 2, approved at minute 12 → **present**. Rep slowness is a rep metric (`verification_latency_seconds`), never a student penalty.
- **Cancelled sessions leave the denominator.** So do excused ones, per `permission_reasons.counts_as_excused`.
- **Sessions pin their rule snapshot at open time.** Copied, not referenced.
- **Concurrent approval is expected.** Conditional update (`WHERE status = 'pending_verification'`); zero rows affected means "already decided" → a friendly toast, not a 500.
- **`UNIQUE (student_id, session_id)`** on `attendance_records` is the backstop for every duplicate-submission path, including the offline queue.
- Cron jobs are idempotent via `job_runs` run keys. Assume every job double-fires.

---

## Design system

Tokens in `globals.css`. **No hex anywhere else.** `/dev/tokens` renders every token, chip and control state and computes contrast live — it's the reference; derive from it, don't improvise.

**Tailwind v4 — the theme is CSS-first; there is no `tailwind.config.ts`** (ADR-007). `@theme` in `globals.css` is the whole theme, and three namespaces are cleared before being redefined:

- `--color-*: initial` → the stock palette does not exist.
- `--text-*: initial` → the scale is exactly **`text-12` `text-13` `text-14` `text-16` `text-20` `text-24` `text-32`**, named by pixel size. Default UI text is `text-14`. 18px is not in the scale (§11.9: nothing at 18px).
- `--radius-*: initial` → only `rounded-chip` (4), `rounded-control` (6), `rounded-card` (8). `rounded-full` for avatars and dots only.

**A stock utility does NOT fail the build** (ADR-011). Tailwind v4 silently emits no CSS for an unknown class — `bg-indigo-500` produces nothing, no warning, clean build. It cannot *render*, but nothing *tells you*. Type is the trap: an unknown `text-sm` inherits body's 14px and looks perfect, while `text-xs` on a caption silently renders 14px instead of 12px.

**What actually catches it: `src/lib/tokens.test.ts`**, which scans `src/app`, `src/components` and `src/features` for stock type/palette/radius classes and fails the gate with file and line. It runs in `pnpm gate`.

**Adding a shadcn component:** it assumes stock utilities. Expect to fix `rounded-md` → `rounded-control`, `text-sm` → `text-14`, and to strip `shadow-*` (shadows only on floating things) and its focus ring (we have a global one). Read the component on the way in; don't paste it. The gate will catch the classes, not the shadows. `src/components/ui/button.tsx` is the worked example and its header lists every change and why.

**`--primary` and `--ring` resolve to our yellow** in the shadcn semantic layer, so an imported component cannot bring a new accent with it.

```
--paper  #FFFFFF   surfaces, cards
--wash   #FAFAF9   page background
--ink    #18181B   primary text, dark surfaces, text on yellow
--mute   #71717A   secondary text, labels, timestamps
--line   #E7E5E4   hairline borders — the primary structural device
--signal #FACC15   the yellow
--deep   #854D0E   yellow that is legible as text/links on white
```

Dark: `--wash #0A0A0A`, `--paper #141414`, `--line #262626`, `--ink #FAFAF9`, `--mute #A1A1AA`, `--signal` unchanged.

**Yellow rules (hard constraints):**
- `#FACC15` on white is 1.53:1 (measured). **Yellow is never text on a light surface.** Use `--deep`.
- Yellow appears exactly five places: primary button fill (`--ink` text), active-nav 2px left bar, focus ring, live-session progress hairline, session-code ring. A sixth use means deleting one.
- **Yellow is never a status colour.** It's the brand; the brand can't also mean "late".
- No yellow backgrounds, cards, gradients, or yellow-tinted greys.
- **The focus ring is bicolor** — a `--signal` core with a 1px `--ink` edge (ADR-008). Yellow alone is 1.53:1 on white and would not be a visible focus indicator; the ink edge is what makes it real on light surfaces. Don't "simplify" it back to plain yellow — `contrast.test.ts` will fail and tell you why.

**Contrast is verified, not assumed.** `lib/contrast.ts` is the verifier; `/dev/tokens` computes every pairing live and `contrast.test.ts` asserts them in the gate. Changing a token runs this audit automatically. It has already caught two real bugs (`--status-pending` at 2.56:1, `--status-late` at 2.90:1 on `--wash`), so if you're tempted to adjust a colour by eye, don't — change it and let the gate answer. `lib/tokens.ts` mirrors the palette for tooling and `tokens.test.ts` fails if it drifts from `globals.css`.

**Type:** Inter for UI (14px default, 13px cells/labels, 24px page titles max). JetBrains Mono, tabular figures, for every number, code, matric, timestamp, percentage. Scale `12/13/14/16/20/24/32`. **Nothing on a dashboard is 18px.** `font-variant-numeric: tabular-nums` on anything live — digits must not jitter.

**Status chips:** dot + label, 12px, `--mute` text, transparent bg, 1px `--line` border. Colour only in the 6px dot, desaturated ~20% from Tailwind defaults. `present` emerald · `late` orange · `absent` rose · `permission_granted` blue · `excused` blue outline · `pending_verification` neutral + slow pulse · `unverified` neutral outline, static · `rejected` rose outline · `cancelled` mute, struck through.

**`unverified` is not `absent`** (ADR-010). The student submitted on time and nobody ever decided. It leaves the percentage denominator, is counted separately on the summary, and stays decidable after close. **Silence from the student is absence; silence from the rep is not.** The chip is static where pending pulses, because a pulse promises someone is still coming.

**Layout:** Phone-first at 360×640 — a layout that only works from `md:` up is a failed layout. Desktop: 232px sidebar (border, no fill), 52px topbar, 1200px content, 24px gutters. Mobile: no sidebar, 56px bottom tab bar (max 4 items), forms are **bottom sheets not centre modals**. Cards: 1px `--line`, radius 8, **no shadow** — shadows only on popover/dialog/sheet/dropdown/toast. Radius 6 controls / 8 cards / 4 chips. No pills. Tables → cards below `md`; never horizontal-scroll a table on a phone. 44px rows desktop, 56px mobile, 44×44 minimum hit target. Primary actions in the thumb zone. No hover-only affordances.

**Copy:** active voice, sentence case, consistent vocabulary end to end. Button **Report present** → toast **Reported present** → record **Present**. No "Submit", no "Success!", no exclamation marks, no emoji. Empty states instruct: *"No sessions today. Your next class is CSC 401, Thursday 10:00."* Errors say what happened and what to do: *"Session closed at 10:12. Ask your course rep to review this."*

**Quality floor** (never announce it in the UI): skeletons matched to final layout, not spinners. Empty + error states on every list. Optimistic updates with rollback. Confirm dialogs on destructive actions. Visible 2px `--signal` focus ring on every interactive element. Full keyboard nav. WCAG 2.1 AA **verified**, not assumed. `prefers-reduced-motion` honoured. Form errors tied to inputs via `aria-describedby`. Dark/light via `next-themes`, no flash. Recharts, `--signal` primary series, `--line` grid, no legend where a direct label will do.

**Motion budget:** 120–180ms, `ease-out`, opacity and 4px transforms only. The session hairline and the code ring are the only orchestrated motion in the product.

### Anti-tells — produce any of these and you've defaulted

Gradient text/buttons · glassmorphism · card drop-shadows · `rounded-full` on anything that isn't an avatar · purple/indigo creeping in from shadcn defaults · emoji in UI copy · a hero section on a dashboard · a big centred stat as the primary dashboard element · lorem ipsum · animated counters · illustrated empty states · anything at 18px.

---

## Out of scope

Biometrics/facial recognition, NFC/RFID, native mobile apps, LMS/SIS integration (documented seam only), grade management, billing. Say so; don't build it. If asked later, propose it as a phase.

---

## Working agreement

- Phase by phase. Gate at the end of each. Report, then stop and wait.
- Small reviewable diffs over giant rewrites. Read the existing file before assuming.
- Ambiguity that changes the data model or security posture → **stop and ask**. Everything else → sensible default, note it in `docs/DECISIONS.md`, move on.
- End of phase, report: what you built (5 bullets) · pasted gate output · decisions + why · what you deferred and where it's tracked · **the one thing most likely to be wrong**.
</content>
