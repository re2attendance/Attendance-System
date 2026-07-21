-- 0009 — Audit log.
--
-- Append-only record of every attendance and dispute status change (build plan §5).
-- This table is also the admin's only window onto rep behaviour: the admin cannot
-- see attendance records, but can see that a rep approved forty submissions in
-- twelve seconds, or self-approved six times (D-015).

create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid references auth.users (id) on delete set null,
  entity     text not null,
  entity_id  uuid not null,
  action     text not null,
  before     jsonb,
  after      jsonb,
  at         timestamptz not null default now(),

  constraint audit_entity_valid check (entity in (
    'attendance_record', 'attendance_window', 'dispute',
    'role_assignment', 'session', 'holiday', 'attendance_settings'
  )),
  constraint audit_action_not_blank check (length(btrim(action)) > 0)
);

-- Append-only for real, not by convention. Rows are written exclusively by
-- SECURITY DEFINER triggers; no role may rewrite history, including the admin and
-- including a compromised application.
revoke update, delete, truncate on public.audit_log from authenticated, anon;

comment on table public.audit_log is
  'Append-only. UPDATE and DELETE are revoked rather than merely unpolicied, so a '
  'permissive policy added later still cannot make history editable.';
