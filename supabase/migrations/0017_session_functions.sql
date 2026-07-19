-- ─────────────────────────────────────────────────────────────────────────────
-- 0017 — Session lifecycle functions
--
-- Phase 5. Everything that CREATES or TRANSITIONS a session. The tables
-- (0006), the rules (0008), close_session and the auth helpers (0010), and
-- job_runs (0009) already exist; this is the layer that drives them.
--
-- All five are SECURITY DEFINER because they touch rows across students and
-- must run both for a logged-in instructor AND for the cron (no JWT). The
-- pattern from close_session is kept exactly: `auth.uid() is null` is the
-- service-role path and skips the per-user authz check; a real caller is
-- checked against auth_can_administer_section.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── resolve_rule_snapshot ────────────────────────────────────────────────────
--
-- The effective attendance rule for a section, frozen into an immutable
-- snapshot. Most-specific-wins: class_section > course > department > global
-- (the rule_scope ladder from 0008). A global default always exists, so this
-- always resolves; if it somehow does not, that is a seed/config bug and the
-- exception says so rather than pinning null and breaking deriveStatus later.
--
-- Returns a NEW snapshot each call. Snapshots are immutable history (0010's
-- triggers forbid UPDATE/DELETE), so a fresh copy per generate run is correct,
-- not wasteful — it is the record of "the rule as it stood when these sessions
-- were made". Callers resolve ONCE per batch, not once per session.
create or replace function public.resolve_rule_snapshot(p_class_section_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_section record;
  v_rule public.attendance_rules;
  v_snapshot_id uuid;
begin
  select cs.id, cs.institution_id, cs.course_id, c.department_id
    into v_section
  from public.class_sections cs
  join public.courses c on c.id = cs.course_id
  where cs.id = p_class_section_id;

  if not found then
    raise exception 'resolve_rule_snapshot: section % does not exist', p_class_section_id;
  end if;

  select * into v_rule
  from public.attendance_rules r
  where r.institution_id = v_section.institution_id
    and (
      (r.scope = 'class_section' and r.scope_id = v_section.id)
      or (r.scope = 'course'     and r.scope_id = v_section.course_id)
      or (r.scope = 'department' and r.scope_id = v_section.department_id)
      or (r.scope = 'global'     and r.scope_id is null)
    )
  order by
    -- Specificity, then newest version within the winning scope.
    case r.scope
      when 'class_section' then 4
      when 'course' then 3
      when 'department' then 2
      when 'global' then 1
    end desc,
    r.version desc
  limit 1;

  if not found then
    raise exception
      'resolve_rule_snapshot: no attendance rule resolves for section % — a global default should always exist',
      p_class_section_id;
  end if;

  insert into public.attendance_rule_snapshots (
    source_rule_id, source_version,
    present_within_minutes, late_within_minutes, beyond_late_window,
    grace_period_minutes, auto_close_minutes_after_end,
    allow_late_submission, late_submission_window_hours, min_attendance_percent
  ) values (
    v_rule.id, v_rule.version,
    v_rule.present_within_minutes, v_rule.late_within_minutes, v_rule.beyond_late_window,
    v_rule.grace_period_minutes, v_rule.auto_close_minutes_after_end,
    v_rule.allow_late_submission, v_rule.late_submission_window_hours, v_rule.min_attendance_percent
  )
  returning id into v_snapshot_id;

  return v_snapshot_id;
end;
$$;

revoke all on function public.resolve_rule_snapshot(uuid) from public;
grant execute on function public.resolve_rule_snapshot(uuid) to authenticated, service_role;


-- ── generate_sessions ────────────────────────────────────────────────────────
--
-- Expand a section's schedule rules into dated 'scheduled' sessions across
-- [p_from, p_to]. Idempotent: re-running inserts only what is missing, because
-- sessions_section_starts_at_unique refuses a second session at the same start,
-- and `on conflict do nothing` turns that refusal into a skip.
--
-- Two correctness points the spec cares about:
--   · LOCAL wall time. schedule_rules store 10:00 as a `time`, on purpose, so
--     "Mondays at 10:00" stays 10:00 across a DST change. `(date + time) at
--     time zone institution.tz` converts each occurrence to the correct
--     instant — the same tz source institution_today() reads.
--   · Declared days are skipped. auth_day_is_declared already knows about
--     holidays and emergencies (§5: sessions must not be generated onto them).
create or replace function public.generate_sessions(
  p_class_section_id uuid,
  p_from date,
  p_to date
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_section public.class_sections;
  v_tz text;
  v_snapshot_id uuid;
  v_inserted integer := 0;
  v_total integer := 0;
  r public.schedule_rules;
  d date;
begin
  if p_to < p_from then
    raise exception 'generate_sessions: p_to (%) is before p_from (%)', p_to, p_from;
  end if;

  select * into v_section from public.class_sections where id = p_class_section_id;
  if not found then
    raise exception 'generate_sessions: section % does not exist', p_class_section_id;
  end if;

  if (select auth.uid()) is not null
     and not public.auth_can_administer_section(p_class_section_id) then
    raise exception 'generate_sessions: not authorised for section %', p_class_section_id
      using errcode = 'insufficient_privilege';
  end if;

  select i.timezone into v_tz
  from public.institutions i
  where i.id = v_section.institution_id;

  -- Resolve once for the whole batch (watch-item: not per session).
  v_snapshot_id := public.resolve_rule_snapshot(p_class_section_id);

  for r in
    select * from public.schedule_rules
    where class_section_id = p_class_section_id
  loop
    for d in
      select gs::date
      from generate_series(
        greatest(p_from, r.effective_from),
        least(p_to, coalesce(r.effective_to, p_to)),
        interval '1 day'
      ) gs
      where extract(dow from gs) = r.day_of_week
    loop
      if public.auth_day_is_declared(p_class_section_id, d) then
        continue;
      end if;

      insert into public.attendance_sessions (
        class_section_id, session_date, starts_at, ends_at, room, status,
        generated_from_schedule_rule_id, rules_snapshot_id
      ) values (
        p_class_section_id,
        d,
        (d + r.starts_at_local) at time zone v_tz,
        (d + r.ends_at_local) at time zone v_tz,
        r.room,
        'scheduled',
        r.id,
        v_snapshot_id
      )
      on conflict (class_section_id, starts_at) where status <> 'cancelled'
      do nothing;

      get diagnostics v_inserted = row_count;
      v_total := v_total + v_inserted;
    end loop;
  end loop;

  return v_total;
end;
$$;

revoke all on function public.generate_sessions(uuid, date, date) from public;
grant execute on function public.generate_sessions(uuid, date, date) to authenticated, service_role;


-- ── open_session ─────────────────────────────────────────────────────────────
--
-- Move a scheduled session to 'open'. A hand-created session that never went
-- through generate_sessions has no snapshot yet, so one is pinned on the way in
-- — status derivation depends on it.
--
-- (An anti-proxy code was armed here originally; it was removed as a product
-- decision, since there is no display to project a rotating code and the rep
-- verifies presence manually.)
create or replace function public.open_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.attendance_sessions;
  v_snapshot_id uuid;
begin
  select * into v_session
  from public.attendance_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'open_session: session % does not exist', p_session_id;
  end if;

  if (select auth.uid()) is not null
     and not public.auth_can_administer_section(v_session.class_section_id) then
    raise exception 'open_session: not authorised for section %', v_session.class_section_id
      using errcode = 'insufficient_privilege';
  end if;

  if v_session.status <> 'scheduled' then
    raise exception 'open_session: session % is %, only a scheduled session can be opened',
      p_session_id, v_session.status;
  end if;

  v_snapshot_id := coalesce(
    v_session.rules_snapshot_id,
    public.resolve_rule_snapshot(v_session.class_section_id)
  );

  update public.attendance_sessions
  set status = 'open',
      opened_at = now(),
      opened_by = (select auth.uid()),
      rules_snapshot_id = v_snapshot_id
  where id = p_session_id;
end;
$$;

revoke all on function public.open_session(uuid) from public;
grant execute on function public.open_session(uuid) to authenticated, service_role;


-- ── cancel_session ───────────────────────────────────────────────────────────
--
-- A MANUAL cancel — lecturer ill, room double-booked. Distinct from an
-- event-driven cancel, which declare_calendar_event does across a whole scope
-- and stamps with cancelled_by_event_id. Here cancelled_by_event_id stays null
-- and the reason carries the why (the sessions_cancelled_has_reason constraint
-- makes the reason mandatory).
--
-- A closed session cannot be cancelled: its absences are already written and
-- reversing that is a different, audited operation, not a status flip.
create or replace function public.cancel_session(p_session_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.attendance_sessions;
begin
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'cancel_session: a reason is required';
  end if;

  select * into v_session
  from public.attendance_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'cancel_session: session % does not exist', p_session_id;
  end if;

  if (select auth.uid()) is not null
     and not public.auth_can_administer_section(v_session.class_section_id) then
    raise exception 'cancel_session: not authorised for section %', v_session.class_section_id
      using errcode = 'insufficient_privilege';
  end if;

  if v_session.status = 'closed' then
    raise exception 'cancel_session: session % is closed and cannot be cancelled', p_session_id;
  end if;

  if v_session.status = 'cancelled' then
    return; -- idempotent; already cancelled.
  end if;

  update public.attendance_sessions
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = (select auth.uid()),
      cancelled_reason = btrim(p_reason)
  where id = p_session_id;
end;
$$;

revoke all on function public.cancel_session(uuid, text) from public;
grant execute on function public.cancel_session(uuid, text) to authenticated, service_role;


-- ── close_due_sessions ───────────────────────────────────────────────────────
--
-- The auto-close job's body. Finds every open session past its close time —
-- ends_at + the snapshot's auto_close_minutes_after_end — and closes each
-- through the existing close_session(), which is where the absences are
-- actually written. That primitive is already idempotent (a second call on a
-- closed session writes nothing), so this wrapper inherits idempotency for
-- free: a double-fire re-selects nothing on the second pass because the first
-- already moved them to 'closed'.
--
-- The HTTP trigger (/api/cron/close-sessions) adds run-key deduplication on top
-- via job_runs; this function is the honest fallback even if that layer is
-- bypassed.
create or replace function public.close_due_sessions()
returns table (closed integer, absences integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_closed integer := 0;
  v_absences integer := 0;
  v_result record;
  s record;
begin
  for s in
    select sess.id
    from public.attendance_sessions sess
    join public.attendance_rule_snapshots rs on rs.id = sess.rules_snapshot_id
    where sess.status = 'open'
      and now() >= sess.ends_at + make_interval(mins => rs.auto_close_minutes_after_end)
    order by sess.ends_at
  loop
    select * into v_result from public.close_session(s.id);
    v_closed := v_closed + 1;
    v_absences := v_absences + coalesce(v_result.absences_written, 0);
  end loop;

  return query select v_closed, v_absences;
end;
$$;

revoke all on function public.close_due_sessions() from public;
grant execute on function public.close_due_sessions() to authenticated, service_role;
