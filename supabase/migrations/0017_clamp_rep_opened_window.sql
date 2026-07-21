-- 0017 — Clamp the rep-opened attendance window to its lecture (D-058).
--
-- `0015` clamped the auto-opened window with the reason that applies just as well
-- here: "a window still open after the session ends is a window for submitting from
-- somewhere else." The rep-opened path never got the same treatment, so a rep who
-- opened attendance five minutes before the end left a window running for another
-- twenty-five after the room had emptied — submittable from anywhere on campus, by
-- anyone whose friend was still there.
--
-- Two lines change. The end-of-session guard becomes strict, so that a window can
-- never be born already expired, and closes_at is bounded by the lecture.

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

  if now() < v_session.starts_at then
    raise exception 'the session has not started yet' using errcode = 'check_violation';
  end if;

  -- Strict, where 0013 allowed now() = ends_at. At that instant the clamp below
  -- would produce closes_at = opened_at, and a window with no life in it is not a
  -- window; it would fail the schema's own check with a confusing message.
  if now() >= v_session.ends_at then
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
    -- shorter top-ups for latecomers. Neither outlives the lecture itself (D-058).
    least(
      now() + (case when v_seq = 1
                    then v_set.first_window_minutes
                    else v_set.window_duration_minutes end || ' minutes')::interval,
      v_session.ends_at
    )
  )
  returning * into v_window;

  update public.sessions set status = 'held' where id = p_session and status = 'scheduled';

  perform public.write_audit('attendance_window', v_window.id, 'opened', null,
    to_jsonb(v_window));
  return v_window;
end $$;
