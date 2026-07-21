-- 04 — Session generation, cancellation and closures.
--
-- The integrity concern here is retroactive cancellation: a course rep who missed a
-- lecture must not be able to cancel it afterwards and erase their own absence
-- (D-020, time-boxed by D-057).

begin;
\ir fixtures/world.psql

select plan(19);

-- A Monday 09:00-11:00 lecture, repeating all semester.
insert into public.timetable_entries
  (semester_id, class_id, course_id, room_id, lecturer_id, day_of_week, starts_at, ends_at)
values (t.oid('semester'), t.oid('classA'), t.oid('course'), t.oid('room'),
        t.oid('lecturer'), 1, '09:00', '11:00');

-- A closure over the first Monday of the semester, declared before generation.
create or replace function t.first_monday() returns date
language sql stable as $$
  select min(d)::date
    from generate_series((select starts_on from public.semesters where id = t.oid('semester')),
                         (select ends_on   from public.semesters where id = t.oid('semester')),
                         interval '1 day') d
   where extract(isodow from d) = 1
$$;
grant execute on function t.first_monday() to public;

insert into public.holidays (name, kind, starts_on, ends_on)
values ('Founders Day', 'holiday', t.first_monday(), t.first_monday());

-- ---------------------------------------------------------------------------
-- Generation is the admin's alone
-- ---------------------------------------------------------------------------
set local role authenticated;
select t.login(t.uid('rep1'));
select throws_ok(
  format($$ select public.generate_sessions(%L) $$, t.oid('semester')),
  '42501', 'only an admin generates sessions',
  'a course rep cannot generate the semester''s sessions'
);

select t.login(t.uid('stud1'));
select throws_ok(
  format($$ select public.generate_sessions(%L) $$, t.oid('semester')),
  '42501', 'only an admin generates sessions',
  'nor can a student'
);

select t.login(t.uid('admin'));
select ok(
  (select public.generate_sessions(t.oid('semester')) > 0),
  'the admin generates the semester''s sessions'
);

reset role;
select ok((select count(*) > 5 from public.sessions), 'a term''s worth of sittings exists');

select ok(
  (select bool_and(extract(isodow from (s.starts_at at time zone 'Africa/Accra')) = 1)
     from public.sessions s),
  'every generated session falls on the timetabled weekday'
);

select is(
  (select count(*)::int from public.sessions s, public.semesters m
    where m.id = t.oid('semester')
      and (s.starts_at at time zone 'Africa/Accra')::date
          between m.exam_starts_on and m.exam_ends_on),
  0, 'no lectures are generated during the exam period'
);

select is(
  (select count(*)::int from public.sessions s
    where (s.starts_at at time zone 'Africa/Accra')::date = t.first_monday()),
  0, 'no lecture is generated on an institution-wide closure'
);

select is(
  (select to_char(min(s.starts_at) at time zone 'Africa/Accra', 'HH24:MI') from public.sessions s),
  '09:00', 'the timetabled local time survives generation'
);

-- Re-running after a timetable edit tops up rather than duplicating.
set local role authenticated;
select t.login(t.uid('admin'));
select is(
  (select public.generate_sessions(t.oid('semester')))::int,
  0, 'a second run creates nothing: generation is idempotent'
);

-- ---------------------------------------------------------------------------
-- Cancelling a session
-- ---------------------------------------------------------------------------
reset role;

-- The cancellation tests below need ad-hoc sessions placed around `now()`, and a
-- class cannot be in two places at once. If the suite happens to run on the
-- timetabled weekday, the generated sitting for today occupies that ground and the
-- inserts fail — so which day CI runs on decides whether the suite passes. Clear it.
-- Deleted rather than cancelled: cancelled sessions are exempt from the overlap
-- constraint, so generation would simply recreate it.
delete from public.sessions s
 where s.class_id = t.oid('classA')
   and tstzrange(s.starts_at, s.ends_at)
       && tstzrange(now() - interval '3 hours', now() + interval '3 hours');

-- security definer so the id resolves the same for every caller: a student of
-- another class cannot see this session at all under RLS, and looking it up as them
-- would yield null and test the lookup rather than the authorisation.
create or replace function t.future_session() returns uuid
language sql stable security definer as $$
  select id from public.sessions
   where starts_at > now() and status <> 'cancelled'
   order by starts_at limit 1
$$;
grant execute on function t.future_session() to public;

insert into t.ctx (session_id) values (t.live_session());

set local role authenticated;
select t.login(t.uid('stud1'));
select throws_ok(
  format($$ select public.cancel_session(%L, 'no lecturer') $$, t.future_session()),
  '42501', 'only a course rep for this class, or an admin, may cancel this session',
  'a student cannot cancel a lecture'
);

select t.login(t.uid('outsider'));
select throws_ok(
  format($$ select public.cancel_session(%L, 'no lecturer') $$, t.future_session()),
  '42501', 'only a course rep for this class, or an admin, may cancel this session',
  'nor can a rep of another class'
);

select t.login(t.uid('rep1'));
select throws_ok(
  format($$ select public.cancel_session(%L, '  ') $$, t.future_session()),
  '23514', 'a cancellation must give a reason',
  'a cancellation with no reason is refused'
);

select lives_ok(
  format($$ select public.cancel_session(%L, 'lecturer travelling') $$, t.future_session()),
  'a course rep can cancel an upcoming lecture for their own class'
);

-- Attendance having opened no longer locks the rep out (D-057): this session began
-- five minutes ago, well inside the 45-minute grace, and a lecturer who leaves after
-- twenty minutes is exactly the case the rep is there to record.
select t.login(t.uid('rep1'));
select public.open_attendance_window(t.session());
select lives_ok(
  format($$ select public.cancel_session(%L, 'lecturer left after twenty minutes') $$,
         t.session()),
  'a rep can call off a lecture inside the grace even after attendance opened'
);

-- The one that matters, and the reason the grace is time-boxed rather than removed:
-- past it, cancelling is how a rep erases their own absence.
reset role;
insert into public.sessions (semester_id, class_id, course_id, room_id, lecturer_id,
                             starts_at, ends_at)
values (t.oid('semester'), t.oid('classA'), t.oid('course'), t.oid('room'),
        t.oid('lecturer'), now() - interval '90 minutes', now() - interval '30 minutes');

create or replace function t.stale_session() returns uuid
language sql stable security definer as $$
  select id from public.sessions
   where starts_at = now() - interval '90 minutes' and status <> 'cancelled'
   limit 1
$$;
grant execute on function t.stale_session() to public;

set local role authenticated;
select t.login(t.uid('rep1'));
select throws_ok(
  format($$ select public.cancel_session(%L, 'actually we did not meet') $$,
         t.stale_session()),
  '42501',
  'a lecture can only be called off in its first 45 minutes; after that only an admin can cancel it',
  'ninety minutes later the rep can no longer make the lecture disappear'
);

select t.login(t.uid('admin'));
select lives_ok(
  format($$ select public.cancel_session(%L, 'fire alarm, session abandoned') $$,
         t.stale_session()),
  'an admin still can, and it is recorded as a class-scope cancellation'
);

-- ---------------------------------------------------------------------------
-- Institution-wide closures cascade
-- ---------------------------------------------------------------------------
select t.login(t.uid('rep1'));
select throws_ok(
  $$ select public.declare_holiday('Strike', 'emergency', current_date, current_date + 7) $$,
  '42501', 'only an admin declares a closure',
  'a course rep cannot declare an institution-wide closure'
);

select t.login(t.uid('admin'));
select ok(
  (select public.declare_holiday('Strike', 'emergency',
                                 current_date + 1, current_date + 40) > 0),
  'an admin declares an emergency closure and it cancels the sessions it covers'
);

reset role;
select is(
  (select count(*)::int from public.sessions s
    where s.status <> 'cancelled'
      and (s.starts_at at time zone 'Africa/Accra')::date
          between current_date + 1 and current_date + 40),
  0, 'no session inside the closure is left standing'
);

select * from finish();
rollback;
