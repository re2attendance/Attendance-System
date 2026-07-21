-- 01 — Attendance capture: opening a window, and the hostile submission path.
--
-- Everything here runs as `authenticated` with a sub claim, i.e. exactly what a
-- browser holding a publishable key presents. If a check can be evaded from there,
-- it does not exist.

begin;
\ir fixtures/world.psql

select plan(23);

insert into t.ctx (session_id) values (t.live_session());

-- ---------------------------------------------------------------------------
-- Opening the window
-- ---------------------------------------------------------------------------
set local role authenticated;
select t.login(t.uid('stud1'));

select throws_ok(
  $$ select public.open_attendance_window(t.session()) $$,
  '42501',
  'only a course rep for this class may open attendance',
  'a student cannot open the attendance window'
);

select t.login(t.uid('outsider'));
select throws_ok(
  $$ select public.open_attendance_window(t.session()) $$,
  '42501', 'only a course rep for this class may open attendance',
  'a rep of another class cannot open this class''s window'
);

select t.login(t.uid('rep1'));
select lives_ok(
  $$ select public.open_attendance_window(t.session()) $$,
  'the class''s course rep can open attendance'
);

select is(
  (select count(*)::int from public.attendance_windows w where w.session_id = t.session()),
  1, 'opening produced exactly one window'
);

select throws_ok(
  $$ select public.open_attendance_window(t.session()) $$,
  '23505', 'attendance is already open for this session',
  'a rep cannot stack a second window on top of an open one'
);

reset role;
select is(
  (select status from public.sessions where id = t.session()),
  'held', 'opening attendance marks the session held'
);

-- ---------------------------------------------------------------------------
-- Submitting
-- ---------------------------------------------------------------------------
set local role authenticated;
select t.login(t.uid('stud1'));

select lives_ok(
  format($$ select public.submit_attendance(%L, %s, %s, 12.0, 'device-stud1') $$,
         t.session(), t.on_campus_lat(), t.on_campus_lng()),
  'a student inside the fence can submit'
);

reset role;
select is(
  (select status from public.attendance_records
    where session_id = t.session() and student_id = t.uid('stud1')),
  'pending', 'the submission lands as pending, never as approved'
);

select ok(
  (select minutes_late between 4 and 6 from public.attendance_records
    where session_id = t.session() and student_id = t.uid('stud1')),
  'lateness is computed server-side from the session start (~5 minutes)'
);

select is(
  (select count(*)::int from public.attendance_flags f
     join public.attendance_checkins c on c.id = f.checkin_id
    where c.student_id = t.uid('stud1')),
  0, 'a clean submission raises no flags'
);

-- The client sends coordinates and nothing else: distance is the server's answer.
select ok(
  (select distance_m < 50 from public.attendance_checkins
    where student_id = t.uid('stud1')),
  'distance is computed server-side from the campus fence'
);

-- ---------------------------------------------------------------------------
-- The checks that must not be evadable
-- ---------------------------------------------------------------------------
set local role authenticated;
select t.login(t.uid('stud2'));

select throws_ok(
  format($$ select public.submit_attendance(%L, %s, %s, 10.0, 'device-stud2') $$,
         t.session(), t.off_campus_lat(), t.off_campus_lng()),
  '23514', null,
  'a submission from 35km away is refused'
);

select throws_ok(
  format($$ select public.submit_attendance(%L, null, null, null, 'device-stud2') $$,
         t.session()),
  '23514', 'location is required to submit attendance',
  'a submission with the location stripped out is refused'
);

select t.login(t.uid('outsider'));
select throws_ok(
  format($$ select public.submit_attendance(%L, %s, %s, 10.0, 'device-out') $$,
         t.session(), t.on_campus_lat(), t.on_campus_lng()),
  '42501', 'this session belongs to another class',
  'a student of another class cannot submit to this session'
);

-- ---------------------------------------------------------------------------
-- One phone, two students — the fraud this system exists to stop
-- ---------------------------------------------------------------------------
select t.login(t.uid('stud2'));
select lives_ok(
  format($$ select public.submit_attendance(%L, %s, %s, 12.0, 'device-stud1') $$,
         t.session(), t.on_campus_lat(), t.on_campus_lng()),
  'a second student submitting from the same phone is accepted...'
);

reset role;
select is(
  (select count(*)::int from public.attendance_flags f
    where f.flag = 'shared_device'),
  2, '...and BOTH check-ins are flagged shared_device for the rep to look at'
);

-- ---------------------------------------------------------------------------
-- Accuracy and duplicates
-- ---------------------------------------------------------------------------
set local role authenticated;
select t.login(t.uid('watcher'));
select lives_ok(
  format($$ select public.submit_attendance(%L, %s, %s, 400.0, 'device-watcher') $$,
         t.session(), t.on_campus_lat(), t.on_campus_lng()),
  'a low-accuracy reading is accepted rather than rejected'
);

reset role;
select is(
  (select count(*)::int from public.attendance_flags f
     join public.attendance_checkins c on c.id = f.checkin_id
    where c.student_id = t.uid('watcher') and f.flag = 'low_gps_accuracy'),
  1, 'a reading worse than the accuracy floor is flagged for the rep'
);

set local role authenticated;
select t.login(t.uid('stud1'));
select throws_ok(
  format($$ select public.submit_attendance(%L, %s, %s, 12.0, 'device-stud1') $$,
         t.session(), t.on_campus_lat(), t.on_campus_lng()),
  '23505', null,
  'a student cannot submit twice into the same window'
);

-- ---------------------------------------------------------------------------
-- RLS: the ledger is not writable from the client, whatever the function allows
-- ---------------------------------------------------------------------------
select throws_ok(
  format($$ insert into public.attendance_records (session_id, student_id, status)
            values (%L, %L, 'approved') $$, t.session(), t.uid('stud1')),
  '42501', null,
  'a client cannot insert an approved record directly'
);

select throws_ok(
  format($$ update public.attendance_records set status = 'approved'
             where session_id = %L $$, t.session()),
  '42501', null,
  'a client cannot update a record directly'
);

select throws_ok(
  format($$ insert into public.attendance_checkins (window_id, student_id)
            select id, %L from public.attendance_windows $$, t.uid('stud1')),
  '42501', null,
  'a client cannot forge a check-in'
);

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------
reset role;
select ok(
  (select count(*) >= 3 from public.audit_log
    where entity = 'attendance_record' and action = 'submitted'),
  'every submission is written to the audit log'
);

select * from finish();
rollback;
