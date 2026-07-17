-- 0007_attendance
--
-- attendance_records (the ledger), permission_reasons, attendance_disputes.

-- Admin-editable lookup (§5). counts_as_excused is not cosmetic: it decides
-- whether a granted permission leaves the percentage denominator (excused) or
-- stays in it (permission_granted). It is the difference between "this absence
-- doesn't count against you" and "we know why you weren't there".
create table public.permission_reasons (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete restrict,

  code text not null,
  label text not null,
  counts_as_excused boolean not null default false,
  requires_attachment boolean not null default false,

  -- Hard-delete a reason and every historical record citing it loses its
  -- meaning. Retire instead.
  is_active boolean not null default true,
  sort_order smallint not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (institution_id, code)
);

-- THE LEDGER.
--
-- One row per (student, session) — the unique constraint below is the backstop
-- for every duplicate-submission path in the product, including the offline
-- queue that retries on reconnect (§11.6) and a double-firing close_session().
--
-- `status` is stored, not computed. It is written ONLY from deriveStatus()
-- (features/attendance/rules) — never set directly, never trusted from a
-- client. It is stored rather than derived on read because the register grid
-- is 300 students × 40 sessions and a per-cell function call is not a query
-- plan anyone wants; and because a record must be able to be OVERRIDDEN by an
-- instructor, which a pure derivation cannot express.
create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),

  student_id uuid not null references public.profiles (id) on delete restrict,
  session_id uuid not null references public.attendance_sessions (id) on delete restrict,

  -- Denormalised from the session (§5, "for query speed"). Every dashboard and
  -- export filters by section; without this, each one joins through sessions.
  -- Kept honest by a trigger in 0010 rather than by hope.
  class_section_id uuid not null references public.class_sections (id) on delete restrict,

  status public.attendance_status not null,

  -- ── the attendance-request side ──────────────────────────────────────────
  -- Server-written. §5: "Never trust client clocks — server time is
  -- authoritative for every timing decision." The default IS the enforcement;
  -- RLS in 0011 additionally forbids a client supplying it.
  submitted_at timestamptz,
  submission_source public.submission_source,

  decision public.attendance_decision,
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null,

  -- §6.3: a rep-performance metric, recorded separately and NEVER an input to
  -- status. Timing anchors on submitted_at — a student who submits at minute 2
  -- and is approved at minute 12 is present. This column is how a slow queue
  -- becomes visible as the rep's problem instead of the student's.
  verification_latency_seconds integer check (verification_latency_seconds >= 0),

  -- ── the permission-to-miss side (§6.4) ───────────────────────────────────
  permission_reason_id uuid references public.permission_reasons (id) on delete restrict,
  permission_note text,
  permission_decision public.permission_decision,
  permission_decided_at timestamptz,
  permission_decided_by uuid references public.profiles (id) on delete set null,
  -- §6.4: "Rejects → absent, with a mandatory rejection note." Enforced below.
  permission_decision_note text,
  attachment_path text,

  -- ── anti-proxy signals (§7) ──────────────────────────────────────────────
  -- Every one of these is ADVISORY to the rep, recorded on the record, and
  -- visible in the audit log. None of them auto-rejects anything: a control
  -- that produces false positives against students is one reps learn to ignore.
  device_fingerprint text,
  submitted_ip inet,
  geofence_distance_m integer,
  anti_proxy_flags text[] not null default '{}',

  -- ── provenance ───────────────────────────────────────────────────────────
  -- Which rule version decided this record. Points at the session's snapshot;
  -- carried here so a record is self-describing in an export, without a join
  -- through a session that may since have been cancelled.
  rules_snapshot_id uuid,

  -- §6.6: any override writes all three plus an audit entry.
  is_override boolean not null default false,
  override_reason text,
  overridden_by uuid references public.profiles (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Soft-delete only where audit demands it (§5). An academic record is never
  -- hard-deleted; this exists for GDPR anonymisation paths, not for tidying up.
  deleted_at timestamptz,

  -- THE constraint. Everything else in this table is detail.
  unique (student_id, session_id),

  -- A record is an attendance request or a permission request, never both. The
  -- two live on one row (§5) and this keeps that from becoming ambiguity —
  -- deriveStatus branches on exactly this distinction.
  constraint records_request_kind_exclusive check (
    not (submitted_at is not null and permission_reason_id is not null)
  ),

  -- A verdict implies a submission to have a verdict about, and a timestamp and
  -- an author. deriveStatus throws on the first of these; the database should
  -- not have let it happen in the first place.
  constraint records_decision_needs_submission check (
    decision is null or submitted_at is not null
  ),
  constraint records_decision_complete check (
    (decision is null) = (decided_at is null)
  ),
  constraint records_decided_after_submitted check (
    decided_at is null or submitted_at is null or decided_at >= submitted_at
  ),

  -- A permission verdict implies a permission request.
  constraint records_permission_needs_reason check (
    permission_decision is null or permission_reason_id is not null
  ),
  constraint records_permission_decision_complete check (
    (permission_decision is null) = (permission_decided_at is null)
  ),

  -- §6.4: the rejection note is mandatory. A student told "no" is owed a reason,
  -- and in week 14 that note is the only evidence the decision was considered.
  constraint records_permission_rejection_has_note check (
    permission_decision is distinct from 'rejected'
    or (permission_decision_note is not null and length(trim(permission_decision_note)) > 0)
  ),

  -- §6.6 / §0: an override without a reason is unauditable.
  constraint records_override_has_reason check (
    not is_override
    or (
      override_reason is not null
      and length(trim(override_reason)) > 0
      and overridden_by is not null
    )
  )
);

-- §5: "students will contest records; without this, disputes happen over
-- WhatsApp and end up in the registrar's office."
create table public.attendance_disputes (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.attendance_records (id) on delete restrict,
  student_id uuid not null references public.profiles (id) on delete restrict,

  message text not null check (length(trim(message)) > 0),
  evidence_path text,

  status public.dispute_status not null default 'open',

  -- The rep responds; the instructor/admin has final say (§6.6).
  responded_at timestamptz,
  responded_by uuid references public.profiles (id) on delete set null,
  response_note text,

  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolution_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint disputes_resolution_complete check (
    (status in ('resolved', 'rejected'))
    = (resolved_at is not null and resolution_note is not null)
  )
);

-- One open dispute per record. A student may dispute again after a resolution
-- (new facts, new evidence), but two simultaneous open disputes on one record
-- is a queue nobody can reason about.
create unique index attendance_disputes_one_open_per_record
  on public.attendance_disputes (record_id)
  where status in ('open', 'responded');
