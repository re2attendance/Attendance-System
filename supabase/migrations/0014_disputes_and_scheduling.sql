-- 0014 — Disputes, session generation, cancellations.

-- ---------------------------------------------------------------------------
-- Raising a dispute.
--
-- Two limits, and they interact deliberately (D-017, D-018):
--   * one hour from the DECISION, not from the end of class
--   * a per-semester cap that counts only disputes the student LOST
-- ---------------------------------------------------------------------------
create or replace function public.raise_dispute(p_record uuid, p_reason text)
returns public.disputes
language plpgsql security definer set search_path = '' as $$
declare
  v_student uuid := (select auth.uid());
  v_record  public.attendance_records;
  v_session public.sessions;
  v_set     record;
  v_used    integer;
  v_dispute public.disputes;
begin
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'a dispute must give a reason' using errcode = 'check_violation';
  end if;

  select * into v_record from public.attendance_records where id = p_record;
  if not found then
    raise exception 'attendance record not found' using errcode = 'no_data_found';
  end if;
  if v_record.student_id <> v_student then
    raise exception 'you can only dispute your own attendance'
      using errcode = 'insufficient_privilege';
  end if;
  if v_record.status = 'pending' then
    raise exception 'this record has not been decided yet, so there is nothing to dispute'
      using errcode = 'check_violation';
  end if;
  if now() > v_record.dispute_deadline then
    raise exception 'the window to dispute this decision closed at %', v_record.dispute_deadline
      using errcode = 'check_violation';
  end if;

  select * into v_session from public.sessions where id = v_record.session_id;
  select * into v_set from public.effective_settings(v_session.class_id);

  -- Only disputes the student lost count against the cap. A dispute they won is the
  -- system correcting an error; counting it would mean a student wrongly rejected
  -- three times runs out of recourse while being right every time.
  select count(*) into v_used
    from public.disputes d
   where d.student_id = v_student
     and d.semester_id = v_session.semester_id
     and (d.state = 'open' or d.outcome = 'declined');

  if v_used >= v_set.max_disputes_per_semester then
    raise exception 'you have used all % disputes for this semester', v_set.max_disputes_per_semester
      using errcode = 'check_violation';
  end if;

  insert into public.disputes (record_id, student_id, semester_id, reason)
  values (p_record, v_student, v_session.semester_id, btrim(p_reason))
  returning * into v_dispute;

  perform public.write_audit('dispute', v_dispute.id, 'raised', null, to_jsonb(v_dispute));
  return v_dispute;
end $$;

-- ---------------------------------------------------------------------------
-- Resolving a dispute — admin only (D-016).
--
-- Not the rep who made the original call: if they judged their own decisions they
-- could simply decline everything, and the "wins don't count" rule above could never
-- fire. This is also the only path by which a decided record may change at all.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_dispute(
  p_dispute uuid, p_uphold boolean, p_resolution text
) returns public.disputes
language plpgsql security definer set search_path = '' as $$
declare
  v_dispute public.disputes;
  v_before  jsonb;
  v_rec_before jsonb;
  v_record  public.attendance_records;
begin
  if not public.is_admin() then
    raise exception 'only an admin resolves disputes' using errcode = 'insufficient_privilege';
  end if;
  if p_resolution is null or length(btrim(p_resolution)) = 0 then
    raise exception 'a resolution must be recorded' using errcode = 'check_violation';
  end if;

  select * into v_dispute from public.disputes where id = p_dispute;
  if not found then
    raise exception 'dispute not found' using errcode = 'no_data_found';
  end if;
  if v_dispute.state <> 'open' then
    raise exception 'this dispute is already resolved' using errcode = 'check_violation';
  end if;

  v_before := to_jsonb(v_dispute);

  update public.disputes
     set state = 'resolved',
         outcome = case when p_uphold then 'upheld' else 'declined' end,
         resolution = btrim(p_resolution),
         resolved_by = (select auth.uid()),
         resolved_at = now()
   where id = p_dispute
  returning * into v_dispute;

  if p_uphold then
    select to_jsonb(r) into v_rec_before
      from public.attendance_records r where r.id = v_dispute.record_id;

    update public.attendance_records
       set status = 'approved',
           rejection_reason = null,
           verification_route = 'admin_dispute',
           decided_by = (select auth.uid()),
           decided_at = now()
     where id = v_dispute.record_id
    returning * into v_record;

    perform public.write_audit('attendance_record', v_dispute.record_id,
      'corrected_by_dispute', v_rec_before, to_jsonb(v_record));
  end if;

  perform public.write_audit('dispute', p_dispute,
    case when p_uphold then 'upheld' else 'declined' end, v_before, to_jsonb(v_dispute));
  return v_dispute;
end $$;

-- ---------------------------------------------------------------------------
-- Generating sessions from the weekly timetable (D-021).
--
-- Materialised rather than computed, because attendance, cancellations, disputes and
-- audit entries all need a stable session_id to point at. Skips the exam period —
-- lectures do not run then — and institution-wide closures.
--
-- Times are interpreted in Africa/Accra, which is UTC+0 all year with no daylight
-- saving, so a 09:00 lecture is 09:00 to everyone reading it.
-- ---------------------------------------------------------------------------
create or replace function public.generate_sessions(p_semester uuid)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_sem      public.semesters;
  v_entry    public.timetable_entries;
  v_day      date;
  v_created  integer := 0;
begin
  if not public.is_admin() then
    raise exception 'only an admin generates sessions' using errcode = 'insufficient_privilege';
  end if;

  select * into v_sem from public.semesters where id = p_semester;
  if not found then
    raise exception 'semester not found' using errcode = 'no_data_found';
  end if;

  for v_entry in
    select * from public.timetable_entries where semester_id = p_semester
  loop
    for v_day in
      select d::date
        from generate_series(v_sem.starts_on, v_sem.ends_on, interval '1 day') d
       where extract(isodow from d) = v_entry.day_of_week
         -- no lectures during exams
         and not (d::date between v_sem.exam_starts_on and v_sem.exam_ends_on)
         -- nor on an institution-wide closure
         and not exists (
           select 1 from public.holidays h
            where d::date between h.starts_on and h.ends_on
         )
    loop
      begin
        insert into public.sessions
          (timetable_entry_id, semester_id, class_id, course_id, room_id, lecturer_id,
           starts_at, ends_at)
        values (
          v_entry.id, p_semester, v_entry.class_id, v_entry.course_id,
          v_entry.room_id, v_entry.lecturer_id,
          ((v_day + v_entry.starts_at) at time zone 'Africa/Accra'),
          ((v_day + v_entry.ends_at)   at time zone 'Africa/Accra')
        );
        v_created := v_created + 1;
      exception
        -- A clash with an existing session (same class or same room, overlapping)
        -- is skipped rather than fatal, so re-running after a timetable edit tops
        -- up the missing sittings instead of failing on the first collision.
        when exclusion_violation then null;
      end;
    end loop;
  end loop;

  perform public.write_audit('session', p_semester, 'sessions_generated', null,
    jsonb_build_object('created', v_created));
  return v_created;
end $$;

-- ---------------------------------------------------------------------------
-- Cancelling a session.
--
-- A course rep may cancel their own class's session, but only before attendance has
-- opened (D-020). After that it is admin-only: a rep who missed a lecture could
-- otherwise cancel it afterwards and erase their own absence.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_session(p_session uuid, p_reason text)
returns public.session_cancellations
language plpgsql security definer set search_path = '' as $$
declare
  v_session public.sessions;
  v_row     public.session_cancellations;
  v_opened  boolean;
begin
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'a cancellation must give a reason' using errcode = 'check_violation';
  end if;

  select * into v_session from public.sessions where id = p_session;
  if not found then
    raise exception 'session not found' using errcode = 'no_data_found';
  end if;
  if v_session.status = 'cancelled' then
    raise exception 'this session is already cancelled' using errcode = 'check_violation';
  end if;

  v_opened := exists (select 1 from public.attendance_windows w where w.session_id = p_session);

  if not public.is_admin() then
    if not public.is_course_rep(v_session.class_id) then
      raise exception 'only a course rep for this class, or an admin, may cancel this session'
        using errcode = 'insufficient_privilege';
    end if;
    if v_opened then
      raise exception 'attendance has already opened for this session; only an admin can cancel it now'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  update public.sessions set status = 'cancelled' where id = p_session;

  insert into public.session_cancellations (session_id, scope, reason, cancelled_by)
  values (p_session, 'class', btrim(p_reason), (select auth.uid()))
  returning * into v_row;

  perform public.write_audit('session', p_session, 'cancelled', null, to_jsonb(v_row));
  return v_row;
end $$;

-- ---------------------------------------------------------------------------
-- Declaring an institution-wide closure, cascading to the sessions it covers.
-- ---------------------------------------------------------------------------
create or replace function public.declare_holiday(
  p_name text, p_kind text, p_starts date, p_ends date
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_holiday public.holidays;
  v_count   integer := 0;
begin
  if not public.is_admin() then
    raise exception 'only an admin declares a closure' using errcode = 'insufficient_privilege';
  end if;

  insert into public.holidays (name, kind, starts_on, ends_on, created_by)
  values (p_name, p_kind, p_starts, p_ends, (select auth.uid()))
  returning * into v_holiday;

  with affected as (
    update public.sessions s
       set status = 'cancelled'
     where s.status <> 'cancelled'
       and (s.starts_at at time zone 'Africa/Accra')::date between p_starts and p_ends
    returning s.id
  ),
  logged as (
    insert into public.session_cancellations (session_id, scope, holiday_id, reason, cancelled_by)
    select a.id, 'institution', v_holiday.id, p_name, (select auth.uid()) from affected a
    on conflict (session_id) do nothing
    returning session_id
  )
  select count(*) into v_count from logged;

  perform public.write_audit('holiday', v_holiday.id, 'declared', null,
    jsonb_build_object('name', p_name, 'kind', p_kind, 'sessions_cancelled', v_count));
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
revoke execute on function
  public.raise_dispute(uuid, text), public.resolve_dispute(uuid, boolean, text),
  public.generate_sessions(uuid), public.cancel_session(uuid, text),
  public.declare_holiday(text, text, date, date)
from public, anon;

grant execute on function
  public.raise_dispute(uuid, text), public.resolve_dispute(uuid, boolean, text),
  public.generate_sessions(uuid), public.cancel_session(uuid, text),
  public.declare_holiday(text, text, date, date)
to authenticated;
