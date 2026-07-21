-- 0013 — The attendance write path.
--
-- Everything here is SECURITY DEFINER, because RLS denies the client every write on
-- these tables (0012). That inverts the usual burden: these functions are the only
-- door, so each one must authorise its own caller. None of them trusts an argument
-- it can derive itself — not the time, not the distance, not the student's identity.

-- ---------------------------------------------------------------------------
-- Watcher absence (Q4).
--
-- "He decides in-app that he will be absent today; if he failed to do so, 2 hours
-- into the lecture consider him absent." Two distinct causes, both recorded, so a
-- course rep self-approving is always an auditable event and never a silent bypass.
-- ---------------------------------------------------------------------------
create table public.watcher_absences (
  id           uuid primary key default gen_random_uuid(),
  watcher_id   uuid not null references auth.users (id) on delete cascade,
  class_id     uuid not null references public.classes (id) on delete cascade,
  absent_on    date not null,
  reason       text,
  declared_at  timestamptz not null default now(),
  unique (watcher_id, class_id, absent_on)
);

alter table public.watcher_absences enable row level security;
grant select on public.watcher_absences to authenticated;

create policy read_class_watcher_absences on public.watcher_absences
  for select to authenticated
  using (public.is_admin() or class_id = public.my_class_id());

comment on table public.watcher_absences is
  'A watcher declaring in advance that they will not be verifying today. Written '
  'through declare_watcher_absence(); never by the client directly.';

-- ---------------------------------------------------------------------------
-- Effective settings: the class override falling back to the institution default
-- (D-013). Every threshold in this file comes from here, never from a literal.
-- ---------------------------------------------------------------------------
create or replace function public.effective_settings(target_class uuid)
returns table (
  first_window_minutes      integer,
  window_duration_minutes   integer,
  windows_per_session       smallint,
  auto_open_after_minutes   integer,
  gps_accuracy_floor_m      integer,
  watcher_timeout_hours     integer,
  dispute_window_minutes    integer,
  max_disputes_per_semester smallint,
  campus_center             extensions.geography,
  campus_radius_m           integer
)
language sql stable security definer set search_path = '' as $$
  select
    coalesce(c.first_window_minutes,      g.first_window_minutes),
    coalesce(c.window_duration_minutes,   g.window_duration_minutes),
    coalesce(c.windows_per_session,       g.windows_per_session),
    coalesce(c.auto_open_after_minutes,   g.auto_open_after_minutes),
    coalesce(c.gps_accuracy_floor_m,      g.gps_accuracy_floor_m),
    coalesce(c.watcher_timeout_hours,     g.watcher_timeout_hours),
    coalesce(c.dispute_window_minutes,    g.dispute_window_minutes),
    coalesce(c.max_disputes_per_semester, g.max_disputes_per_semester),
    g.campus_center,
    g.campus_radius_m
  from public.attendance_settings g
  left join public.attendance_settings c on c.class_id = target_class
  where g.class_id is null;
$$;

-- ---------------------------------------------------------------------------
-- Audit. Called only from the functions below, all of which run as owner.
-- ---------------------------------------------------------------------------
create or replace function public.write_audit(
  p_entity text, p_entity_id uuid, p_action text, p_before jsonb, p_after jsonb
) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, entity, entity_id, action, before, after)
  values ((select auth.uid()), p_entity, p_entity_id, p_action, p_before, p_after);
$$;

-- ---------------------------------------------------------------------------
-- Opening attendance.
--
-- The rep taps this when they are in the room. The window then runs for an
-- admin-configured duration, and a session may have several of them so a student
-- who arrived late can still record attendance (D-012).
-- ---------------------------------------------------------------------------
create or replace function public.open_attendance_window(p_session uuid)
returns public.attendance_windows
language plpgsql security definer set search_path = '' as $$
declare
  v_session public.sessions;
  v_set     record;
  v_seq     smallint;
  v_window  public.attendance_windows;
begin
  select * into v_session from public.sessions where id = p_session;
  if not found then
    raise exception 'session not found' using errcode = 'no_data_found';
  end if;
  if v_session.status = 'cancelled' then
    raise exception 'this session was cancelled' using errcode = 'check_violation';
  end if;

  if not (public.is_course_rep(v_session.class_id) or public.is_admin()) then
    raise exception 'only a course rep for this class may open attendance'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_set from public.effective_settings(v_session.class_id);

  -- Cannot open before the lecture, nor after it has finished: a window that
  -- outlives the session is a window for submitting from somewhere else.
  if now() < v_session.starts_at then
    raise exception 'the session has not started yet' using errcode = 'check_violation';
  end if;
  if now() > v_session.ends_at then
    raise exception 'the session has already ended' using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.attendance_windows w
     where w.session_id = p_session and now() < w.closes_at
  ) then
    raise exception 'attendance is already open for this session'
      using errcode = 'unique_violation';
  end if;

  select coalesce(max(w.sequence), 0) + 1 into v_seq
    from public.attendance_windows w where w.session_id = p_session;

  if v_seq > v_set.windows_per_session then
    raise exception 'attendance has already been opened % time(s) for this session',
      v_set.windows_per_session using errcode = 'check_violation';
  end if;

  insert into public.attendance_windows (session_id, sequence, opened_by, closes_at)
  values (
    p_session, v_seq, (select auth.uid()),
    -- The first window covers the opening minutes of the lecture; later ones are
    -- shorter top-ups for latecomers.
    now() + (case when v_seq = 1
                  then v_set.first_window_minutes
                  else v_set.window_duration_minutes end || ' minutes')::interval
  )
  returning * into v_window;

  update public.sessions set status = 'held' where id = p_session and status = 'scheduled';

  perform public.write_audit('attendance_window', v_window.id, 'opened', null,
    to_jsonb(v_window));
  return v_window;
end $$;

-- ---------------------------------------------------------------------------
-- Submitting attendance — the hostile path.
--
-- The client sends coordinates. It does not send a time, a distance, a status, or
-- whose attendance this is; all four are derived here. See
-- docs/02-ATTENDANCE-INTEGRITY.md for why the geofence is a deterrent rather than
-- proof, and why the shared-device flag is the control that actually bites.
-- ---------------------------------------------------------------------------
create or replace function public.submit_attendance(
  p_session     uuid,
  p_latitude    double precision default null,
  p_longitude   double precision default null,
  p_accuracy_m  real             default null,
  p_device_hash text             default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_student  uuid := (select auth.uid());
  v_profile  public.profiles;
  v_session  public.sessions;
  v_window   public.attendance_windows;
  v_set      record;
  v_point    extensions.geography;
  v_distance real;
  v_checkin  public.attendance_checkins;
  v_record   public.attendance_records;
  v_late     integer;
  v_shared   uuid;
begin
  select * into v_profile from public.profiles where id = v_student;
  if not found then
    raise exception 'only students may submit attendance'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_session from public.sessions where id = p_session;
  if not found then
    raise exception 'session not found' using errcode = 'no_data_found';
  end if;
  if v_session.class_id <> v_profile.class_id then
    raise exception 'this session belongs to another class'
      using errcode = 'insufficient_privilege';
  end if;
  if v_session.status = 'cancelled' then
    raise exception 'this session was cancelled' using errcode = 'check_violation';
  end if;

  -- Server clock only. A window that is not open right now cannot be submitted to,
  -- whatever the client believes the time to be.
  select * into v_window
    from public.attendance_windows w
   where w.session_id = p_session
     and now() >= w.opened_at and now() < w.closes_at
   order by w.sequence desc
   limit 1;
  if not found then
    raise exception 'attendance is not open for this session right now'
      using errcode = 'check_violation';
  end if;

  select * into v_set from public.effective_settings(v_session.class_id);

  -- Geofence. Build plan §7.2 requires the check to gate submission, so this
  -- rejects rather than flags — but it subtracts the reported accuracy first, so a
  -- student is only turned away when they are outside the fence even allowing for
  -- their phone's own margin of error. Rejecting an honest student sitting in the
  -- lecture hall because of a 40m indoor GPS wobble would be worse than useless.
  if v_set.campus_center is not null then
    if p_latitude is null or p_longitude is null then
      raise exception 'location is required to submit attendance'
        using errcode = 'check_violation';
    end if;

    v_point := extensions.st_setsrid(
                 extensions.st_makepoint(p_longitude, p_latitude), 4326
               )::extensions.geography;
    v_distance := extensions.st_distance(v_point, v_set.campus_center);

    if v_distance - coalesce(p_accuracy_m, 0) > v_set.campus_radius_m then
      raise exception 'you appear to be % metres from campus', round(v_distance)
        using errcode = 'check_violation';
    end if;
  end if;

  insert into public.attendance_checkins
    (window_id, student_id, location, gps_accuracy_m, distance_m, device_hash)
  values (v_window.id, v_student, v_point, p_accuracy_m, v_distance, p_device_hash)
  returning * into v_checkin;

  -- ---- anomalies, for the rep's queue -------------------------------------
  if p_latitude is null then
    insert into public.attendance_flags (checkin_id, flag) values (v_checkin.id, 'no_location');
  end if;

  if p_accuracy_m is not null and p_accuracy_m > v_set.gps_accuracy_floor_m then
    insert into public.attendance_flags (checkin_id, flag, details)
    values (v_checkin.id, 'low_gps_accuracy', jsonb_build_object('accuracy_m', p_accuracy_m));
  end if;

  if v_distance is not null and v_distance > v_set.campus_radius_m then
    insert into public.attendance_flags (checkin_id, flag, details)
    values (v_checkin.id, 'outside_geofence', jsonb_build_object('distance_m', round(v_distance)));
  end if;

  -- The one that matters. One phone submitting for two students in the same window
  -- is the signature of the fraud this system exists to stop, and no location check
  -- can see it. Both submissions are flagged: the rep is in the room and can tell
  -- which of the two people is actually sitting there.
  if p_device_hash is not null then
    select c.id into v_shared
      from public.attendance_checkins c
     where c.window_id = v_window.id
       and c.device_hash = p_device_hash
       and c.student_id <> v_student
     limit 1;

    if v_shared is not null then
      insert into public.attendance_flags (checkin_id, flag, details)
      values (v_checkin.id, 'shared_device', jsonb_build_object('other_checkin', v_shared))
      on conflict do nothing;
      insert into public.attendance_flags (checkin_id, flag, details)
      values (v_shared, 'shared_device', jsonb_build_object('other_checkin', v_checkin.id))
      on conflict do nothing;
    end if;
  end if;

  -- ---- the record ---------------------------------------------------------
  v_late := floor(extract(epoch from (now() - v_session.starts_at)) / 60);

  insert into public.attendance_records
    (session_id, student_id, minutes_late, first_checkin_id)
  values (p_session, v_student, v_late, v_checkin.id)
  on conflict (session_id, student_id) do nothing
  returning * into v_record;

  if v_record is null then
    select * into v_record from public.attendance_records
     where session_id = p_session and student_id = v_student;
  end if;

  perform public.write_audit('attendance_record', v_record.id, 'submitted', null,
    jsonb_build_object('minutes_late', v_record.minutes_late, 'window', v_window.sequence));

  return jsonb_build_object(
    'record_id',    v_record.id,
    'status',       v_record.status,
    'minutes_late', v_record.minutes_late,
    'window',       v_window.sequence
  );
end $$;

-- ---------------------------------------------------------------------------
-- Deciding attendance.
--
-- Routing (build plan §6, §7.3):
--   a student's record        -> a course rep of that class
--   a course rep's own record -> the watcher
--   watcher absent            -> the rep may self-approve, permanently stamped
--   nobody decided in time    -> escalates to watcher, then admin (D-019)
-- ---------------------------------------------------------------------------
create or replace function public.decide_attendance(
  p_record  uuid,
  p_approve boolean,
  p_reason  text default null
) returns public.attendance_records
language plpgsql security definer set search_path = '' as $$
declare
  v_record   public.attendance_records;
  v_session  public.sessions;
  v_set      record;
  v_is_rep_record boolean;
  v_route    text;
  v_before   jsonb;
  v_watcher_absent boolean := false;
  v_overdue  boolean;
begin
  select * into v_record from public.attendance_records where id = p_record;
  if not found then
    raise exception 'attendance record not found' using errcode = 'no_data_found';
  end if;
  if v_record.status <> 'pending' then
    raise exception 'this record has already been decided; it can only change through a dispute'
      using errcode = 'check_violation';
  end if;

  select * into v_session from public.sessions where id = v_record.session_id;
  select * into v_set from public.effective_settings(v_session.class_id);

  v_is_rep_record := public.record_belongs_to_rep(p_record);
  v_overdue := now() > v_session.starts_at + (v_set.watcher_timeout_hours || ' hours')::interval;

  v_watcher_absent :=
    exists (
      select 1 from public.watcher_absences wa
       where wa.class_id = v_session.class_id
         and wa.absent_on = (v_session.starts_at at time zone 'UTC')::date
    )
    or not exists (
      select 1 from public.role_assignments ra
       where ra.class_id = v_session.class_id
         and ra.role = 'watcher' and ra.revoked_at is null
    );

  -- ---- who is allowed to decide this? -------------------------------------
  if v_is_rep_record then
    if public.is_watcher(v_session.class_id) then
      v_route := 'watcher';
    elsif v_record.student_id = (select auth.uid())
          and public.is_course_rep(v_session.class_id)
          and (v_watcher_absent or v_overdue) then
      -- Permitted, but stamped forever on the record so it is countable rather
      -- than merely permitted (D-004 / Q4).
      v_route := case when v_watcher_absent
                      then 'self_approved_watcher_declared_absent'
                      else 'self_approved_watcher_timeout' end;
    elsif public.is_admin() and v_overdue then
      v_route := 'watcher';
    else
      raise exception 'a course rep''s own attendance is decided by the watcher'
        using errcode = 'insufficient_privilege';
    end if;
  else
    if public.is_course_rep(v_session.class_id) then
      v_route := 'course_rep';
    elsif public.is_watcher(v_session.class_id) and v_overdue then
      v_route := 'watcher';            -- escalation, D-019
    elsif public.is_admin() and v_overdue then
      v_route := 'admin_dispute';
    else
      raise exception 'only a course rep for this class may decide this attendance'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Nobody decides their own ordinary attendance.
  if not v_is_rep_record and v_record.student_id = (select auth.uid()) then
    raise exception 'you cannot decide your own attendance'
      using errcode = 'insufficient_privilege';
  end if;

  if not p_approve and (p_reason is null or length(btrim(p_reason)) = 0) then
    raise exception 'a rejection must give a reason, and the student is shown it'
      using errcode = 'check_violation';
  end if;

  v_before := to_jsonb(v_record);

  update public.attendance_records
     set status             = case when p_approve then 'approved' else 'rejected' end,
         decided_at         = now(),
         decided_by         = (select auth.uid()),
         verification_route = v_route,
         rejection_reason   = case when p_approve then null else btrim(p_reason) end,
         -- The dispute clock starts at the decision, not at the end of class:
         -- otherwise a rep deciding hours later leaves the student with an
         -- already-expired right to dispute something still pending (D-018).
         dispute_deadline   = now() + (v_set.dispute_window_minutes || ' minutes')::interval
   where id = p_record
  returning * into v_record;

  perform public.write_audit('attendance_record', p_record,
    case when p_approve then 'approved' else 'rejected' end, v_before, to_jsonb(v_record));

  return v_record;
end $$;

-- ---------------------------------------------------------------------------
create or replace function public.declare_watcher_absence(
  p_class uuid, p_date date default null, p_reason text default null
) returns public.watcher_absences
language plpgsql security definer set search_path = '' as $$
declare v_row public.watcher_absences;
begin
  if not public.is_watcher(p_class) then
    raise exception 'only this class''s watcher may declare an absence'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.watcher_absences (watcher_id, class_id, absent_on, reason)
  values ((select auth.uid()), p_class, coalesce(p_date, current_date), p_reason)
  on conflict (watcher_id, class_id, absent_on) do update set reason = excluded.reason
  returning * into v_row;

  perform public.write_audit('role_assignment', v_row.id, 'watcher_declared_absent',
    null, to_jsonb(v_row));
  return v_row;
end $$;

-- ---------------------------------------------------------------------------
revoke execute on function
  public.effective_settings(uuid), public.write_audit(text, uuid, text, jsonb, jsonb),
  public.open_attendance_window(uuid),
  public.submit_attendance(uuid, double precision, double precision, real, text),
  public.decide_attendance(uuid, boolean, text),
  public.declare_watcher_absence(uuid, date, text)
from public, anon;

-- write_audit is deliberately NOT granted to anyone: it exists for the functions
-- above, which run as owner and therefore do not need the grant.
grant execute on function
  public.effective_settings(uuid),
  public.open_attendance_window(uuid),
  public.submit_attendance(uuid, double precision, double precision, real, text),
  public.decide_attendance(uuid, boolean, text),
  public.declare_watcher_absence(uuid, date, text)
to authenticated;
