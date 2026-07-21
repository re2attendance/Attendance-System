# Phase 0 — Tooling, MCPs, Skills, Accounts & Secrets

**Status:** proposal, awaiting approval. Nothing here is provisioned yet.
**Date:** 2026-07-21

---

## 0. Account rule (standing constraint)

Every third-party account for this project belongs to **re2attendance@yahoo.com**.
No account tied to `assetsbridge` / `assetsbridgeorg@gmail.com` is to be used.

### ⚠ Blocker discovered

The Supabase MCP currently wired into this Claude Code session is authenticated
against org **`manager@assetsbridge.org`** (project `AssetsBridge`, ref
`rhkiaiwizzewqvgbmzwv`, eu-west-3). That is the wrong account.

**Action required from you:** create the Supabase account under
`re2attendance@yahoo.com`, then reconnect the Supabase MCP to that account.
Until that happens I cannot create the project or run migrations, and I will not
touch the AssetsBridge org.

---

## 1. Where the code lives

`~/projects/attendance` (WSL filesystem), **not** the OneDrive folder.
Same reasoning as the Sendy project: OneDrive tries to sync `node_modules`
(~500MB of tiny files), which is slow and corrupts installs; and `/mnt/c` file
access from WSL makes hot reload take 15–30s instead of ~1s.

---

## 2. MCP servers

Rule applied: must be **free** and must earn its place _on this specific build_.

| MCP                                   | Verdict                                      | What it buys **this** project                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Supabase**                          | ✅ Adopt (already installed, wrong account)  | Read the live schema, inspect RLS policies, run `get_advisors` for security lints (it catches tables with RLS disabled and policies with recursive lookups — exactly the failure mode that would silently expose attendance data), read Postgres logs when an RPC rejects a submission.                                                                                                                                                                                                                                                      |
| **Chrome DevTools** or **Playwright** | ✅ Adopt — **highest-value one on the list** | These can **override browser geolocation**. That means I can test the geofence from this machine — submit as a student "inside" the lecture hall, then "500m away", then with degraded GPS accuracy — without either of us walking to campus. Phase 3 is close to untestable without it. Also gives real screenshots at phone widths for the responsive work. Both are free (Google / Microsoft). Pick one; I lean Chrome DevTools MCP for the sensor-override + performance trace, Playwright MCP if we also want it driving the e2e suite. |
| **shadcn**                            | ✅ Adopt                                     | Official, free. Pulls components from the registry with their real source rather than me re-typing them from memory, and keeps every component on the same version. Small win, near-zero cost.                                                                                                                                                                                                                                                                                                                                               |
| **Figma**                             | ⚠️ **Challenge — see §2.1**                  |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Context7** (docs lookup)            | ➖ Skip for now                              | Marginal. Supabase/Next docs churn, but the Supabase MCP already answers the questions that actually bite us (schema + advisors). Revisit if I start getting API details wrong.                                                                                                                                                                                                                                                                                                                                                              |

### 2.1 Figma MCP — I want to push back on this

The plan (§4) prioritises wiring up the Figma MCP. Two problems:

1. **I do not believe it is free.** My understanding is Figma's Dev Mode MCP server
   requires a **Dev or Full seat on a paid plan (Professional and up)** — it is not
   available on the free/Starter tier. I could not verify this in-session (the web
   lookup was declined), so treat it as _needs confirming_ — but if it holds, it
   directly conflicts with the "free and safe" constraint, and with the account rule
   (a new paid Figma seat under the yahoo account is a real monthly cost).
2. **We may not need it.** I can read PNG/JPG screenshots directly — layout, spacing,
   type scale, colour all come through fine. For a project of this size, screenshots
   plus you telling me the exact hex values and the font is very close to as good, at
   zero cost.

**Recommendation:** start with screenshots. If we hit a phase where I'm visibly
missing the design (wrong spacing rhythm, wrong component structure repeatedly),
_then_ we reconsider paying for Figma. Don't buy a seat on spec.
**This is your call — tell me which way to go.**

### 2.2 A caution on how we use the Supabase MCP

The MCP can `apply_migration` straight to the hosted database. **I propose we don't
use it that way.** Schema changes should be `.sql` files in `supabase/migrations/`,
committed to git, applied via the Supabase CLI. Otherwise the database drifts away
from the repo and your §2.8 paper-trail rule breaks — six weeks in, nobody knows why
a column exists. MCP writes are for throwaway local experiments only; MCP _reads_
(`list_tables`, `get_advisors`, `get_logs`) are used freely.

---

## 3. Skills

| Skill             | Used for                                                                                                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dataviz`         | Phase 6. The rep dashboard needs charts filterable by day/week/month/year/course plus student rankings. This skill enforces one coherent, accessible chart system instead of six charts that each look different. Directly on the critical path. |
| `security-review` | End of Phase 1 (auth), Phase 3 (attendance writes) and Phase 7. Non-negotiable given §2.7.                                                                                                                                                       |
| `/code-review`    | Per-phase, before sign-off.                                                                                                                                                                                                                      |
| `run`             | Launching the dev server and confirming a change works in the real app.                                                                                                                                                                          |
| `artifact-design` | Only if you want phase demos as shareable pages. Optional.                                                                                                                                                                                       |

---

## 4. Accounts you need to create (all under re2attendance@yahoo.com)

| Account                           | Tier         | What it's for                                        | Notes / risks                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------- | ------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GitHub**                        | Free         | Private repo, PRs, CI via GitHub Actions             | You already have a `re2attendance` GitHub account (it's the origin for the Sendy repo). Confirm it's the yahoo-linked one and I'll use it.                                                                                                                                                                                                                                                            |
| **Supabase**                      | Free         | Postgres, Auth, RLS, Storage, Realtime               | Free tier allows 2 active projects and 500MB DB — fine for us. **Watch out:** free projects **pause after ~1 week of inactivity**. If we go quiet between phases the demo URL will 500 until you unpause it. Not a blocker, just don't be alarmed. Region: pick **eu-west-3 (Paris)** or **eu-west-1 (Ireland)** — Supabase has no Africa region, and those are the lowest-latency options for Accra. |
| **Vercel**                        | Hobby (free) | Frontend hosting, preview deploys per PR             | ⚠️ **Flag:** Vercel's Hobby tier is, to my knowledge, restricted to non-commercial use. A university system in real use by real students may fall outside that. Worth checking the current terms before it matters — if it's a problem the fix is either a Pro seat or hosting elsewhere. Fine for the whole build phase regardless.                                                                  |
| **Figma**                         | Free         | Where you'll put reference designs                   | Free tier is enough for _you to design and share_; see §2.1 re: MCP access specifically.                                                                                                                                                                                                                                                                                                              |
| Email provider (Resend / similar) | Free tier    | **Only if** we decide notifications go beyond in-app | Deferred until you answer the notifications question. Don't create it yet.                                                                                                                                                                                                                                                                                                                            |

---

## 5. Recommended tooling (for approval)

Plan §3 asks me to propose these rather than assume them.

- **Testing:** **Vitest** (unit — Zod schemas, lateness maths, geofence distance),
  **pgTAP** for database tests, **Playwright** for e2e.
  The unusual pick there is **pgTAP**, and I want to argue for it: our real security
  boundary is RLS, and RLS bugs are invisible from the frontend — a broken policy
  looks like a working app until the wrong person reads the wrong row. pgTAP lets us
  write tests like _"a course rep from class A gets zero rows when selecting class B's
  attendance"_ and run them in CI. For a system whose entire purpose is trustworthy
  records, this is the highest-value test suite we can own. React Testing Library I'd
  actually **deprioritise** — component tests are the least valuable layer here.
- **Lint/format:** ESLint (flat config) + Prettier, both enforced in CI.
- **Migrations:** Supabase CLI, migration files in git, applied to a staging project
  first. Needs `supabase` CLI installed — it isn't on this machine yet.
- **CI:** GitHub Actions — typecheck, lint, unit, pgTAP against a local Supabase, then
  Vercel handles deploy previews.
- **Package manager:** pnpm 10 (already installed, matches your other project).

### Not installed on this machine yet

`supabase` CLI, `vercel` CLI, `gh` CLI. All free. I'll install them once you've
confirmed the accounts — flagging so it's not a surprise.

---

## 6. Secrets & environment variables

Never committed. `.env.local` locally (gitignored), Vercel project env for deploys.

| Var                                   | Scope              | Purpose                                                                                                                                                                                                                                         |
| ------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`            | client             | Supabase project URL                                                                                                                                                                                                                            |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`       | client             | Publishable key — safe to expose **only because RLS is correct**. This is why the pgTAP suite matters.                                                                                                                                          |
| `SUPABASE_SERVICE_ROLE_KEY`           | server only        | Bypasses RLS entirely. **Goal: never need it.** If attendance writes go through `SECURITY DEFINER` RPCs (see schema proposal), the app never holds a key that can bypass the rules. I'd like us to treat any use of this key as a design smell. |
| `NEXT_PUBLIC_UNIVERSITY_EMAIL_DOMAIN` | client             | e.g. `upsamail.edu.gh`. Config, not a secret — but also re-checked server-side.                                                                                                                                                                 |
| `DEVICE_HASH_PEPPER`                  | server only        | Secret salt for device fingerprint hashing, so the stored hashes aren't reversible/enumerable. Only needed if we adopt device binding (Phase 3 decision).                                                                                       |
| `ADMIN_BOOTSTRAP_EMAIL`               | server / migration | The pre-configured admin. Seeded by migration — there is no public admin signup.                                                                                                                                                                |

---

## 7. Definition of done for Phase 0

- [ ] Supabase MCP reconnected under the yahoo account
- [ ] Accounts created and confirmed
- [ ] This document approved (incl. the Figma decision)
- [ ] Schema proposal (`01-SCHEMA-PROPOSAL.md`) approved
- [ ] Phase 0 questions answered
- [ ] Repo initialised, pushed, deployed to Vercel with a trivial page, CI green
