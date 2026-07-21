-- 03 — Disputes: the student's only recourse, and the only door through which a
-- decided record may change.
--
-- The rule worth testing hardest is D-017: the per-semester cap counts disputes the
-- student LOST. A student wrongly rejected three times must not run out of recourse
-- while being right every time.

begin;
\ir fixtures/world.psql

select plan(19);

insert into t.ctx (session_id) values (t.live_session());

set local role authenticated;
select t.login(t.uid('rep1'));
select public.open_attendance_window(t.session());
select t.login(t.uid('stud1'));
select public.submit_attendance(t.session(), t.on_campus_lat(), t.on_campus_lng(), 10.0, 'd1');
select t.login(t.uid('stud2'));
select public.submit_attendance(t.session(), t.on_campus_lat(), t.on_campus_lng(), 10.0, 'd2');

-- stud1 is rejected; stud2 is left pending.
select t.login(t.uid('rep1'));
select public.decide_attendance(
  (select id from public.attendance_records
    where session_id = t.session() and student_id = t.uid('stud1')),
  false, 'not seen in the hall');

reset role;
create table t.rec (label text primary key, id uuid not null);
grant select on t.rec to public;
insert into t.rec (label, id)
select 'r1', id from public.attendance_records
 where session_id = t.session() and student_id = t.uid('stud1');
insert into t.rec (label, id)
select 'pending', id from public.attendance_records
 where session_id = t.session() and student_id = t.uid('stud2');

create or replace function t.rec_id(p text) returns uuid
language sql stable as $$ select id from t.rec where label = p $$;
grant execute on function t.rec_id(text) to public;

-- Two more rejected records for stud1, on their own sessions, so the cap has
-- something to count. Written as the owner: this is fixture, not behaviour.
create or replace function t.extra_rejection(p_label text, p_offset interval) returns void
language plpgsql as $$
declare v_session uuid; v_rec uuid;
begin
  insert into public.sessions (semester_id, class_id, course_id, room_id, lecturer_id,
                               starts_at, ends_at)
  values (t.oid('semester'), t.oid('classA'), t.oid('course'), t.oid('room'),
          t.oid('lecturer'), now() - p_offset, now() - p_offset + interval '50 minutes')
  returning id into v_session;

  insert into public.attendance_records
    (session_id, student_id, status, decided_at, decided_by, verification_route,
     rejection_reason, dispute_deadline)
  values (v_session, t.uid('stud1'), 'rejected', now(), t.uid('rep1'), 'course_rep',
          'not seen', now() + interval '1 hour')
  returning id into v_rec;

  insert into t.rec (label, id) values (p_label, v_rec);
end $$;

select t.extra_rejection('r2', interval '1 day');
select t.extra_rejection('r3', interval '2 days');

-- ---------------------------------------------------------------------------
-- Who may dispute what
-- ---------------------------------------------------------------------------
set local role authenticated;
select t.login(t.uid('stud2'));
select throws_ok(
  format($$ select public.raise_dispute(%L, 'I was there') $$, t.rec_id('r1')),
  '42501', 'you can only dispute your own attendance',
  'a student cannot dispute someone else''s record'
);

select throws_ok(
  format($$ select public.raise_dispute(%L, 'I was there') $$, t.rec_id('pending')),
  '23514', 'this record has not been decided yet, so there is nothing to dispute',
  'a pending record cannot be disputed — there is no decision yet'
);

select t.login(t.uid('stud1'));
select throws_ok(
  format($$ select public.raise_dispute(%L, '  ') $$, t.rec_id('r1')),
  '23514', 'a dispute must give a reason',
  'a dispute with no reason is refused'
);

select lives_ok(
  format($$ select public.raise_dispute(%L, 'I was in the front row') $$, t.rec_id('r1')),
  'a student can dispute their own rejected record'
);

select throws_ok(
  format($$ select public.raise_dispute(%L, 'asking again') $$, t.rec_id('r1')),
  '23505', null,
  'a student cannot stack a second open dispute on the same record'
);

-- ---------------------------------------------------------------------------
-- Resolution is the admin's, never the rep who made the original call
-- ---------------------------------------------------------------------------
reset role;
update t.ctx set dispute_id = (select id from public.disputes where record_id = t.rec_id('r1'));

set local role authenticated;
select t.login(t.uid('rep1'));
select throws_ok(
  format($$ select public.resolve_dispute(%L, false, 'stands') $$, t.dispute()),
  '42501', 'only an admin resolves disputes',
  'the rep who made the decision cannot judge the complaint about it'
);

select t.login(t.uid('stud1'));
select throws_ok(
  format($$ select public.resolve_dispute(%L, true, 'I am right') $$, t.dispute()),
  '42501', 'only an admin resolves disputes',
  'nor can the student resolve it in their own favour'
);

select t.login(t.uid('admin'));
select throws_ok(
  format($$ select public.resolve_dispute(%L, false, '') $$, t.dispute()),
  '23514', 'a resolution must be recorded',
  'an admin must say why, even when declining'
);

select lives_ok(
  format($$ select public.resolve_dispute(%L, false, 'register shows absent') $$, t.dispute()),
  'the admin can decline the dispute'
);

reset role;
select is((select status from public.attendance_records where id = t.rec_id('r1')),
          'rejected', 'a declined dispute leaves the original decision standing');
select is((select outcome from public.disputes where id = t.dispute()),
          'declined', 'and the dispute is closed as declined');

-- ---------------------------------------------------------------------------
-- The cap, and what it counts
-- ---------------------------------------------------------------------------
set local role authenticated;
select t.login(t.uid('stud1'));
select lives_ok(
  format($$ select public.raise_dispute(%L, 'second complaint') $$, t.rec_id('r2')),
  'a second dispute is within the per-semester cap of 2'
);

select throws_ok(
  format($$ select public.raise_dispute(%L, 'third complaint') $$, t.rec_id('r3')),
  '23514', 'you have used all 2 disputes for this semester',
  'a third is refused: one declined plus one still open fills the cap'
);

-- Now the student WINS the open one. It stops counting, and their recourse returns.
reset role;
update t.ctx set dispute_id = (select id from public.disputes where record_id = t.rec_id('r2'));

set local role authenticated;
select t.login(t.uid('admin'));
select lives_ok(
  format($$ select public.resolve_dispute(%L, true, 'lecturer confirms attendance') $$, t.dispute()),
  'the admin can uphold a dispute'
);

reset role;
select is((select status from public.attendance_records where id = t.rec_id('r2')),
          'approved', 'an upheld dispute corrects the record');
select is((select verification_route from public.attendance_records where id = t.rec_id('r2')),
          'admin_dispute', 'and the correction is attributed to the dispute, not to a rep');
select ok((select rejection_reason is null from public.attendance_records where id = t.rec_id('r2')),
          'the stale rejection reason is cleared');
select ok(
  (select count(*) = 1 from public.audit_log
    where entity = 'attendance_record' and action = 'corrected_by_dispute'),
  'the correction is written to the audit log with its before-state');

-- The point of D-017: winning gave the recourse back.
set local role authenticated;
select t.login(t.uid('stud1'));
select lives_ok(
  format($$ select public.raise_dispute(%L, 'third complaint, retried') $$, t.rec_id('r3')),
  'a dispute the student WON does not count against the cap'
);

select * from finish();
rollback;
