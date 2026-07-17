-- 0014_grants
--
-- The OTHER half of the security boundary.
--
-- Postgres asks two questions before returning a row, and RLS is only the
-- second one:
--
--   1. GRANT  — may this role touch this table at all?
--   2. RLS    — which of its rows may this role see?
--
-- 0011 answers (2) exhaustively and answers (1) nowhere. Without this file the
-- tables carry only REFERENCES/TRIGGER/TRUNCATE for anon and authenticated —
-- no SELECT, no INSERT — so every logged-in user is locked out of everything
-- and the policies never get consulted. Verified, not assumed: the first pgTAP
-- run failed with "permission denied for table attendance_records" rather than
-- returning zero rows, which is what surfaced this.
--
-- The two layers compose, and the composition is the point: a broad GRANT to
-- `authenticated` is safe precisely because RLS is enabled and FORCED on every
-- table with deny-by-default. A table with a grant and no policy returns
-- nothing. So the grant says "you may ask", and the policy says "here is what
-- you may have".

-- ─────────────────────────────────────────────────────────────────────────────
-- anon — nothing. §8: "anon reads nothing."
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Not "anon has grants and no policies", which would also return zero rows.
-- Explicitly revoked, so anon is refused at layer 1 and never reaches the
-- policies at all. Two independent reasons a logged-out visitor sees nothing,
-- and the outer one cannot be undone by a stray permissive policy written at
-- 2am in Phase 8.
--
-- Nothing in this product is public. The login page queries no table; auth is
-- Supabase Auth's own schema, which this does not touch.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- authenticated — may ask; RLS decides what they get.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- DELETE is deliberately not granted anywhere. Nothing in this product deletes:
-- academic records are soft-deleted for GDPR (docs/PRIVACY.md), the audit log
-- is append-only, and lookups are retired rather than removed. Withholding it
-- at the grant layer means a future DELETE policy written by mistake still
-- cannot delete anything — the two layers have to agree, and this one says no.

grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter default privileges in schema public
  grant select, insert, update on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- service_role — the jobs' role. Bypasses RLS entirely.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- This role is why lib/supabase/admin.ts is `import 'server-only'` and
-- ESLint-fenced to jobs/* and app/api/cron/* (ADR-001). Its key never reaches a
-- browser. Everything here is what close-sessions, generate-sessions, the
-- notification queue and the export builder need.
--
-- Note that service_role's power stops at the triggers: audit_log and
-- attendance_rule_snapshots reject UPDATE/DELETE for everyone, service_role
-- included, because a trigger is not RLS and does not care who you are (0010).

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Tighten the tables that should never be written with a user JWT
-- ─────────────────────────────────────────────────────────────────────────────
--
-- These have no INSERT/UPDATE policy in 0011, so RLS already refuses. Revoking
-- the grant as well is defence in depth against exactly one realistic failure:
-- someone adds a permissive policy later without realising what the table is.
-- Belt and braces on the tables where being wrong is unrecoverable.

-- The only door is log_audit() (SECURITY DEFINER, stamps actor_id itself).
revoke insert, update on public.audit_log from authenticated;

-- Derived from records by trigger. A percentage nobody can write by hand is a
-- percentage nobody can quietly correct before an eligibility report runs.
revoke insert, update on public.attendance_summaries from authenticated;

-- Written by the webhook handler and read by admin only.
revoke insert, update on public.email_events from authenticated;

-- Cron bookkeeping. If a user JWT can write job_runs, it can claim a run key
-- and make an idempotent job skip its work.
revoke insert, update on public.job_runs from authenticated;

-- A snapshot is written once when a session opens and never touched again.
-- 0010's trigger makes UPDATE impossible for everyone; this makes it
-- unreachable for a user JWT before the trigger is even consulted.
revoke update on public.attendance_rule_snapshots from authenticated;
