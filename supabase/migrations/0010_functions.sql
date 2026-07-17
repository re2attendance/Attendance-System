-- 0010_functions
--
-- Triggers, the RLS helper functions, and close_session().

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'institutions', 'faculties', 'departments', 'programs',
    'academic_years', 'semesters', 'academic_calendar_events',
    'profiles', 'user_roles', 'invitations',
    'courses', 'class_sections', 'enrollments', 'course_rep_assignments',
    'schedule_rules', 'attendance_sessions',
    'permission_reasons', 'attendance_records', 'attendance_disputes',
    'attendance_rules',
    'notification_preferences', 'feature_flags'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Append-only / immutability enforcement
-- ─────────────────────────────────────────────────────────────────────────────

-- §5: audit_log is append-only, "no update/delete grants to anyone".
--
-- Revoking grants is not enough. A grant can be re-granted by a future
-- migration written in a hurry, and RLS does not apply to the service role at
-- all. A trigger applies to everyone, including the postgres superuser, so this
-- is the only version of "append-only" that is actually true.
create or replace function public.reject_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception
    '% is append-only: % is not permitted on this table',
    tg_table_name, tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_log_no_update
  before update on public.audit_log
  for each row execute function public.reject_mutation();

create trigger audit_log_no_delete
  before delete on public.audit_log
  for each row execute function public.reject_mutation();

-- A snapshot that can change is not a snapshot. This is what makes "immutable
-- once used" (§5) a fact rather than a convention — an admin editing rules in
-- week 10 cannot reach into week 2 even with direct database access.
create trigger rule_snapshots_no_update
  before update on public.attendance_rule_snapshots
  for each row execute function public.reject_mutation();

create trigger rule_snapshots_no_delete
  before delete on public.attendance_rule_snapshots
  for each row execute function public.reject_mutation();

-- ─────────────────────────────────────────────────────────────────────────────
-- Denormalisation kept honest
-- ─────────────────────────────────────────────────────────────────────────────

-- attendance_records.class_section_id is denormalised from the session for
-- query speed (§5). A denormalised column maintained by application code is a
-- column that will eventually disagree with its source; this makes the database
-- responsible for it instead.
-- SECURITY DEFINER, and the reason is worth stating: without it this lookup
-- runs as the caller, who may not be able to SELECT the session. It then
-- resolves null and raises "session does not exist" — a denial by accident,
-- with a misleading message, at the wrong layer.
--
-- Found by the pgTAP suite: a student inserting into a section they are not
-- enrolled in got P0001 "session does not exist" instead of RLS's 42501. The
-- request was refused either way, which is exactly what makes it dangerous —
-- the test passed on outcome while the mechanism was wrong. Authorisation is
-- RLS's job (the WITH CHECK on records_insert_own); this trigger's only job is
-- to resolve a denormalised column, and it must be able to do that for any row
-- the caller is allowed to attempt.
--
-- It leaks nothing: the value lands on a row RLS then evaluates, and a caller
-- who cannot insert never sees it.
create or replace function public.attendance_records_sync_section()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select s.class_section_id into new.class_section_id
  from public.attendance_sessions s
  where s.id = new.session_id;

  if new.class_section_id is null then
    raise exception 'attendance_records: session % does not exist', new.session_id
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

create trigger attendance_records_sync_section
  before insert or update of session_id on public.attendance_records
  for each row execute function public.attendance_records_sync_section();

-- ─────────────────────────────────────────────────────────────────────────────
-- Server time is authoritative (§5)
-- ─────────────────────────────────────────────────────────────────────────────

-- "Never trust client clocks — server time is authoritative for every timing
-- decision."
--
-- A column default does not achieve this: a default only applies when the
-- client omits the column, and a client that supplies `submitted_at` overrides
-- it silently. Since submitted_at is the single input deriveStatus anchors on,
-- a client that can set it can choose its own status.
--
-- So it is overwritten rather than defaulted, for anyone holding a user JWT.
-- service_role is exempt: seeds and backfills legitimately write history, and
-- they are not reachable from a browser (lib/supabase/admin.ts is ESLint-fenced
-- to jobs/* and app/api/cron/*).
-- INSERT and UPDATE are handled differently, and the difference is the whole
-- correctness of the timing model.
--
-- The first version of this stamped now() onto submitted_at whenever it was
-- non-null, on insert AND update. Every approval therefore rewrote submitted_at
-- to the approval time — verified: a record submitted at 10:49 and approved at
-- 11:13 came back reading 11:13.
--
-- That is the precise injustice §6.5 exists to prevent. deriveStatus anchors on
-- submitted_at so a slow queue cannot make an on-time student late; this fed it
-- the approval time and made every late approval a late student. The rules
-- engine was correct and its input was corrupt. 74 RLS tests missed it because
-- they all set `status` by hand instead of deriving it.
--
-- So:
--   INSERT — stamp server time. The client's value, if any, is discarded.
--   UPDATE — submitted_at is IMMUTABLE. It is a fact about a moment that has
--            already happened, and nothing that happens later gets to move it.
--            The decision stamps are refreshed only when the decision itself
--            changes, so a status-only update (close_session's sweep, an
--            emergency voiding a day) leaves the decision history intact.
create or replace function public.attendance_records_force_server_time()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- service_role (auth.uid() is null) writes history legitimately: seeds,
  -- backfills, imports. It is not reachable from a browser.
  if (select auth.uid()) is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.submitted_at is not null then
      new.submitted_at := now();
    end if;
    if new.decided_at is not null then
      new.decided_at := now();
    end if;
    if new.permission_decided_at is not null then
      new.permission_decided_at := now();
    end if;
    return new;
  end if;

  -- UPDATE.
  new.submitted_at := old.submitted_at;

  if new.decision is distinct from old.decision then
    new.decided_at := case when new.decision is null then null else now() end;
  else
    new.decided_at := old.decided_at;
  end if;

  if new.permission_decision is distinct from old.permission_decision then
    new.permission_decided_at :=
      case when new.permission_decision is null then null else now() end;
  else
    new.permission_decided_at := old.permission_decided_at;
  end if;

  return new;
end;
$$;

create trigger attendance_records_force_server_time
  before insert or update on public.attendance_records
  for each row execute function public.attendance_records_force_server_time();

-- ─────────────────────────────────────────────────────────────────────────────
-- Institutional facts are not preferences
-- ─────────────────────────────────────────────────────────────────────────────

-- A user may edit their own profile — their name, their avatar. They may not
-- edit their status, matric number, department, program, level or institution.
-- Those are facts the institution asserts about them, and a student who can set
-- status = 'active' has un-suspended themselves.
--
-- This is a trigger rather than an RLS WITH CHECK, and that is not a style
-- choice: a policy on profiles that reads profiles to compare old values
-- recurses infinitely, which is how the first version of this failed. RLS
-- decides which ROWS you may touch; it has no column vocabulary. Postgres has
-- column-level GRANTs, but they cannot express "unless you are an admin", so a
-- trigger it is.
--
-- auth.uid() is null for service_role (seeds, jobs, admin imports), which
-- legitimately set these fields.
create or replace function public.profiles_protect_institutional_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is null or public.auth_is_admin() then
    return new;
  end if;

  if new.status is distinct from old.status
     or new.institution_id is distinct from old.institution_id
     or new.matric_number is distinct from old.matric_number
     or new.department_id is distinct from old.department_id
     or new.program_id is distinct from old.program_id
     or new.level is distinct from old.level
  then
    raise exception
      'profiles: status, institution, matric number, department, program and level are set by the institution and cannot be self-edited'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger profiles_protect_institutional_fields
  before update on public.profiles
  for each row execute function public.profiles_protect_institutional_fields();

-- ─────────────────────────────────────────────────────────────────────────────
-- Audit writes
-- ─────────────────────────────────────────────────────────────────────────────

-- audit_log has no INSERT policy, so nothing can write to it directly with a
-- user JWT. This is the only door, and it stamps actor_id itself — a caller
-- cannot forge an entry attributing an action to someone else, or write an
-- entry that lies about who they are.
create or replace function public.log_audit(
  p_action text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_before jsonb default null,
  p_after jsonb default null,
  p_ip inet default null,
  p_user_agent text default null
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
begin
  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, before, after, ip, user_agent
  ) values (
    (select auth.uid()), p_action, p_entity_type, p_entity_id,
    p_before, p_after, p_ip, p_user_agent
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.log_audit(text, text, uuid, jsonb, jsonb, inet, text) from public;
grant execute on function public.log_audit(text, text, uuid, jsonb, jsonb, inet, text)
  to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS helpers (§8)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- All SECURITY DEFINER with search_path pinned to `public, pg_temp`.
--
-- SECURITY DEFINER is not a convenience here, it is required: a policy on
-- user_roles that reads user_roles recurses forever. Running as the definer
-- steps outside RLS for the lookup and terminates.
--
-- Pinning search_path is what keeps SECURITY DEFINER from being a privilege
-- escalation: without it, a caller can prepend a schema they control, shadow
-- `user_roles` with their own table, and answer their own authorisation
-- question. `pg_temp` last, never first.
--
-- These are STABLE so the planner can call them once per query rather than once
-- per row — §8 asks for policies that stay index-friendly.

create or replace function public.auth_has_role(
  p_role public.app_role,
  p_scope_type public.role_scope_type default 'global',
  p_scope_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = p_role
      and (
        -- A global grant answers for every scope. This is how admin works.
        ur.scope_type = 'global'
        or (ur.scope_type = p_scope_type and ur.scope_id = p_scope_id)
      )
  );
$$;

create or replace function public.auth_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.auth_has_role('admin');
$$;

-- §4: a rep manages "only for the class/section they are assigned to, only
-- within their appointment period."
--
-- The period is the point. A boolean on the profile cannot express "was this
-- person rep in week 2?", and an expired appointment must stop granting
-- authority the moment it expires — not whenever someone remembers to delete
-- the row.
create or replace function public.auth_is_active_rep_for_section(p_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.course_rep_assignments a
    where a.user_id = (select auth.uid())
      and a.class_section_id = p_section_id
      and a.revoked_at is null
      and a.starts_at <= now()
      and (a.ends_at is null or a.ends_at > now())
  );
$$;

create or replace function public.auth_is_instructor_for_section(p_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.class_sections cs
    where cs.id = p_section_id
      and cs.instructor_id = (select auth.uid())
  );
$$;

-- "May administer this section's sessions and records": admin, the section's
-- instructor, or an in-period rep. Most policies want exactly this question.
create or replace function public.auth_can_administer_section(p_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.auth_is_admin()
    or public.auth_is_instructor_for_section(p_section_id)
    or public.auth_is_active_rep_for_section(p_section_id);
$$;

create or replace function public.auth_is_enrolled_in_section(p_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.enrollments e
    where e.student_id = (select auth.uid())
      and e.class_section_id = p_section_id
      and e.status = 'enrolled'
  );
$$;

-- A session accepts submissions only while it is open. The action layer checks
-- this too, because it owes the student a real error ("Session closed at 10:12.
-- Ask your course rep to review this." — §11.7) rather than a policy violation.
-- It is ALSO here because §7 lists "submission before session opened" as an
-- anomaly to catch, and an action-layer check is a check the database is not
-- making.
-- Is this day declared a holiday, break, exam period or emergency for this
-- section? True if either an institution-wide declaration or one scoped to this
-- section covers the date.
create or replace function public.auth_day_is_declared(
  p_class_section_id uuid,
  p_date date
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.academic_calendar_events e
    join public.class_sections cs on cs.id = p_class_section_id
    where p_date between e.starts_on and e.ends_on
      and e.institution_id = cs.institution_id
      and (
        -- Institution-wide, or scoped to exactly this section.
        e.class_section_id is null
        or e.class_section_id = p_class_section_id
      )
  );
$$;

create or replace function public.auth_session_accepts_submissions(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.attendance_sessions s
    where s.id = p_session_id
      and s.status = 'open'
      -- Belt and braces. Declaring a holiday cancels that day's sessions, so a
      -- cancelled session already fails the status check above and this is
      -- redundant for the normal path.
      --
      -- It is here for the path that is not normal: a session created on an
      -- already-declared day, or one somehow reopened. The requirement is
      -- "students should not submit any attendance on a holiday", and that
      -- should be true because of the DAY, not merely because of a side effect
      -- that ran once when the day was declared.
      and not public.auth_day_is_declared(s.class_section_id, s.session_date)
  );
$$;

-- §6.6: "Records lock permanently after the semester is finalized." Checked in
-- policies so the lock is not something an action layer can forget.
create or replace function public.auth_section_is_finalized(p_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.class_sections cs
    join public.semesters sem on sem.id = cs.semester_id
    where cs.id = p_section_id
      and sem.status = 'finalized'
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- close_session() — the load-bearing job (§6.1)
-- ─────────────────────────────────────────────────────────────────────────────

-- "On close: every enrolled, non-withdrawn student with no record for that
-- session gets an absent record. This is the step most implementations forget;
-- without it, absences don't exist as rows and percentages are wrong."
--
-- Idempotent by construction, because it WILL be called twice — by the
-- auto-close cron and by a rep hitting Close at the same moment, or by a cron
-- retry after a timeout. Assume every job double-fires:
--
--   · the session update is conditional on status = 'open'
--   · the absence insert relies on unique (student_id, session_id) + DO NOTHING
--   · the pending sweep only touches rows still pending
--
-- Runs as SECURITY DEFINER because it writes records for OTHER users, which no
-- caller's RLS context permits. Callers are the cron job and the section's
-- administrators; the authorisation check is explicit below rather than
-- delegated to policies that this function is deliberately outside of.
create or replace function public.close_session(p_session_id uuid)
returns table (absences_written integer, pending_swept integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.attendance_sessions;
  v_absences integer := 0;
  v_swept integer := 0;
begin
  select * into v_session
  from public.attendance_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'close_session: session % does not exist', p_session_id;
  end if;

  -- Explicit authorisation. This function bypasses RLS, so it cannot rely on
  -- it. `auth.uid() is null` is the cron path — no JWT, service role.
  if (select auth.uid()) is not null
     and not public.auth_can_administer_section(v_session.class_section_id) then
    raise exception 'close_session: not authorised for section %',
      v_session.class_section_id
      using errcode = 'insufficient_privilege';
  end if;

  -- Already closed or cancelled: nothing to do. The second caller of a
  -- double-fire lands here and reports zeroes rather than erroring.
  if v_session.status <> 'open' then
    return query select 0, 0;
    return;
  end if;

  update public.attendance_sessions
  set status = 'closed',
      closed_at = now(),
      closed_by = (select auth.uid())
  where id = p_session_id
    and status = 'open';

  -- Absences for everyone enrolled on the day who left no record.
  --
  -- "Enrolled on the day" is a temporal question, not a status one: a student
  -- who dropped in week 5 was still enrolled for week 3's session and must be
  -- absent for it, while a student who enrolled in week 6 must not be. Reading
  -- enrollments.status alone would rewrite history every time someone drops.
  with enrolled_on_the_day as (
    select e.student_id
    from public.enrollments e
    where e.class_section_id = v_session.class_section_id
      and e.enrolled_at <= v_session.starts_at
      and (e.dropped_at is null or e.dropped_at > v_session.starts_at)
  ),
  inserted as (
    insert into public.attendance_records (
      student_id, session_id, class_section_id, status,
      submission_source, rules_snapshot_id
    )
    select
      d.student_id, p_session_id, v_session.class_section_id, 'absent',
      'system', v_session.rules_snapshot_id
    from enrolled_on_the_day d
    on conflict (student_id, session_id) do nothing
    returning 1
  )
  select count(*)::integer into v_absences from inserted;

  -- ADR-010 (supersedes ADR-009): a record nobody ever decided becomes
  -- `unverified`, not `absent`.
  --
  -- The student submitted on time and the system failed to establish a fact
  -- about them. Recording `absent` would be the database asserting something it
  -- never determined — and charging the student for a rep's inaction, the one
  -- thing they cannot influence.
  --
  -- Covers both pendings: an undecided permission request is the same failure
  -- as an undecided attendance request. Nobody answered.
  --
  -- These records stay decidable. A closed session is not a finalized semester,
  -- so records_decide_section still permits a late verdict, and deriving from a
  -- later `decision` yields present/late normally. `unverified` is a recoverable
  -- state, not a grave.
  update public.attendance_records
  set status = 'unverified'
  where session_id = p_session_id
    and status in ('pending_verification', 'pending_permission_review');

  get diagnostics v_swept = row_count;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, after
  ) values (
    (select auth.uid()),
    'session.closed',
    'attendance_session',
    p_session_id,
    jsonb_build_object(
      'absences_written', v_absences,
      'pending_swept', v_swept,
      'closed_by_cron', (select auth.uid()) is null
    )
  );

  return query select v_absences, v_swept;
end;
$$;

revoke all on function public.close_session(uuid) from public;
grant execute on function public.close_session(uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- declare_calendar_event() — holidays and impromptu emergencies
-- ─────────────────────────────────────────────────────────────────────────────

-- "Today", in the institution's timezone.
--
-- Not the server's date and emphatically not the client's. A student in Accra
-- and a server in Virginia disagree about what day it is for five hours every
-- night, and "an emergency may only be declared on the day itself" is a rule
-- about the university's day, not UTC's. §2 Q3: one institutional timezone, all
-- logic server-side.
create or replace function public.institution_today(p_institution_id uuid)
returns date
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (now() at time zone i.timezone)::date
  from public.institutions i
  where i.id = p_institution_id;
$$;

-- Declares a holiday, break, exam period, or impromptu emergency, and applies
-- it: every session in scope on those dates is cancelled, and every record on
-- those sessions is voided — INCLUDING ones a rep already approved.
--
-- Scope (see the note on academic_calendar_events):
--   p_class_section_id null → institution-wide. Admin only.
--   p_class_section_id set  → that section. Rep / instructor / admin.
--
-- Date rules, enforced here because a CHECK constraint cannot see the clock
-- (current_date is not immutable, so it cannot appear in one):
--   emergency          → must be TODAY, exactly. Not yesterday, not tomorrow.
--   holiday/break/exam → today or later. Never backdated.
--
-- Why nothing may be backdated: a retroactive declaration is indistinguishable
-- from erasing a day of absences. That is the only reason anyone would want
-- one, so the database does not offer it. Correcting a genuine past mistake is
-- an instructor override on the affected records, which is audited per record
-- and cannot be done in one click for 300 people.
create or replace function public.declare_calendar_event(
  p_event_type public.calendar_event_type,
  p_starts_on date,
  p_ends_on date,
  p_title text,
  p_class_section_id uuid default null,
  p_reason text default null
)
returns table (event_id uuid, sessions_cancelled integer, records_voided integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_institution uuid;
  v_today date;
  v_event_id uuid;
  v_sessions integer := 0;
  v_records integer := 0;
  v_actor uuid := (select auth.uid());
begin
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on then
    raise exception 'declare_calendar_event: invalid date range % .. %',
      p_starts_on, p_ends_on
      using errcode = 'check_violation';
  end if;

  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'declare_calendar_event: a title is required'
      using errcode = 'check_violation';
  end if;

  -- ── scope + authorisation ────────────────────────────────────────────────
  if p_class_section_id is null then
    -- Institution-wide. This shuts the university for the day, so it is admin's
    -- alone: a course rep is a student, and no student closes a university.
    if not public.auth_is_admin() then
      raise exception
        'declare_calendar_event: an institution-wide % may only be declared by an admin. To declare it for a section you administer, pass that section.',
        p_event_type
        using errcode = 'insufficient_privilege';
    end if;

    select p.institution_id into v_institution
    from public.profiles p where p.id = v_actor;
  else
    select cs.institution_id into v_institution
    from public.class_sections cs where cs.id = p_class_section_id;

    if v_institution is null then
      raise exception 'declare_calendar_event: section % does not exist', p_class_section_id
        using errcode = 'foreign_key_violation';
    end if;

    -- auth_can_administer_section carries the appointment-period check, so an
    -- expired or revoked rep cannot declare anything.
    if not public.auth_can_administer_section(p_class_section_id) then
      raise exception 'declare_calendar_event: not authorised for section %',
        p_class_section_id
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if v_institution is null then
    raise exception 'declare_calendar_event: cannot resolve the institution'
      using errcode = 'foreign_key_violation';
  end if;

  v_today := public.institution_today(v_institution);

  -- ── date rules ───────────────────────────────────────────────────────────
  if p_event_type = 'emergency' then
    if p_starts_on <> v_today or p_ends_on <> v_today then
      raise exception
        'declare_calendar_event: an emergency may only be declared for today (% in this institution''s timezone), not % .. %. It is an impromptu event and is pronounced as it happens.',
        v_today, p_starts_on, p_ends_on
        using errcode = 'check_violation';
    end if;
  elsif p_starts_on < v_today then
    raise exception
      'declare_calendar_event: a % cannot be backdated (% is before today, %). A backdated declaration is indistinguishable from erasing that day''s absences; correct individual records with an override instead.',
      p_event_type, p_starts_on, v_today
      using errcode = 'check_violation';
  end if;

  -- ── declare ──────────────────────────────────────────────────────────────
  insert into public.academic_calendar_events (
    institution_id, class_section_id, title, event_type,
    starts_on, ends_on, declared_by, reason
  ) values (
    v_institution, p_class_section_id, trim(p_title), p_event_type,
    p_starts_on, p_ends_on, v_actor, p_reason
  )
  returning id into v_event_id;

  -- ── apply: cancel the sessions ───────────────────────────────────────────
  with cancelled as (
    update public.attendance_sessions s
    set status = 'cancelled',
        cancelled_at = now(),
        cancelled_by = v_actor,
        cancelled_reason = trim(p_title),
        cancelled_by_event_id = v_event_id
    where s.session_date between p_starts_on and p_ends_on
      and s.status <> 'cancelled'
      and (
        p_class_section_id is not null and s.class_section_id = p_class_section_id
        or p_class_section_id is null and exists (
          select 1 from public.class_sections cs
          where cs.id = s.class_section_id and cs.institution_id = v_institution
        )
      )
    returning s.id
  )
  select count(*)::integer into v_sessions from cancelled;

  -- ── apply: void the records, approved ones included ──────────────────────
  --
  -- This is the part the requirement turns on. A student may have reported
  -- present this morning and had it approved before the emergency was called;
  -- the class still did not happen, so the record cannot say it did.
  --
  -- `decision` and `decided_by` are deliberately NOT cleared. The rep did
  -- approve it, and that remains true — deleting the fact would make the audit
  -- trail lie about what people did. Only the status changes, and the
  -- force_server_time trigger preserves the decision stamps on a status-only
  -- update.
  --
  -- deriveStatus agrees without being told: a cancelled session returns
  -- 'cancelled' regardless of any decision on the record. The database and the
  -- rules engine reach the same answer by different routes, which is the
  -- property that keeps them honest.
  with voided as (
    update public.attendance_records r
    set status = 'cancelled'
    from public.attendance_sessions s
    where r.session_id = s.id
      and s.cancelled_by_event_id = v_event_id
      and r.status <> 'cancelled'
    returning r.id
  )
  select count(*)::integer into v_records from voided;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, after
  ) values (
    v_actor,
    'calendar.declared.' || p_event_type,
    'academic_calendar_event',
    v_event_id,
    jsonb_build_object(
      'event_type', p_event_type,
      'title', trim(p_title),
      'starts_on', p_starts_on,
      'ends_on', p_ends_on,
      'scope', case when p_class_section_id is null then 'institution' else 'class_section' end,
      'class_section_id', p_class_section_id,
      'sessions_cancelled', v_sessions,
      'records_voided', v_records,
      'reason', p_reason
    )
  );

  return query select v_event_id, v_sessions, v_records;
end;
$$;

revoke all on function public.declare_calendar_event(
  public.calendar_event_type, date, date, text, uuid, text
) from public;
grant execute on function public.declare_calendar_event(
  public.calendar_event_type, date, date, text, uuid, text
) to authenticated, service_role;
