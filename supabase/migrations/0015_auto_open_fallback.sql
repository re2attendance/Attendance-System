-- 0015 — The auto-open fallback (closes D-053).
--
-- 0007 designed `auto_open_after_minutes` and `attendance_windows.auto_opened` for the
-- case where a course rep forgets to open attendance, and nothing implemented them.
-- Until now a rep who did not tap "open" stranded the whole class: a window can only
-- be opened while the lecture runs, so once it ended there was no way back. Those
-- students got no record at all — and since a dispute needs a record to point at,
-- they could not even complain.
--
-- The fallback fires on the first student's submission rather than from a scheduled
-- job. A background process would buy nothing here — nobody is in the room either way —
-- while adding the only always-on moving part in the system, one that fails silently.
--
-- What the fallback keeps is the lock that matters: the student must still be inside
-- the campus geofence, during the lecture's own time window. Signing in for an absent
-- friend still requires that friend to be on campus while the lecture runs. What it
-- gives up is the rep watching submissions arrive in real time — so every check-in
-- from such a window is flagged, and the rep still decides every record afterwards.

-- Check-ins nobody was in the room to witness. The rep's queue is meant to be sorted
-- by suspicion, and "no human opened this window" is exactly that.
alter table public.attendance_flags drop constraint flags_valid;
alter table public.attendance_flags add constraint flags_valid check (flag in (
  'shared_device',      -- same device as another student's submission in this window
  'low_gps_accuracy',   -- reading near the usable floor
  'outside_geofence',   -- submitted from beyond the campus fence
  'no_location',        -- location permission refused or unavailable
  'auto_opened_window'  -- the rep never opened attendance; no one witnessed this
));

comment on column public.attendance_windows.auto_opened is
  'True when the rep did not open attendance and the fallback fired on a student''s '
  'submission. Countable, so a rep who never opens attendance is visible rather than '
  'merely inconvenient — the fix for that is a conversation, not more code.';

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
  v_ever     boolean;
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

  select * into v_set from public.effective_settings(v_session.class_id);

  -- Server clock only. A window that is not open right now cannot be submitted to,
  -- whatever the client believes the time to be.
  select * into v_window
    from public.attendance_windows w
   where w.session_id = p_session
     and now() >= w.opened_at and now() < w.closes_at
   order by w.sequence desc
   limit 1;

  if not found then
    -- ---- the fallback ------------------------------------------------------
    -- Deliberately narrow: it fires only when NO window has ever existed for this
    -- session, which is exactly "the rep forgot". If the rep opened one and it has
    -- since closed, they are present and engaged, and the later top-up windows for
    -- latecomers are theirs to open. Without that restriction a student could wait
    -- for the first window to close and then open the next one themselves.
    select exists (
      select 1 from public.attendance_windows w where w.session_id = p_session
    ) into v_ever;

    if v_ever
       or now() < v_session.starts_at + (v_set.auto_open_after_minutes || ' minutes')::interval
       or now() >= v_session.ends_at
    then
      raise exception 'attendance is not open for this session right now'
        using errcode = 'check_violation';
    end if;

    insert into public.attendance_windows
      (session_id, sequence, opened_by, closes_at, auto_opened)
    values (
      p_session, 1, null,
      -- Never outlives the lecture: a window still open after the session has ended
      -- is a window for submitting from somewhere else.
      least(now() + (v_set.first_window_minutes || ' minutes')::interval,
            v_session.ends_at),
      true
    )
    on conflict (session_id, sequence) do nothing
    returning * into v_window;

    if v_window is null then
      -- Two students submitted at the same moment and the other one won the race.
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
    else
      update public.sessions set status = 'held'
       where id = p_session and status = 'scheduled';
      perform public.write_audit('attendance_window', v_window.id, 'auto_opened', null,
        to_jsonb(v_window));
    end if;
  end if;

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
  if v_window.auto_opened then
    insert into public.attendance_flags (checkin_id, flag)
    values (v_checkin.id, 'auto_opened_window');
  end if;

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
    'window',       v_window.sequence,
    'auto_opened',  v_window.auto_opened
  );
end $$;

revoke execute on function
  public.submit_attendance(uuid, double precision, double precision, real, text)
from public, anon;
grant execute on function
  public.submit_attendance(uuid, double precision, double precision, real, text)
to authenticated;
