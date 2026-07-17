-- 0009_system
--
-- audit_log, notifications, notification_preferences, email_events, job_runs,
-- feature_flags.

-- §5: "append-only, no update/delete grants to anyone".
--
-- "Anyone" includes the service role. A trigger in 0010 raises on UPDATE and
-- DELETE, because a grant can be re-granted by a future migration written by
-- someone in a hurry, and an audit log that can be edited is not an audit log —
-- it is a record of what the last person to edit it wanted you to believe.
create table public.audit_log (
  id bigint generated always as identity primary key,

  -- Nullable: the actor may be a cron job (no user) or a deleted account. An
  -- audit entry must survive its actor.
  actor_id uuid references public.profiles (id) on delete set null,
  actor_role public.app_role,

  action text not null,
  entity_type text not null,
  entity_id uuid,

  -- jsonb, not text: the register-grid diff of an 80-student bulk approve is
  -- worth querying.
  before jsonb,
  after jsonb,

  ip inet,
  user_agent text,

  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,

  event_type text not null,
  title text not null,
  body text,
  -- Where tapping it goes.
  link_path text,

  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- §9: per-user, per-event, email/in-app/off.
create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null,
  channel public.notification_channel not null default 'in_app',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, event_type)
);

-- §9: "Resend webhook → email_events for bounce/complaint handling."
-- Deliverability is invisible until you store it: a student who never got the
-- 'session opened' mail looks identical to one who ignored it.
create table public.email_events (
  id uuid primary key default gen_random_uuid(),

  -- Resend's id. Unique so a replayed webhook is a no-op rather than a
  -- duplicate — webhooks are at-least-once.
  provider_message_id text,
  event_type text not null,
  recipient extensions.citext,
  payload jsonb,

  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  unique (provider_message_id, event_type)
);

-- §5 / §12: cron idempotency. Assume every job double-fires.
--
-- close-sessions is the load-bearing one: it writes every absence in the
-- system. If it runs twice it must not double-write; if it misses a run,
-- records must still be correct when it next runs.
create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,

  -- The idempotency key — a caller-chosen string identifying THIS unit of work
  -- (e.g. 'close-sessions:2025-05-12T10:00Z'). The unique index below is what
  -- makes a double-fire lose the race instead of duplicating the work.
  run_key text not null,

  status public.job_run_status not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error text,
  -- Rows touched, sessions closed — whatever the job wants to report.
  result jsonb,

  unique (job_name, run_key),
  constraint job_runs_finished_consistent check (
    (status = 'running') = (finished_at is null)
  )
);

create table public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  description text,
  updated_at timestamptz not null default now()
);

-- ADR-003: geofence is modelled but off. Seeded here rather than in seed.sql so
-- the flag exists in every environment including production, where seeds never
-- run — a missing flag read as "off" by accident is not the same as a flag that
-- is off on purpose.
insert into public.feature_flags (key, enabled, description) values
  (
    'anti_proxy.geofence',
    false,
    'Compute and store distance from the session geofence centre. Advisory only — flags for rep judgement, never auto-rejects (§7). Off per ADR-003: GPS indoors is unreliable and needs real-device tuning before it earns a rep''s attention.'
  ),
  (
    'anti_proxy.device_binding',
    true,
    'Flag when one device submits for multiple students in a session. Advisory only — never auto-blocks.'
  ),
  (
    'auth.self_registration',
    false,
    'Allow signup without an invitation. §2 Q4: invite-only by default.'
  );
