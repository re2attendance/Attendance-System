-- 0008_rules
--
-- attendance_rules (versioned, immutable once used) + attendance_rule_snapshots.
--
-- This pair is the reason end-of-term disputes are winnable. §5: "versioned and
-- immutable once used"; "a session pins the rule version in force at open time,
-- so changing rules in week 10 never rewrites week 2's history".

create table public.attendance_rules (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete restrict,

  -- Most-specific-wins: class_section > course > department > global.
  scope public.rule_scope not null,
  -- Null exactly when scope = 'global'. Not an FK for the same reason as
  -- user_roles.scope_id: the target table depends on the scope.
  scope_id uuid,

  version integer not null check (version > 0),

  -- ── the fields deriveStatus reads ────────────────────────────────────────
  present_within_minutes integer not null check (present_within_minutes >= 0),
  late_within_minutes integer not null check (late_within_minutes >= 0),
  -- §6.5: explicit, never implied.
  beyond_late_window public.beyond_late_window not null default 'late',

  -- ── the fields it deliberately does NOT read ─────────────────────────────
  -- These govern the submission window, the auto-close job, and eligibility.
  -- Kept off the snapshot type so they cannot secretly change a verdict.
  --
  -- grace_period_minutes extends the SUBMISSION window past ends_at, not the
  -- present window. §6.5's derivation never mentions it, which is the tell:
  -- were it a timing input, the spec's own ladder would use it. Reading it as
  -- "extra minutes to still count as present" would silently duplicate
  -- present_within_minutes.
  grace_period_minutes integer not null default 0 check (grace_period_minutes >= 0),
  auto_close_minutes_after_end integer not null default 15 check (auto_close_minutes_after_end >= 0),
  -- §6.4: "you can't file a medical note from an ambulance."
  allow_late_submission boolean not null default true,
  late_submission_window_hours integer not null default 48 check (late_submission_window_hours >= 0),
  -- §2 Q6: configurable per course.
  min_attendance_percent numeric(5, 2) not null default 75
    check (min_attendance_percent >= 0 and min_attendance_percent <= 100),

  effective_from timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint rules_scope_id_matches_scope check (
    (scope = 'global') = (scope_id is null)
  ),
  -- The late window cannot close before the present window does, or the ladder
  -- has a rung that can never be reached.
  constraint rules_windows_ordered check (late_within_minutes >= present_within_minutes),
  unique (institution_id, scope, scope_id, version)
);

-- The pinned copy.
--
-- A COPY, not a reference — this is the whole point. If a session pointed at an
-- attendance_rules row, editing that row in week 10 would retroactively change
-- what week 2's records mean, and a student disputing a 'late' would be arguing
-- against a rule that did not exist on the day.
--
-- Nothing here is ever updated. There is no updated_at, and 0010 installs a
-- trigger that raises on UPDATE and DELETE.
create table public.attendance_rule_snapshots (
  id uuid primary key default gen_random_uuid(),

  -- Provenance only. The values below are authoritative even if this row is
  -- later deleted, hence `on delete set null`.
  source_rule_id uuid references public.attendance_rules (id) on delete set null,
  source_version integer,

  present_within_minutes integer not null check (present_within_minutes >= 0),
  late_within_minutes integer not null check (late_within_minutes >= 0),
  beyond_late_window public.beyond_late_window not null,

  grace_period_minutes integer not null default 0 check (grace_period_minutes >= 0),
  auto_close_minutes_after_end integer not null default 15 check (auto_close_minutes_after_end >= 0),
  allow_late_submission boolean not null default true,
  late_submission_window_hours integer not null default 48 check (late_submission_window_hours >= 0),
  min_attendance_percent numeric(5, 2) not null
    check (min_attendance_percent >= 0 and min_attendance_percent <= 100),

  created_at timestamptz not null default now(),

  constraint rule_snapshots_windows_ordered check (
    late_within_minutes >= present_within_minutes
  )
);

-- The FK deferred from 0006: attendance_sessions and attendance_rule_snapshots
-- reference each other's concepts, so one had to be created second.
--
-- on delete restrict: a snapshot in use cannot be deleted. A session whose
-- rules vanished cannot explain its own records.
alter table public.attendance_sessions
  add constraint attendance_sessions_rules_snapshot_id_fkey
  foreign key (rules_snapshot_id)
  references public.attendance_rule_snapshots (id)
  on delete restrict;

alter table public.attendance_records
  add constraint attendance_records_rules_snapshot_id_fkey
  foreign key (rules_snapshot_id)
  references public.attendance_rule_snapshots (id)
  on delete restrict;

-- A session cannot be open without a pinned rule version. This is the
-- constraint that makes "immutable once used" true rather than aspirational:
-- there is no path to an open session whose rules can still move.
alter table public.attendance_sessions
  add constraint sessions_open_has_rules_snapshot check (
    status in ('scheduled', 'cancelled') or rules_snapshot_id is not null
  );
