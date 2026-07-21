-- 05 — The auto-open fallback (D-053).
--
-- The failure being covered: a course rep forgets to open attendance, and the whole
-- class is stranded with no record and no dispute to raise, because a dispute needs a
-- record to point at.

begin;
\ir fixtures/world.psql

select plan(16);

-- classA's lecture: began 25 minutes ago, ends in 5. No window — the rep never came.
-- It ends soon on purpose, so the fallback's window has to be clamped to the lecture
-- rather than running the full first_window_minutes past the end of it.
-- classB needs a room of its own: two cohorts cannot occupy one lecture hall at the
-- same time, and the schema enforces that.
insert into public.rooms (id, name)
values ('00000000-0000-0000-0000-0000000000f1', 'Lecture Hall 2');

create or replace function t.mk_session(p_class uuid, p_room uuid,
                                        p_from interval, p_to interval)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.sessions (semester_id, class_id, course_id, room_id, lecturer_id,
                               starts_at, ends_at)
  values (t.oid('semester'), p_class, t.oid('course'), p_room, t.oid('lecturer'),
          now() + p_from, now() + p_to)
  returning id into v_id;
  return v_id;
end $$;

insert into t.ctx (session_id)
values (t.mk_session(t.oid('classA'), t.oid('room'),
                     interval '-25 minutes', interval '5 minutes'));

-- classB: one lecture already over, one only just begun.
create table t.b (label text primary key, id uuid not null);
grant select on t.b to public;
insert into t.b values
  ('over',  t.mk_session(t.oid('classB'), '00000000-0000-0000-0000-0000000000f1',
                         interval '-70 minutes', interval '-10 minutes')),
  ('fresh', t.mk_session(t.oid('classB'), '00000000-0000-0000-0000-0000000000f1',
                         interval '-5 minutes',  interval '55 minutes'));
create or replace function t.b_id(p text) returns uuid
language sql stable as $$ select id from t.b where label = p $$;
grant execute on function t.b_id(text) to public;

select is(
  (select count(*)::int from public.attendance_windows where session_id = t.session()),
  0, 'the rep never opened attendance: the session has no window'
);

-- ---------------------------------------------------------------------------
-- The fallback fires
-- ---------------------------------------------------------------------------
set local role authenticated;
select t.login(t.uid('stud1'));

select lives_ok(
  format($$ select public.submit_attendance(%L, %s, %s, 12.0, 'd-stud1') $$,
         t.session(), t.on_campus_lat(), t.on_campus_lng()),
  'a student is no longer stranded by a rep who forgot'
);

reset role;
select is(
  (select count(*)::int from public.attendance_windows where session_id = t.session()),
  1, 'the submission opened exactly one window'
);

select ok(
  (select auto_opened from public.attendance_windows where session_id = t.session()),
  'the window is marked auto_opened, so a rep who never opens attendance is countable'
);

select ok(
  (select opened_by is null from public.attendance_windows where session_id = t.session()),
  'and nobody is credited with opening it, because nobody did'
);

select is(
  (select w.closes_at from public.attendance_windows w where w.session_id = t.session()),
  (select s.ends_at from public.sessions s where s.id = t.session()),
  'the window is clamped to the lecture: it never outlives the session'
);

select is(
  (select status from public.sessions where id = t.session()),
  'held', 'the session counts as held — attendance was taken'
);

select is(
  (select count(*)::int from public.attendance_flags f
     join public.attendance_checkins c on c.id = f.checkin_id
    where c.student_id = t.uid('stud1') and f.flag = 'auto_opened_window'),
  1, 'the check-in is flagged: no one was in the room to witness it'
);

select is(
  (select status from public.attendance_records
    where session_id = t.session() and student_id = t.uid('stud1')),
  'pending', 'the record still lands pending — the rep decides it, as always'
);

select ok(
  (select count(*) = 1 from public.audit_log
    where entity = 'attendance_window' and action = 'auto_opened'),
  'the fallback firing is written to the audit log'
);

-- The geofence is untouched: this is the lock the fallback deliberately keeps.
set local role authenticated;
select t.login(t.uid('stud2'));
select throws_ok(
  format($$ select public.submit_attendance(%L, %s, %s, 10.0, 'd-stud2') $$,
         t.session(), t.off_campus_lat(), t.off_campus_lng()),
  '23514', null,
  'an auto-opened window still refuses a submission from off campus'
);

select lives_ok(
  format($$ select public.submit_attendance(%L, %s, %s, 10.0, 'd-stud2') $$,
         t.session(), t.on_campus_lat(), t.on_campus_lng()),
  'a second student joins the same auto-opened window'
);

reset role;
select is(
  (select count(*)::int from public.attendance_windows where session_id = t.session()),
  1, 'and does not open another one'
);

-- ---------------------------------------------------------------------------
-- Where the fallback deliberately does NOT fire
-- ---------------------------------------------------------------------------
-- Once a window has existed, the rep is present and engaged; the later top-up
-- windows are theirs to open. Otherwise a student could wait for the first window to
-- close and quietly open the next one.
-- Wind the window back rather than just closing it: closes_at must stay after
-- opened_at, which the schema enforces.
update public.attendance_windows
   set opened_at = now() - interval '20 minutes',
       closes_at = now() - interval '1 minute'
 where session_id = t.session();

set local role authenticated;
select t.login(t.uid('watcher'));
select throws_ok(
  format($$ select public.submit_attendance(%L, %s, %s, 10.0, 'd-watcher') $$,
         t.session(), t.on_campus_lat(), t.on_campus_lng()),
  '23514', 'attendance is not open for this session right now',
  'a closed window is not re-opened by the fallback'
);

select t.login(t.uid('outsider'));
select throws_ok(
  format($$ select public.submit_attendance(%L, %s, %s, 10.0, 'd-out') $$,
         t.b_id('fresh'), t.on_campus_lat(), t.on_campus_lng()),
  '23514', 'attendance is not open for this session right now',
  'the fallback waits: five minutes in, the rep still has time to open it themselves'
);

select throws_ok(
  format($$ select public.submit_attendance(%L, %s, %s, 10.0, 'd-out') $$,
         t.b_id('over'), t.on_campus_lat(), t.on_campus_lng()),
  '23514', 'attendance is not open for this session right now',
  'and it never fires once the lecture is over'
);

select * from finish();
rollback;
