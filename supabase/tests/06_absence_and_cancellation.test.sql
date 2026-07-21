-- 06 — Absence as a verdict, and the course rep's cancellation grace (0016).
--
-- Two failures being covered:
--   * a student who never submitted had no row at all, so there was nothing to show
--     them, nothing to dispute, and nothing to count;
--   * a lecturer who spoke for twenty minutes and left produced a session that had
--     opened attendance and could no longer be called off by the rep who watched it
--     happen.

begin;
\ir fixtures/world.psql

select plan(29);

-- The roster predates the lectures, as a real cohort does. Without this every
-- profile in the fixture is younger than the sessions below and the "nobody is absent
-- from a lecture that happened before they existed here" rule excludes all of them.
update public.profiles set created_at = now() - interval '30 days';

create or replace function t.mk_session(p_from interval, p_to interval)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.sessions (semester_id, class_id, course_id, room_id, lecturer_id,
                               starts_at, ends_at)
  values (t.oid('semester'), t.oid('classA'), t.oid('course'), t.oid('room'),
          t.oid('lecturer'), now() + p_from, now() + p_to)
  returning id into v_id;
  return v_id;
end $$;
grant execute on function t.mk_session(interval, interval) to public;

create table t.s (label text primary key, id uuid not null);
grant select on t.s to public;
create or replace function t.s_id(p text) returns uuid
language sql stable as $$ select id from t.s where label = p $$;
grant execute on function t.s_id(text) to public;

-- ---------------------------------------------------------------------------
-- The session to finish. Built live so the real write path produces the window,
-- the check-in and the record, then wound back so the lecture is over. classA
-- cannot hold two overlapping sessions, so this one is aged before the rest exist.
-- ---------------------------------------------------------------------------
insert into t.s values ('done', t.mk_session(interval '-5 minutes', interval '55 minutes'));

set local role authenticated;
select t.login(t.uid('rep1'));
select public.open_attendance_window(t.s_id('done'));

select t.login(t.uid('stud1'));
select public.submit_attendance(t.s_id('done'), t.on_campus_lat(), t.on_campus_lng(),
                                12.0, 'd-stud1');
reset role;

update public.sessions
   set starts_at = now() - interval '230 minutes', ends_at = now() - interval '170 minutes'
 where id = t.s_id('done');
update public.attendance_windows
   set opened_at = now() - interval '230 minutes', closes_at = now() - interval '200 minutes'
 where session_id = t.s_id('done');

-- The rest of classA's day, none of it overlapping.
insert into t.s values
  ('never',     t.mk_session(interval '-300 minutes', interval '-240 minutes')),
  ('stillopen', t.mk_session(interval '-160 minutes', interval '-100 minutes')),
  ('stale',     t.mk_session(interval  '-90 minutes', interval  '-50 minutes')),
  -- Twenty minutes left to run, against a 30-minute first window: short on purpose,
  -- so opening attendance has to be clamped to the lecture (D-058).
  ('live',      t.mk_session(interval  '-10 minutes', interval  '20 minutes'));

-- 'stillopen' ran and ended, but the window the rep opened outlives it: a rep-opened
-- window is not clamped to the lecture the way an auto-opened one is.
update public.sessions set status = 'held' where id = t.s_id('stillopen');
insert into public.attendance_windows (session_id, sequence, opened_by, closes_at)
values (t.s_id('stillopen'), 1, t.uid('rep1'), now() + interval '5 minutes');

-- A student who joined the university today. They cannot have attended this morning.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000',
        '00000000-0000-0000-0000-0000000000d9', 'authenticated', 'authenticated',
        '1000009@upsamail.edu.gh', '', now(), now());
insert into public.profiles (id, full_name, index_number, email, class_id)
values ('00000000-0000-0000-0000-0000000000d9', 'Latecomer', '1000009',
        '1000009@upsamail.edu.gh'::extensions.citext, t.oid('classA'));

-- ---------------------------------------------------------------------------
-- Who may finish a session, and when
-- ---------------------------------------------------------------------------
set local role authenticated;
select t.login(t.uid('stud1'));
select throws_ok(
  format($$ select public.finalise_session_attendance(%L) $$, t.s_id('done')),
  '42501', null,
  'an ordinary student cannot finish a session and mark their classmates absent'
);

select t.login(t.uid('rep1'));

select throws_ok(
  format($$ select public.finalise_session_attendance(%L) $$, t.s_id('live')),
  '23514', 'this lecture has not finished yet',
  'a session still running cannot be finished'
);

select throws_ok(
  format($$ select public.finalise_session_attendance(%L) $$, t.s_id('never')),
  '23514', 'attendance never opened for this session, so nobody can be marked absent',
  'a lecture nobody could record marks nobody absent (D-055)'
);

select throws_ok(
  format($$ select public.finalise_session_attendance(%L) $$, t.s_id('stillopen')),
  '23514', 'attendance is still open for this session',
  'nobody is marked absent while a window is open and they could still submit'
);

-- ---------------------------------------------------------------------------
-- Finishing the session
-- ---------------------------------------------------------------------------
-- classA holds rep1, rep2, watcher, stud1, stud2 and today's latecomer. stud1
-- submitted; the latecomer did not exist yet. That leaves four.
select is(
  (select public.finalise_session_attendance(t.s_id('done'))),
  4, 'everyone on the roster who did not submit is marked absent'
);

reset role;

select is(
  (select status from public.attendance_records
    where session_id = t.s_id('done') and student_id = t.uid('stud2')),
  'absent', 'a student who never submitted now has a record saying so'
);

select is(
  (select status from public.attendance_records
    where session_id = t.s_id('done') and student_id = t.uid('stud1')),
  'pending', 'and a student who did submit is left exactly as they were'
);

select is(
  (select count(*)::int from public.attendance_records
    where session_id = t.s_id('done')
      and student_id = '00000000-0000-0000-0000-0000000000d9'),
  0, 'a student who joined after the lecture is not absent from it'
);

select is(
  (select count(*)::int from public.attendance_records r
     join public.profiles p on p.id = r.student_id
    where r.session_id = t.s_id('done') and p.class_id = t.oid('classB')),
  0, 'and another class is untouched'
);

select ok(
  (select first_checkin_id is null and minutes_late is null
     from public.attendance_records
    where session_id = t.s_id('done') and student_id = t.uid('stud2')),
  'an absent record points at no check-in, because there was none'
);

select is(
  (select verification_route from public.attendance_records
    where session_id = t.s_id('done') and student_id = t.uid('stud2')),
  'no_submission', 'the route records that nobody decided this — nothing was submitted'
);

select ok(
  (select dispute_deadline > now() from public.attendance_records
    where session_id = t.s_id('done') and student_id = t.uid('stud2')),
  'an absence is disputable: a flat battery is what the dispute route is for'
);

select is(
  (select status from public.attendance_records
    where session_id = t.s_id('done') and student_id = t.uid('rep1')),
  'absent', 'a course rep who forgets their own attendance is absent like anyone else'
);

select ok(
  (select attendance_finalised_at is not null and finalised_by = t.uid('rep1')
     from public.sessions where id = t.s_id('done')),
  'the session records that it was wrapped up, and by whom'
);

select ok(
  (select count(*) = 1 from public.audit_log
    where entity = 'session' and action = 'attendance_finalised'
      and after ->> 'marked_absent' = '4'),
  'finishing the session is written to the audit log with the count'
);

-- ---------------------------------------------------------------------------
-- Idempotence — three reps share a class, and any of them may tap finish
-- ---------------------------------------------------------------------------
set local role authenticated;
select t.login(t.uid('rep2'));
select is(
  (select public.finalise_session_attendance(t.s_id('done'))),
  0, 'the second rep to finish the session marks nobody a second time'
);

reset role;
select is(
  (select count(*)::int from public.attendance_records
    where session_id = t.s_id('done') and status = 'absent'),
  4, 'and the absences are unchanged'
);

-- ---------------------------------------------------------------------------
-- Disputing an absence
-- ---------------------------------------------------------------------------
set local role authenticated;
select t.login(t.uid('stud2'));
select lives_ok(
  format($$ select public.raise_dispute(
              (select id from public.attendance_records
                where session_id = %L and student_id = %L), 'my phone died in the hall')
         $$, t.s_id('done'), t.uid('stud2')),
  'a student marked absent can challenge it'
);

reset role;
select is(
  (select count(*)::int from public.disputes d
     join public.attendance_records r on r.id = d.record_id
    where r.session_id = t.s_id('done') and d.state = 'open'),
  1, 'and the dispute is open for the admin to judge'
);

-- ---------------------------------------------------------------------------
-- The rep's cancellation grace
-- ---------------------------------------------------------------------------
-- 'live' began ten minutes ago. The rep opens attendance, a student submits, and
-- then the lecturer leaves — which is exactly the case D-020 could not express.
set local role authenticated;
select t.login(t.uid('rep1'));
select public.open_attendance_window(t.s_id('live'));

reset role;
-- The first window is 30 minutes and this lecture has 20 left. A window that
-- outlives its lecture is a window for submitting from somewhere else (D-058).
select is(
  (select w.closes_at from public.attendance_windows w where w.session_id = t.s_id('live')),
  (select s.ends_at   from public.sessions s          where s.id         = t.s_id('live')),
  'a rep-opened window is clamped to the lecture, exactly as an auto-opened one is'
);

set local role authenticated;
select t.login(t.uid('stud1'));
select public.submit_attendance(t.s_id('live'), t.on_campus_lat(), t.on_campus_lng(),
                                12.0, 'd-stud1');

reset role;
select is(
  (select count(*)::int from public.attendance_records where session_id = t.s_id('live')),
  1, 'attendance opened and one student recorded it'
);

set local role authenticated;
select t.login(t.uid('rep1'));
select lives_ok(
  format($$ select public.cancel_session(%L, 'the lecturer left after twenty minutes') $$,
         t.s_id('live')),
  'the rep can still call off a lecture inside the grace, after attendance opened'
);

reset role;
select is(
  (select status from public.sessions where id = t.s_id('live')),
  'cancelled', 'the session is cancelled'
);

select is(
  (select count(*)::int from public.attendance_records where session_id = t.s_id('live')),
  0, 'and the attendance it had already collected is voided with it'
);

select is(
  (select count(*)::int from public.attendance_checkins c
     join public.attendance_windows w on w.id = c.window_id
    where w.session_id = t.s_id('live')),
  1, 'but the check-ins survive — they are the evidence someone was in that room'
);

select ok(
  (select count(*) = 1 from public.audit_log
    where entity = 'session' and action = 'attendance_voided_by_cancellation'
      and before ->> 'records_voided' = '1'),
  'and the voiding is on the record'
);

-- ---------------------------------------------------------------------------
-- Past the grace, the original worry returns: this is how a rep erases an absence
-- ---------------------------------------------------------------------------
set local role authenticated;
select t.login(t.uid('rep1'));
select throws_ok(
  format($$ select public.cancel_session(%L, 'we did not really have this one') $$,
         t.s_id('stale')),
  '42501', null,
  'ninety minutes in, the rep can no longer cancel the lecture'
);

select t.login(t.uid('admin'));
select lives_ok(
  format($$ select public.cancel_session(%L, 'timetabling error, confirmed with the faculty') $$,
         t.s_id('stale')),
  'the admin still can'
);

-- A cancelled session cannot then be finished either.
select t.login(t.uid('rep1'));
select throws_ok(
  format($$ select public.finalise_session_attendance(%L) $$, t.s_id('stale')),
  '23514', 'this session was cancelled; there is no attendance to finish',
  'and a cancelled lecture marks nobody absent'
);

select * from finish();
rollback;
