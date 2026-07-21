-- 0016 — Absence as a recorded verdict, and the course rep's cancellation grace.
--
-- Two changes, both requested by the project owner:
--
--   1. A student who never submits is marked 'absent'. Until now absence was the
--      absence of evidence — no row at all — which meant nothing to show the student,
--      nothing to dispute, and a denominator that had to be inferred (D-055).
--   2. A course rep may call off a lecture within its first 45 minutes, even after
--      attendance has opened. D-020 previously locked them out the moment a window
--      existed.

-- ---------------------------------------------------------------------------
-- Policy: the rep's cancellation grace.
--
-- A setting rather than a literal, like every other threshold here (D-013). 45 is
-- the default the owner asked for, not a law of nature — a faculty whose lectures
-- run 50 minutes will want a different number.
-- ---------------------------------------------------------------------------
alter table public.attendance_settings
  add column rep_cancel_grace_minutes integer not null default 45,
  add constraint settings_rep_cancel_grace_valid
    check (rep_cancel_grace_minutes between 0 and 240);

comment on column public.attendance_settings.rep_cancel_grace_minutes is
  'How long after a lecture starts a course rep may still call it off. Past this, '
  'cancellation is admin-only: a rep who sat through a lecture and then cancelled it '
  'would be erasing attendance that had already happened, including their own.';

-- ---------------------------------------------------------------------------
-- Records: 'absent' becomes a real verdict.
-- ---------------------------------------------------------------------------
alter table public.attendance_records
  drop constraint records_status_valid,
  add  constraint records_status_valid check (status in ('pending', 'approved', 'rejected', 'absent'));

alter table public.attendance_records
  drop constraint records_route_valid,
  add  constraint records_route_valid check (verification_route is null or verification_route in (
    'course_rep',                              -- the normal path
    'watcher',                                 -- a course rep's own attendance
    'self_approved_watcher_declared_absent',   -- watcher said in-app they'd be away
    'self_approved_watcher_timeout',           -- watcher silent past the timeout
    'admin_dispute',                           -- set by an upheld dispute
    'no_submission'                            -- nobody decided this: nothing was submitted
  ));

-- Absence means exactly one thing: no submission. A record that points at a check-in
-- cannot be absent, whatever a future code path believes, and an absent record can
-- never acquire a check-in or a lateness. Stated as a constraint because this is the
-- definition of the status, not a rule some function is trusted to remember.
alter table public.attendance_records
  add constraint records_absent_has_no_checkin check (
    status <> 'absent' or (first_checkin_id is null and minutes_late is null)
  );

comment on column public.attendance_records.status is
  'pending — submitted, awaiting a verifier. approved / rejected — a verifier decided. '
  'absent — the student never submitted, written when the rep finishes the session. '
  'Absent records carry a dispute deadline like any other verdict: a flat battery is '
  'exactly the case the dispute route exists for.';

-- The roster lookup that marking absentees performs, once per finalised session.
create index profiles_class_id_idx on public.profiles (class_id);

-- ---------------------------------------------------------------------------
-- Sessions: whether attendance has been wrapped up.
-- ---------------------------------------------------------------------------
alter table public.sessions
  add column attendance_finalised_at timestamptz,
  add column finalised_by uuid references auth.users (id) on delete set null,

  -- Only a lecture that actually ran can be finalised. A cancellation clears the
  -- stamp (see the trigger below), so the two can never both be true.
  add constraint sessions_finalised_only_when_held check (
    attendance_finalised_at is null or status = 'held'
  );

comment on column public.sessions.attendance_finalised_at is
  'Set when a course rep finishes the session: every student on the roster who did '
  'not submit now has an absent record. Also the idempotence guard — finalising '
  'twice marks nobody twice.';

-- ---------------------------------------------------------------------------
-- Effective settings, now carrying the grace. The return type changes, so this is a
-- drop rather than a replace; Postgres does not track callers of a function body, so
-- the functions below pick up the new signature on their own.
-- ---------------------------------------------------------------------------
drop function public.effective_settings(uuid);

create function public.effective_settings(target_class uuid)
returns table (
  first_window_minutes      integer,
  window_duration_minutes   integer,
  windows_per_session       smallint,
  auto_open_after_minutes   integer,
  gps_accuracy_floor_m      integer,
  watcher_timeout_hours     integer,
  dispute_window_minutes    integer,
  max_disputes_per_semester smallint,
  rep_cancel_grace_minutes  integer,
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
    coalesce(c.rep_cancel_grace_minutes,  g.rep_cancel_grace_minutes),
    g.campus_center,
    g.campus_radius_m
  from public.attendance_settings g
  left join public.attendance_settings c on c.class_id = target_class
  where g.class_id is null;
$$;

-- ---------------------------------------------------------------------------
-- Finishing a session: everyone who did not submit is absent.
--
-- Deliberately an explicit act by the rep rather than a scheduled sweep. There is no
-- background process in this system by design (D-054), and the moment absences become
-- real is the moment someone accountable says the session is over — which is the same
-- person who just worked through the pending queue.
-- ---------------------------------------------------------------------------
create or replace function public.finalise_session_attendance(p_session uuid)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_session public.sessions;
  v_set     record;
  v_marked  integer;
begin
  select * into v_session from public.sessions where id = p_session;
  if not found then
    raise exception 'session not found' using errcode = 'no_data_found';
  end if;

  if not (public.is_course_rep(v_session.class_id) or public.is_admin()) then
    raise exception 'only a course rep for this class may finish a session'
      using errcode = 'insufficient_privilege';
  end if;

  if v_session.status = 'cancelled' then
    raise exception 'this session was cancelled; there is no attendance to finish'
      using errcode = 'check_violation';
  end if;

  if now() < v_session.ends_at then
    raise exception 'this lecture has not finished yet' using errcode = 'check_violation';
  end if;

  -- The D-055 rule, enforced at the only point where it can be: a lecture where
  -- attendance never opened is one nobody could have recorded, so marking its whole
  -- cohort absent would punish every student for a failure that was never theirs.
  -- Checked after the clock, so a session still running says so rather than
  -- complaining that the rep has not opened attendance they may be about to open.
  if v_session.status <> 'held' then
    raise exception 'attendance never opened for this session, so nobody can be marked absent'
      using errcode = 'check_violation';
  end if;

  -- A rep-opened window is not clamped to the lecture, so one can still be running
  -- after ends_at. Marking absentees while a student can legitimately still submit
  -- would be marking them absent for being slow to reach for their phone.
  if exists (
    select 1 from public.attendance_windows w
     where w.session_id = p_session and now() < w.closes_at
  ) then
    raise exception 'attendance is still open for this session'
      using errcode = 'check_violation';
  end if;

  -- Idempotent: the second rep to tap finish marks nobody a second time.
  if v_session.attendance_finalised_at is not null then
    return 0;
  end if;

  select * into v_set from public.effective_settings(v_session.class_id);

  with marked as (
    insert into public.attendance_records
      (session_id, student_id, status, decided_at, decided_by,
       verification_route, dispute_deadline)
    select p_session, p.id, 'absent', now(), (select auth.uid()), 'no_submission',
           -- Same clock as every other verdict (D-018): the student's hour runs from
           -- the moment the absence was recorded, not from the end of the lecture.
           now() + (v_set.dispute_window_minutes || ' minutes')::interval
      from public.profiles p
     where p.class_id = v_session.class_id
       -- Nobody is absent from a lecture that happened before they existed here.
       and p.created_at < v_session.ends_at
       and not exists (
         select 1 from public.attendance_records r
          where r.session_id = p_session and r.student_id = p.id
       )
    on conflict (session_id, student_id) do nothing
    returning 1
  )
  select count(*)::integer into v_marked from marked;

  update public.sessions
     set attendance_finalised_at = now(),
         finalised_by            = (select auth.uid())
   where id = p_session;

  perform public.write_audit('session', p_session, 'attendance_finalised', null,
    jsonb_build_object('marked_absent', v_marked));

  return v_marked;
end $$;

-- ---------------------------------------------------------------------------
-- A cancelled session holds no attendance.
--
-- A trigger rather than a line inside cancel_session(), because the invariant has to
-- survive every path that cancels — the rep's call-off, an admin's, and the holiday
-- cascade — including paths not yet written. The check-ins are deliberately left
-- alone: they are the evidence that fifteen people were in that room, which is
-- exactly what makes a rep who cancels lectures they did attend visible.
-- ---------------------------------------------------------------------------
create or replace function public.void_attendance_on_cancellation()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_voided   integer;
  v_disputes integer;
begin
  select count(*)::integer into v_disputes
    from public.disputes d
    join public.attendance_records r on r.id = d.record_id
   where r.session_id = new.id;

  with gone as (
    delete from public.attendance_records r where r.session_id = new.id returning 1
  )
  select count(*)::integer into v_voided from gone;

  -- Whatever was wrapped up is unwrapped: the records it produced no longer exist.
  new.attendance_finalised_at := null;
  new.finalised_by            := null;

  if v_voided > 0 then
    perform public.write_audit('session', new.id, 'attendance_voided_by_cancellation',
      jsonb_build_object('records_voided', v_voided, 'disputes_voided', v_disputes), null);
  end if;

  return new;
end $$;

create trigger void_attendance_on_cancellation
  before update of status on public.sessions
  for each row
  when (new.status = 'cancelled' and old.status is distinct from 'cancelled')
  execute function public.void_attendance_on_cancellation();

-- ---------------------------------------------------------------------------
-- Cancelling a session — replaces the 0014 version.
--
-- D-020 let a rep cancel only before attendance opened. That was too tight: a
-- lecturer who turns up, talks for twenty minutes and leaves produces a session that
-- was opened and should not count, and only an admin could say so. The rule is now
-- time-boxed instead — a rep may call off a lecture inside its first
-- rep_cancel_grace_minutes, whether or not a window exists.
--
-- The original worry survives intact past that point: a retroactive cancellation is
-- how a rep erases their own absence, so after the grace it is admin-only.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_session(p_session uuid, p_reason text)
returns public.session_cancellations
language plpgsql security definer set search_path = '' as $$
declare
  v_session public.sessions;
  v_set     record;
  v_row     public.session_cancellations;
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

  select * into v_set from public.effective_settings(v_session.class_id);

  if not public.is_admin() then
    if not public.is_course_rep(v_session.class_id) then
      raise exception 'only a course rep for this class, or an admin, may cancel this session'
        using errcode = 'insufficient_privilege';
    end if;

    if now() >= v_session.starts_at
               + (v_set.rep_cancel_grace_minutes || ' minutes')::interval then
      raise exception
        'a lecture can only be called off in its first % minutes; after that only an admin can cancel it',
        v_set.rep_cancel_grace_minutes
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Voiding any attendance already recorded is the trigger's job, so that it happens
  -- on every path into 'cancelled' rather than only this one.
  update public.sessions set status = 'cancelled' where id = p_session;

  insert into public.session_cancellations (session_id, scope, reason, cancelled_by)
  values (p_session, 'class', btrim(p_reason), (select auth.uid()))
  returning * into v_row;

  perform public.write_audit('session', p_session, 'cancelled', null, to_jsonb(v_row));
  return v_row;
end $$;

-- ---------------------------------------------------------------------------
revoke execute on function
  public.effective_settings(uuid),
  public.finalise_session_attendance(uuid),
  public.void_attendance_on_cancellation()
from public, anon;

-- void_attendance_on_cancellation is a trigger body: it runs as the table owner and
-- is never called directly, so it is granted to nobody.
grant execute on function
  public.effective_settings(uuid),
  public.finalise_session_attendance(uuid)
to authenticated;
