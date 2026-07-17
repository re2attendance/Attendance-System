# Decisions (ADR log)

Append-only. Each entry: context, decision, consequences. Superseding an ADR means writing a new one that says so, not editing the old one.

---

## ADR-001 — Drop Prisma entirely

**Date:** 2026-07-17 · **Status:** Accepted · **Phase:** 0

### Context

The build prompt (§3) specified "Prisma for schema authoring + migrations + generated types only", with the Supabase client for all request-scoped access, and explicitly invited a proposal to drop Prisma if the split created more pain than value.

It does. RLS policies, `SECURITY DEFINER` functions, triggers and enums cannot be expressed in `schema.prisma` — all of them would end up as hand-written SQL inside Prisma migrations, while the Supabase CLI also wants to own a migration history. Two migration systems on one database is a bad time, and the failure mode is a drifted schema nobody can reproduce from scratch.

The remaining argument for Prisma was query ergonomics in the background-job layer. That isn't worth a second toolchain, a second type generator, and a permanent ESLint fence whose only job is stopping a privileged, RLS-bypassing client from leaking into a request path.

### Decision

No Prisma. Specifically:

- `supabase/migrations/` is the single source of truth — tables, indexes, RLS, functions, triggers, enums.
- `supabase gen types typescript` is the only type generator, output to `src/db/types.ts`.
- The job layer uses the service-role Supabase client (`lib/supabase/admin.ts`), `import 'server-only'`, ESLint-fenced to `jobs/*` and `app/api/cron/*`.
- No `prisma/` directory.

### Consequences

- **Good:** one migration system, one type generator, one client. The RLS-bypass surface is exactly one file instead of two. `migrate-from-scratch` in CI is meaningful because it's the only path.
- **Good:** the import boundary still exists but guards a smaller, more obvious target.
- **Cost:** the job layer writes Supabase-client queries rather than Prisma's API. Acceptable — jobs are few and mostly bulk SQL, where the ergonomics gap is smallest and raw SQL via RPC is often clearer anyway.
- **Cost:** no Prisma Studio. `supabase studio` covers it locally.

---

## ADR-002 — Local Supabase via Docker as the dev and CI database

**Date:** 2026-07-17 · **Status:** Accepted · **Phase:** 0

### Context

Migrations, pgTAP RLS tests and seeds need a Postgres that can be dropped and rebuilt from scratch on every run. The alternative was pointing development at a remote Supabase project (available via the connected MCP).

### Decision

`npx supabase start` is the development and CI database. `pnpm db:reset` re-runs every migration from scratch and seeds. CI does the same on every PR. A remote project is provisioned at deploy time (Phase 12) and documented in `docs/DEPLOY.md`.

### Consequences

- **Good:** RLS tests and reset-from-scratch run against disposable infrastructure. No cloud cost, no risk to a real project, no shared-state flakiness between contributors or CI runs.
- **Good:** the from-scratch migration path is exercised continuously, so it can't rot.
- **Cost:** Docker is a hard prerequisite. *(Resolved 2026-07-17: Docker Desktop 29.6.1 is reachable from WSL and `supabase init` succeeds. Caveat for `RUNBOOK.md` — Docker Desktop must be running on the Windows side, and when it isn't, WSL reports `docker: command not found` rather than anything about the daemon, which is a misleading first impression.)*
- **Cost:** local/remote parity must be verified explicitly at Phase 12 rather than continuously.

---

## ADR-003 — Anti-proxy ships as rotating code + device binding; geofence modelled but flag-off

**Date:** 2026-07-17 · **Status:** Accepted · **Phase:** 0

### Context

§7 of the build prompt lays out five layers. §2 defaulted to "code + device binding; geofence behind a feature flag". Geofencing is the layer with the worst cost/benefit at this stage: GPS indoors is unreliable, lecture halls are the worst case for it, and it needs real-device testing to tune a radius that won't generate noise.

### Decision

Phase 6 ships:

1. **Rotating session code** — 6 digits, 30s rotation, validated server-side against server time; current or immediately-previous code accepted.
2. **Device binding** — one fingerprint per student per session; **flag, never auto-block**, when one device submits for multiple students. Flagged submissions carry a warning badge in the rep queue.
3. **Rate limits** — per student per session, per IP.
4. **Anomaly surfacing** — same-IP mass submissions, submission before session open.

Geofence columns (`geofence_center`, `geofence_radius`, stored distance) exist in the schema from Phase 2, and the code path is written behind a feature flag that is **off**. Nothing computes distance until it's turned on.

### Consequences

- **Good:** no migration needed to enable geofencing later; the seam is already there.
- **Good:** avoids shipping a control that produces false positives against students, which is the fastest way to make reps ignore all flags.
- **Cost:** the flag-off path needs a test proving it's genuinely inert, or it's just dead code pretending to be a feature.
- **Every flag is advisory to the rep**, recorded on the record, and visible in the audit log. `docs/SECURITY.md` documents the threat model *including what these controls don't stop* — the honest answer being that a determined student with a second phone defeats all of them, and the rep's eyes are still the actual control.

---

## ADR-004 — Adopt `next-safe-action`, `nuqs`, `date-fns-tz`, `sonner`

**Date:** 2026-07-17 · **Status:** Accepted · **Phase:** 0

### Context

§3 permits these additions if justified here.

### Decision

- **`next-safe-action`** — §8 requires every action to run auth → Zod → authz → rate limit → execute → audit, in a wrapper no action can skip. This is exactly what its middleware chain does, with the typed client↔server Zod bridge as a bonus. Hand-rolling `lib/safe-action.ts` means reimplementing it and getting the type inference wrong. **This is the highest-value addition on the list** — `safe-action.ts` is one of the six files that decide whether this project is good, and the failure mode ("an action skipped audit") is silent.
- **`nuqs`** — table filters must be URL state so a rep can share or reload a filtered queue. The alternative is hand-parsing `searchParams` in every table.
- **`date-fns-tz`** — institutional-timezone display over UTC storage. Non-negotiable given §5's timestamp rules; writing tz math by hand is how DST bugs happen, and `deriveStatus` has DST tests.
- **`sonner`** — §11.6 requires a 5-second undo toast on every rep decision. shadcn's toast is deprecated in favour of it.

Deferred until there's a demonstrated need: `@tanstack/react-virtual` (Phase 8, if the register grid needs it — measure first), `exceljs` / `@react-pdf/renderer` (Phase 10, when exports are built). `zod-prisma-types` is moot under ADR-001.

### Consequences

- Four dependencies, each tied to a specific requirement in the prompt rather than to preference.
- `next-safe-action` shapes how every write is authored, so it's a hard one to back out of later. Accepted deliberately — the alternative is a bespoke wrapper doing the same job with fewer eyes on it.

---

## ADR-005 — Middleware is UX, not a security boundary

**Date:** 2026-07-17 · **Status:** Accepted · **Phase:** 0

### Context

It's tempting to treat role-scoped route protection in `middleware.ts` as access control. Next.js middleware has a history of auth-bypass CVEs, and a middleware check protects a *route*, not *data* — anything reachable by Server Action or Route Handler doesn't pass through the route it guards.

### Decision

`src/middleware.ts` does session refresh and coarse redirect-if-wrong-role only. It is a convenience so users don't land on pages that will be empty. Every piece of data it appears to protect is independently protected by RLS at the database, and every action re-checks authorization via `safe-action.ts`.

`lib/auth/permissions.ts` (`can()`) mirrors RLS so the UI can hide unavailable actions. It never replaces RLS. If `can()` and RLS disagree, RLS is correct and `can()` is a bug.

### Consequences

- Authorization logic exists in two places (RLS + `can()`) and can drift. Accepted: the drift is a UI bug (a button that 403s), never a data breach. The RLS test matrix is the source of truth for what's actually enforced.
- No route is ever the *only* thing standing between a user and someone else's academic record.

---

## ADR-006 — The repo lives on the WSL filesystem, not `/mnt/c`

**Date:** 2026-07-17 · **Status:** Accepted · **Phase:** 0

### Context

The project was started at `C:\Users\rich_\OneDrive\Desktop\Attendance`, reached from WSL as `/mnt/c/...`. Two independent problems stack there:

1. `/mnt/c` is a **9p protocol mount**, not a local filesystem (`stat -f` reports `v9fs` vs `ext2/ext3` for `~`). Every file operation crosses a protocol boundary. A Next.js dev server stats thousands of files per rebuild and `node_modules` is tens of thousands of small files, so the overhead lands on exactly the hot path.
2. The folder is **OneDrive-synced**. OneDrive would attempt to upload `node_modules` and `.next` while pnpm and Next are writing them, holding file locks mid-install.

Symptoms would be slow installs, flaky HMR, and intermittently corrupt state — the kind of failures that get misattributed to the tooling for weeks.

The decision was delegated rather than specified.

### Decision

The repo lives at `~/attendance` on the WSL ext4 filesystem. Git is initialized there. A pointer `README.md` is left at the old Desktop path explaining the move and giving the `\\wsl$\Ubuntu\home\emmanuelofori\attendance` UNC path for Windows-side access; that folder holds nothing else and is safe to delete.

The rejected alternative was staying put and excluding `node_modules`/`.next` from OneDrive sync. That fixes the sync collisions but not the 9p overhead, and it depends on a sync exclusion nobody will remember when the folder is recreated.

### Consequences

- **Good:** filesystem performance on the dev loop is no longer a variable, and it's cheap now — one command against three markdown files, versus a repo plus a `node_modules` tree later.
- **Good:** Windows-side editors still reach it over `\\wsl$`, and VS Code's WSL remote treats it as native.
- **Cost — the real one:** moving off OneDrive means **the project is no longer backed up**. Git is initialized as the replacement, but a local repo is not a backup. **A remote must be added and pushed before there's meaningful work in `~/attendance`.** Until then the work exists on exactly one disk. Tracked as a Phase 1 exit condition.
- **Cost:** the WSL distro is now a single point of failure. `wsl --unregister` or a WSL reset destroys the work; on `/mnt/c` it would have survived. This is entirely mitigated by the remote above, and not at all until then.
</content>

---

## ADR-007 — Tailwind v4, so the theme is CSS-first and there is no tailwind.config.ts

**Date:** 2026-07-17 · **Status:** Accepted · **Phase:** 1

### Context

The structure doc's tree lists `tailwind.config.ts`. `create-next-app` (Next 16.2.10) now scaffolds Tailwind v4, which moved theme configuration out of JS and into the stylesheet via `@theme`. There is no config file to write.

### Decision

Keep v4 and let `src/app/globals.css` be the whole theme. Do not reintroduce a JS config for the sake of matching the tree.

This turns out to serve §11.1 better than the original plan did. "Define tokens once in `globals.css`; never hardcode a hex anywhere else" was a rule enforced by review. Under v4 it is enforced by the compiler, because `@theme` lets a namespace be cleared before it is redefined:

- `--color-*: initial` deletes Tailwind's stock palette, so `bg-indigo-500` is a build error rather than a review comment. §11.9 names a stray indigo as an anti-tell; it is now unreachable.
- `--text-*: initial` deletes the stock type scale before ours (12/13/14/16/20/24/32) is declared. Tailwind's `text-lg` is 18px and "anything at 18px" is a named anti-tell — you can no longer type your way to it.
- `--radius-*: initial` leaves only chip/control/card (4/6/8). No pills by construction.

### Consequences

- **Good:** three design rules moved from discipline to mechanism. The ones a tired person breaks at 1am are the ones now impossible.
- **Cost:** imported shadcn components assume stock utilities. `button.tsx` needed `rounded-md` → `rounded-control` and `text-sm` → `text-base` on the way in. This is a real, recurring tax on every component added — and it is the intended tax: it forces a read of the component rather than a paste. Documented in `CLAUDE.md`.
- **Cost:** the structure doc's tree is wrong on this one file. The tree was illustrative; the conventions are what bind.

---

## ADR-008 — The focus ring is bicolor, because §11.8 and §11.1 contradict each other

**Date:** 2026-07-17 · **Status:** Accepted · **Phase:** 1

### Context

§11.8 requires "a visible 2px `--signal` focus ring on every interactive element", and lists the focus ring as one of yellow's five sanctioned uses. §11.1 states that `--signal` on white is ~1.4:1 (measured: 1.53:1).

Both cannot hold. WCAG 2.1 SC 1.4.11 requires a focus indicator to reach 3:1 against adjacent colours. A 1.53:1 yellow ring on a white card is not a focus indicator — it is a rumour. The spec's own arithmetic disproves its own instruction, and §11.8 also demands "WCAG 2.1 AA contrast — verified, not assumed", which is the clause that breaks the tie.

### Decision

The ring is bicolor: a 2px `--signal` core hemmed by a 1px `--ink` edge — the same technique Chrome and Firefox use, for the same reason.

- On light surfaces the ink edge carries the contrast (~17:1) and the yellow reads as brand.
- On dark surfaces `--ink` inverts to near-white, the two tones sit ~1.5:1 apart and the edge effectively vanishes — which is fine, because `--signal` on near-black is ~13:1 and carries it alone.

Either way the ring clears 3:1 against the surface, and it still reads as yellow. The ring is drawn with `box-shadow`, with a transparent `outline` retained so it survives Windows High Contrast / forced-colors mode, where box-shadow is dropped.

`contrast.test.ts` pins this per-surface, including an explicit test asserting that a signal-only ring *would* fail on light — so anyone "simplifying" the ring back to plain yellow gets a failing gate and an explanation.

### Consequences

- Yellow's use count is unchanged: the ring is still one use, now correctly drawn.
- **Two related palette bugs surfaced from the same audit and are fixed in `globals.css`:**
  - `--status-pending` was `#a1a1aa` → 2.56:1 on white, under the 3:1 non-text floor. It is the dot that drives the rep queue, so it was the worst one to have wrong. Now `#71717a` on light, tracking `--mute` in both modes.
  - `--status-late` desaturated from orange-500 was `#e1782d` → 2.90:1 on `--wash`. It passed on `--paper` (3.01:1) and failed on the warm page background. Now `#d16025` (orange-600, -20% sat).
- Both were found by computing the ratios rather than looking at them, which is the argument for `/dev/tokens` computing live and CI asserting.

---

## ADR-009 — A submitted-but-never-verified record becomes `absent` at close

**Date:** 2026-07-17 · **Status:** Accepted, flagged for review · **Phase:** 2

### Context

§6.5 says: "Session closed with no approved record → absent."

Read literally that covers a case the spec never names out loud: a student submits an attendance request on time, the rep never gets to it, the session auto-closes, and the student is marked **absent**. They did everything right and lost anyway, for someone else's inaction.

This is the only derivation in the system where that is true, which is why it is worth writing down rather than leaving in a branch.

### Decision

Implement it literally. `deriveStatus` returns `absent` for a submitted, undecided record once `sessionStatus === 'closed'`.

The alternatives are worse:

- **Auto-approve on close** — hands every student a guaranteed route to `present`: submit, wait, say nothing. It converts a verification system into an honour system, which is precisely what §1 says this product exists not to be.
- **Leave it `pending_verification` forever** — the attendance percentage never resolves, the eligibility report can never run, and the registrar's export has a hole in it. "Pending" is not a defensible thing to show a registrar in week 14.
- **A new `unverified` status** — would be the honest answer, but the `attendance_status` enum is specified in §5 and does not include one. Adding it is a schema change with reach into every chip, filter, report and percentage rule. Not a decision to smuggle in via a rules-engine branch.

The system's actual answers to the unfairness live elsewhere and are load-bearing: the rep queue shows an elapsed timer per request and sorts oldest-first (§6.3), the weekly rep digest surfaces pending items (§9), and the student can open a dispute (§6.6) which an instructor can resolve with an override.

### Consequences

- **Cost, and it is real:** rep inattention is charged to the student, not the rep. The rep-activity report (median verification latency, §10) is what makes this visible, and it should be watched — if reps routinely let sessions close on pending queues, this decision is producing wrong records at scale and disputes will not keep up.
- **Cost:** this is the most likely source of end-of-term disputes by volume. `docs/RUNBOOK.md` should carry a "session closed with a pending queue" entry.
- **Flagged for review:** if the reviewer wants a distinct `unverified` status, that is a legitimate call — it is a Phase 2 schema change, cheap now and expensive after Phase 8's reports and Phase 10's exports are built on the enum. Raised in the Phase 2 report.
