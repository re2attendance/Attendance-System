-- ─────────────────────────────────────────────────────────────────────────────
-- 0018 — Attendance write functions (Phase 6)
--
-- The three writes the ledger turns on: a student reporting present, a rep/
-- instructor rotating the anti-proxy code they display, and a rep/instructor
-- deciding a claim. The tables (0007), the rule snapshots (0008/0017), the auth
-- helpers (0010), and the session lifecycle (0017) already exist; this is the
-- layer that lets people write to the ledger through them.
--
-- Two things stay OUT of this file on purpose:
--
--   · Status derivation for an approval (present vs late vs absent) is NOT
--     recomputed here. deriveStatus (features/attendance/rules) is the single
--     source of truth (§2.4) and the approval ACTION calls it, then passes the
--     result in as p_status. Duplicating the timing ladder in SQL would make two
--     implementations that must never disagree — exactly what the snapshot model
--     exists to avoid. This function trusts a server-computed status and merely
--     writes it atomically; a light guard checks it is consistent with the
--     decision, nothing more.
--
--   · RLS. records_insert_own and records_decide_section (0011) already permit
--     exactly these writes. report_present could be a plain insert and decide a
--     plain update. They are SECURITY DEFINER functions instead because each
--     needs something RLS cannot give a single statement: code validation
--     against the live rotation, anti-proxy flagging that reads OTHER students'
--     rows, idempotency against the unique constraint, and a FOR UPDATE lock so
--     two reps deciding at once cannot both win. The authorisation each bypasses
--     is re-checked here explicitly.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── report_present ───────────────────────────────────────────────────────────
--
-- A student's claim that they are in the room. Validates the possession factor
-- (the rotating code shown on the session display), binds the submission to a
-- device, flags a shared device, and pins the rule snapshot the record will be
-- judged against.
--
-- IDEMPOTENT. §6 risk 6: the offline queue is the easiest place to create a
-- duplicate submission, and unique (student_id, session_id) is the backstop. A
-- second call — a retried request, a double tap, a queue flush — returns the
-- EXISTING record unchanged rather than erroring or duplicating. The client can
-- therefore retry freely, which is the whole point of an offline queue.
--
-- Anti-proxy is flags, never a block (§7, ADR-003). Two students on one device
-- both get in; both records carry 'shared_device' so a rep can see it and
-- decide. The system's job is to make proxying visible to a human, not to
-- adjudicate it silently.
create or replace function public.report_present(
  p_session_id uuid,
  p_code text,
  p_device_fingerprint text default null,
  p_ip inet default null
)
returns table (record_id uuid, status public.attendance_status)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.attendance_sessions;
  v_uid uuid := (select auth.uid());
  v_binding_on boolean;
  v_flags text[] := array[]::text[];
  v_existing public.attendance_records;
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'report_present: no authenticated user' using errcode = 'insufficient_privilege';
  end if;

  select * into v_session
  from public.attendance_sessions
  where id = p_session_id;

  if not found then
    raise exception 'report_present: session % does not exist', p_session_id;
  end if;

  -- The window. auth_session_accepts_submissions folds together "is open" and
  -- "is not on a declared holiday" (0010) — the same gate the RLS insert policy
  -- applies, checked here because this function is outside RLS.
  if not public.auth_session_accepts_submissions(p_session_id) then
    raise exception 'This session is not open for attendance.';
  end if;

  if not public.auth_is_enrolled_in_section(v_session.class_section_id) then
    raise exception 'You are not enrolled in this section.' using errcode = 'insufficient_privilege';
  end if;

  if public.auth_section_is_finalized(v_session.class_section_id) then
    raise exception 'This section is finalised; its attendance can no longer change.';
  end if;

  -- The possession factor. Compared trimmed and case-folded so a stray space or
  -- a phone that helpfully upper-cased nothing (codes are digits, but be kind)
  -- does not read as a wrong code. A non-secret at rest: the code is only ever a
  -- proof you could see the display in the last rotation, and it rotates.
  if v_session.session_code is null
     or btrim(lower(p_code)) is distinct from lower(v_session.session_code) then
    raise exception 'That attendance code is not correct. Check the code on the screen and try again.';
  end if;

  -- Idempotency, checked before the insert so a retry is cheap and never touches
  -- the row it already wrote. The insert below is the race-safe backstop for two
  -- requests that both pass this check at once.
  select * into v_existing
  from public.attendance_records
  where student_id = v_uid and session_id = p_session_id;

  if found then
    return query select v_existing.id, v_existing.status;
    return;
  end if;

  -- Device binding (feature-flagged, ADR-003). When on and a fingerprint is
  -- present, a fingerprint already seen on THIS session from another student is
  -- a shared device — flag this record, and the earlier ones, so the pair is
  -- visible from either side.
  select enabled into v_binding_on from public.feature_flags where key = 'anti_proxy.device_binding';
  v_binding_on := coalesce(v_binding_on, false);

  if v_binding_on and p_device_fingerprint is not null then
    if exists (
      select 1 from public.attendance_records
      where session_id = p_session_id
        and device_fingerprint = p_device_fingerprint
        and student_id <> v_uid
    ) then
      v_flags := array['shared_device'];

      update public.attendance_records
      set anti_proxy_flags =
        (select array(select distinct unnest(coalesce(anti_proxy_flags, '{}') || array['shared_device'])))
      where session_id = p_session_id
        and device_fingerprint = p_device_fingerprint
        and student_id <> v_uid
        and not ('shared_device' = any(coalesce(anti_proxy_flags, '{}')));
    end if;
  end if;

  insert into public.attendance_records (
    student_id, session_id, class_section_id, status,
    submitted_at, submission_source, device_fingerprint, submitted_ip,
    anti_proxy_flags, rules_snapshot_id
  ) values (
    v_uid, p_session_id, v_session.class_section_id, 'pending_verification',
    now(), 'student_web', p_device_fingerprint, p_ip,
    v_flags, v_session.rules_snapshot_id
  )
  on conflict (student_id, session_id) do nothing
  returning id into v_new_id;

  -- Lost the race to a concurrent identical submit: the other request's row
  -- stands, and this one returns it. Same contract as the idempotency check.
  if v_new_id is null then
    select * into v_existing
    from public.attendance_records
    where student_id = v_uid and session_id = p_session_id;
    return query select v_existing.id, v_existing.status;
    return;
  end if;

  return query select v_new_id, 'pending_verification'::public.attendance_status;
end;
$$;

revoke all on function public.report_present(uuid, text, text, inet) from public;
grant execute on function public.report_present(uuid, text, text, inet) to authenticated;


-- ── rotate_session_code ──────────────────────────────────────────────────────
--
-- The rotation is display-driven. The rep/instructor verify screen polls this
-- while a session is open; it rotates the code at most once per ROTATION_SECONDS
-- no matter how often it is polled, and hands back the current code plus the
-- seconds left on it so the display can show a countdown. A student in the room
-- reads whatever is current; report_present accepts only that.
--
-- Only a section's administrators may call it — the code is theirs to show, and
-- letting a student read it would defeat the possession factor entirely.
create or replace function public.rotate_session_code(p_session_id uuid)
returns table (code text, rotated_at timestamptz, seconds_remaining integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rotation_seconds constant integer := 30;
  v_session public.attendance_sessions;
  v_age numeric;
begin
  select * into v_session
  from public.attendance_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'rotate_session_code: session % does not exist', p_session_id;
  end if;

  if not public.auth_can_administer_section(v_session.class_section_id) then
    raise exception 'rotate_session_code: not authorised for section %', v_session.class_section_id
      using errcode = 'insufficient_privilege';
  end if;

  if v_session.status <> 'open' then
    raise exception 'rotate_session_code: session % is %, only an open session has a code',
      p_session_id, v_session.status;
  end if;

  v_age := extract(epoch from now() - v_session.code_rotated_at);

  if v_session.session_code is null or v_age >= rotation_seconds then
    update public.attendance_sessions
    set session_code = lpad((floor(random() * 1000000))::int::text, 6, '0'),
        code_rotated_at = now()
    where id = p_session_id
    returning attendance_sessions.session_code, attendance_sessions.code_rotated_at
      into v_session.session_code, v_session.code_rotated_at;
    v_age := 0;
  end if;

  return query select
    v_session.session_code,
    v_session.code_rotated_at,
    greatest(0, rotation_seconds - floor(v_age)::integer);
end;
$$;

revoke all on function public.rotate_session_code(uuid) from public;
grant execute on function public.rotate_session_code(uuid) to authenticated;


-- ── attendance_decide_one ────────────────────────────────────────────────────
--
-- The core of a verdict, shared by the single and bulk paths so the two cannot
-- drift. Returns an OUTCOME rather than raising, because the bulk path decides
-- many rows in one transaction and a raise would roll back the good with the
-- bad. The single-record wrapper translates the non-'decided' outcomes into
-- clean errors; the bulk wrapper counts them.
--
-- Race safety lives here: FOR UPDATE serialises two reps on the same row, and
-- the decidability check inside the lock means the second one sees the first's
-- verdict and reports 'already' instead of overwriting it.
--
-- p_status is the status the caller derived (deriveStatus, §2.4). This function
-- does not recompute it; it guards only that it is CONSISTENT with the decision
-- — an approval yields present/late/absent, a rejection yields rejected — so a
-- caller bug is caught loudly rather than written to the ledger.
create or replace function public.attendance_decide_one(
  p_record_id uuid,
  p_decision public.attendance_decision,
  p_status public.attendance_status
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rec public.attendance_records;
  v_uid uuid := (select auth.uid());
begin
  -- Guard the derived status against the decision. Cheap, and it turns a caller
  -- bug into a refusal instead of a corrupt row.
  if p_decision = 'rejected' and p_status <> 'rejected' then
    raise exception 'attendance_decide_one: a rejection must yield status ''rejected'', got %', p_status;
  end if;
  if p_decision = 'approved' and p_status not in ('present', 'late', 'absent') then
    raise exception 'attendance_decide_one: an approval must yield present/late/absent, got %', p_status;
  end if;

  select * into v_rec
  from public.attendance_records
  where id = p_record_id
  for update;

  if not found then
    return 'not_found';
  end if;

  -- Conflict of interest (§4, records_decide_section): a rep cannot decide their
  -- own record. RLS enforces this too; mirrored here because this function is
  -- outside it, and covered by the pgTAP suite either way.
  if v_rec.student_id = v_uid then
    return 'conflict';
  end if;

  if not public.auth_can_administer_section(v_rec.class_section_id) then
    return 'not_authorized';
  end if;

  if public.auth_section_is_finalized(v_rec.class_section_id) then
    return 'finalized';
  end if;

  -- Decidable = still awaiting a verdict. pending_verification is the live queue;
  -- unverified is a closed session nobody got to (ADR-010), still decidable. Any
  -- other status means someone (or the close job) already resolved it — the race
  -- loser lands here and reports 'already' rather than overwriting a verdict.
  if v_rec.status not in ('pending_verification', 'unverified') then
    return 'already';
  end if;

  update public.attendance_records
  set status = p_status,
      decision = p_decision,
      decided_at = now(),
      decided_by = v_uid,
      -- A rep-performance metric, not a student penalty (§2.4). Null-safe: an
      -- unverified record still has its submitted_at.
      verification_latency_seconds =
        case when v_rec.submitted_at is not null
          then greatest(0, floor(extract(epoch from now() - v_rec.submitted_at))::integer)
          else null end
  where id = p_record_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, after)
  values (
    v_uid,
    case when p_decision = 'approved' then 'attendance.approved' else 'attendance.rejected' end,
    'attendance_record',
    p_record_id,
    jsonb_build_object('status', p_status, 'decision', p_decision)
  );

  return 'decided';
end;
$$;

revoke all on function public.attendance_decide_one(uuid, public.attendance_decision, public.attendance_status) from public;
-- Not granted to anyone: an internal primitive, called only by the two wrappers
-- below, which are themselves SECURITY DEFINER. Keeping it ungranted means it is
-- unreachable from PostgREST directly.


-- ── decide_attendance ────────────────────────────────────────────────────────
--
-- One verdict, for the single-row approve/reject buttons. Translates the shared
-- primitive's outcome into a person-readable error or a clean success. `already`
-- is NOT an error: if a co-rep decided it a second before you, you wanted the
-- same outcome and the row is resolved — report it, don't alarm.
create or replace function public.decide_attendance(
  p_record_id uuid,
  p_decision public.attendance_decision,
  p_status public.attendance_status
)
returns table (record_id uuid, status public.attendance_status, was_already_decided boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_outcome text;
  v_status public.attendance_status;
begin
  v_outcome := public.attendance_decide_one(p_record_id, p_decision, p_status);

  if v_outcome = 'not_found' then
    raise exception 'That attendance record no longer exists.';
  elsif v_outcome = 'conflict' then
    raise exception 'You cannot decide your own attendance — a co-rep or the instructor must.'
      using errcode = 'insufficient_privilege';
  elsif v_outcome = 'not_authorized' then
    raise exception 'You are not authorised to decide attendance for this section.'
      using errcode = 'insufficient_privilege';
  elsif v_outcome = 'finalized' then
    raise exception 'This section is finalised; its attendance can no longer change.';
  end if;

  -- decided or already: return the record's current state either way.
  select ar.status into v_status from public.attendance_records ar where ar.id = p_record_id;
  return query select p_record_id, v_status, (v_outcome = 'already');
end;
$$;

revoke all on function public.decide_attendance(uuid, public.attendance_decision, public.attendance_status) from public;
grant execute on function public.decide_attendance(uuid, public.attendance_decision, public.attendance_status) to authenticated;


-- ── decide_attendance_bulk ───────────────────────────────────────────────────
--
-- The "approve all visible" / "reject all" action on the verify queue. Takes the
-- records with their pre-derived statuses as a jsonb array [{id, status}], one
-- uniform decision. Each row goes through the same primitive, so a conflict or
-- an already-decided row is SKIPPED and counted, never fatal to the batch — a
-- rep clearing 40 requests should not have the whole action fail because a
-- co-rep resolved one of them mid-swipe, or because one of the 40 is the rep's
-- own record.
--
-- Statuses are derived per row by the caller (deriveStatus) because present vs
-- late is a per-record timing question; the batch cannot share one status.
create or replace function public.decide_attendance_bulk(
  p_items jsonb,
  p_decision public.attendance_decision
)
returns table (decided integer, skipped integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_decided integer := 0;
  v_skipped integer := 0;
  v_item jsonb;
  v_outcome text;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'decide_attendance_bulk: p_items must be a json array of {id, status}';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_outcome := public.attendance_decide_one(
      (v_item->>'id')::uuid,
      p_decision,
      (v_item->>'status')::public.attendance_status
    );
    if v_outcome = 'decided' then
      v_decided := v_decided + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return query select v_decided, v_skipped;
end;
$$;

revoke all on function public.decide_attendance_bulk(jsonb, public.attendance_decision) from public;
grant execute on function public.decide_attendance_bulk(jsonb, public.attendance_decision) to authenticated;


-- ── The code is a secret-in-the-room ─────────────────────────────────────────
--
-- sessions_read (0011) lets an enrolled student read the session row so they can
-- see today's class. But the row carries session_code, and a student who can
-- SELECT the code does not need to BE in the room to submit — which is the whole
-- point of the possession factor (ADR-003). Row security cannot help here: the
-- student is allowed the row, just not that one column.
--
-- So take the column away from everyone. A bare column REVOKE does not do this —
-- table-level SELECT implicitly covers every column, and revoking one column
-- while the table grant stands leaves the privilege in place. The only way to
-- withhold a column is to revoke the table grant and re-grant the columns you DO
-- want. After this, the ONLY reads of session_code are report_present (which
-- validates it) and rotate_session_code (which shows it to a section's
-- administrators) — both SECURITY DEFINER, both reading it as the function
-- owner, neither handing it to a student. code_rotated_at stays readable: a bare
-- timestamp reveals nothing without the code.
--
-- anon has no grant on this table (0014) and gets none here. The column list is
-- resolved at migration time; a future column is readable only once a later
-- migration grants it, which is the safe default for a table with a secret in it.
do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ')
  into v_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'attendance_sessions'
    and column_name <> 'session_code';

  revoke select on public.attendance_sessions from authenticated;
  execute format('grant select (%s) on public.attendance_sessions to authenticated', v_cols);
end $$;

-- ── Realtime ─────────────────────────────────────────────────────────────────
--
-- The rep queue is fed by Supabase Realtime (§2.1): a new submission appears in
-- the queue the moment it lands. Realtime honours RLS, so each subscriber gets
-- only rows a SELECT would return them — a rep their sections' records, a student
-- their own. Publishing is not a new grant; records_read_* (0011) still decides
-- every row.
--
-- attendance_sessions is deliberately NOT published. A realtime change payload
-- carries the whole row, column revokes and all — so publishing it would stream
-- session_code to every enrolled subscriber on each 30-second rotation, undoing
-- the revoke directly above. The student's live card needs no realtime: it
-- counts down locally from a server anchor and reconciles on navigation.
alter publication supabase_realtime add table public.attendance_records;
