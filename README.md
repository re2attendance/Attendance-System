# University Attendance System

Replaces the paper attendance sheet. The whole point is **trustworthy attendance**, so
integrity of the record is the primary requirement, not a feature.

- **Build plan / brief:** [`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md)
- **Decisions log:** [`DECISIONS.md`](DECISIONS.md) — read this before changing anything
- **Schema proposal:** [`docs/01-SCHEMA-PROPOSAL.md`](docs/01-SCHEMA-PROPOSAL.md)
- **Why GPS isn't the answer:** [`docs/02-ATTENDANCE-INTEGRITY.md`](docs/02-ATTENDANCE-INTEGRITY.md)

## Stack

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind 4 · shadcn/ui ·
Motion · React Hook Form + Zod · TanStack Query · Supabase (Postgres, Auth, RLS,
Realtime) · Vercel

## Setup

Requires Node ≥ 20.9 and pnpm 10. Docker is needed only for the local database.

```bash
pnpm install
cp .env.example .env.local   # then fill in — see the comments in that file
pnpm dev                     # http://localhost:3000
```

## Scripts

| Command                                        | Does                                   |
| ---------------------------------------------- | -------------------------------------- |
| `pnpm dev`                                     | Dev server                             |
| `pnpm build` / `pnpm start`                    | Production build / serve               |
| `pnpm lint` · `pnpm format` · `pnpm typecheck` | Code quality (all run in CI)           |
| `pnpm test`                                    | Vitest unit tests                      |
| `pnpm db:start` / `pnpm db:stop`               | Local Supabase stack (Docker)          |
| `pnpm db:push`                                 | Apply migrations to the linked project |
| `pnpm db:reset`                                | Rebuild the local DB from migrations   |
| `pnpm db:types`                                | Regenerate `src/lib/database.types.ts` |
| `pnpm db:test`                                 | pgTAP tests — these are the RLS proofs |

## Working rules

Two that matter more than the rest:

1. **Assume the client is hostile.** No privileged write goes through the client.
   Attendance submissions land via `SECURITY DEFINER` functions that set the status,
   the timestamp and the computed distance server-side. RLS is the real boundary; UI
   checks are convenience. There is deliberately no service-role key in the app.
2. **Production UI is gated on reference designs.** Scaffolding built to verify the
   backend is fine. Real screens are not started without references from the project
   owner — see BUILD-PLAN.md §2.5 and §10.

Migrations are files in `supabase/migrations/`, committed and applied via the CLI —
never applied ad hoc through a dashboard or MCP, or the repo stops describing the
database.

## History

A previous build (Phases 0–6) was abandoned and reset at commit `ab23865`. It assumed
lecturers log in, which the current specification rules out — an incompatible
permission model rather than a refactor. It is preserved on the **`archive/v1`**
branch. See `DECISIONS.md` D-026.
