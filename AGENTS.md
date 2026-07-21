<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Attendance System — working rules

Read `DECISIONS.md` before changing anything. It is the authority on _why_ things are
the way they are; 30+ decisions are recorded there with reasoning. `docs/BUILD-PLAN.md`
is the original brief.

## Two rules that override convenience

**1. Assume the client is hostile.** This system exists because students faked
attendance on a paper sheet. Every attendance write is potentially fraudulent input.

- The client never INSERTs or UPDATEs `attendance_records`. RLS denies it outright.
- Submissions go through `SECURITY DEFINER` functions that set status, timestamp and
  computed distance server-side. The client sends coordinates; it never sends a verdict.
- Never read the client's clock. `now()` in Postgres, always.
- There is no service-role key in this app, by design. Needing one means the design has
  gone wrong somewhere — stop and reconsider rather than adding it.
- RLS is the real security boundary. UI permission checks are convenience only.

**2. Production UI is gated.** Scaffolding built to verify the backend is fine and can
be written freely. Real screens — anything a student, rep or admin will actually look
at — are **not started without reference designs from the project owner**. Stop and ask.
See BUILD-PLAN.md §2.5 and §10.

## Conventions

- Migrations are numbered files in `supabase/migrations/`, committed, applied with
  `pnpm db:push`. Never apply DDL through the dashboard or an MCP tool — the repo must
  keep describing the database.
- Prefer a database constraint over application logic wherever the rule can be expressed
  declaratively. A `CHECK` or unique index cannot be forgotten by a future code path,
  and cannot race. Several business rules here are constraints on purpose (email prefix
  must equal index number; max 3 reps per class via unique slot; no overlapping sessions
  for one class).
- Zod schemas are shared client and server, and mirror the DB constraints. The
  constraint is what makes the rule true; Zod exists for the error message.
- Conventional commits, one logical change each.
- No dead code, no TODO graveyards. Defer to the backlog or don't write it.

## Gotchas specific to this project

- **RLS recursion.** Role lookups go through a JWT claim (custom access token hook), not
  a table query. A policy on `profiles` that queries `role_assignments` whose policy
  queries `profiles` will error with infinite recursion, and the tempting fix —
  disabling RLS on one of them — is how these systems leak.
- **Attendance denominators.** Cancelled and holiday sessions must be excluded. Rates
  are over _held_ sessions only, or a holiday week silently drops everyone's percentage.
  Since 0016 the denominator is narrower still: **held _and_ finalised**. A held session
  that no rep has finished yet has no `absent` rows, so counting it treats every
  non-submitter as if they were never enrolled. `sessions.attendance_finalised_at` is
  the flag to filter on (D-055, D-056).
- **GPS is a deterrent, not proof.** Browser geolocation is trivially spoofed. Never
  treat a passing geofence check as evidence of presence. See
  `docs/02-ATTENDANCE-INTEGRITY.md`.
