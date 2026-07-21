-- 02 — The verification workflow: who is allowed to decide whose attendance.
--
-- This is where the paper sheet's failure mode reappears if the routing is wrong.
-- A course rep who can approve their own attendance is the old problem with a
-- login screen in front of it.

begin;
\ir fixtures/world.psql

select plan(22);

insert into t.ctx (session_id) values (t.live_session());

-- Everyone checks in: two ordinary students, and rep1, whose own record must route
-- to the watcher rather than to their fellow rep.
set local role authenticated;
select t.login(t.uid('rep1'));
select public.open_attendance_window(t.session());
select public.submit_attendance(t.session(), t.on_campus_lat(), t.on_campus_lng(), 10.0, 'd-rep1');
select t.login(t.uid('stud1'));
select public.submit_attendance(t.session(), t.on_campus_lat(), t.on_campus_lng(), 10.0, 'd-stud1');
select t.login(t.uid('stud2'));
select public.submit_attendance(t.session(), t.on_campus_lat(), t.on_campus_lng(), 10.0, 'd-stud2');

-- Record ids are resolved as the owner and cached, because RLS quite correctly stops
-- one student from seeing another's record at all. Looking the id up as the caller
-- would yield null and test nothing but the lookup.
reset role;
create table t.rec (who text primary key, id uuid not null);
grant select on t.rec to public;

create or replace function t.remember_records() returns void
language sql security definer as $$
  insert into t.rec (who, id)
  select w.name, r.id
    from public.attendance_records r
    join t.who w on w.id = r.student_id
   where r.session_id = t.session()
  on conflict (who) do nothing;
$$;
grant execute on function t.remember_records() to public;
select t.remember_records();

create or replace function t.record_of(p_who text) returns uuid
language sql stable as $$ select id from t.rec where who = p_who $$;
grant execute on function t.record_of(text) to public;

-- ---------------------------------------------------------------------------
-- The ordinary path
-- ---------------------------------------------------------------------------
set local role authenticated;
select t.login(t.uid('stud2'));
select throws_ok(
  format($$ select public.decide_attendance(%L, true) $$, t.record_of('stud1')),
  '42501', 'only a course rep for this class may decide this attendance',
  'a student cannot decide another student''s attendance'
);

select throws_ok(
  format($$ select public.decide_attendance(%L, true) $$, t.record_of('stud2')),
  '42501', 'only a course rep for this class may decide this attendance',
  'a student cannot approve themselves'
);

select t.login(t.uid('outsider'));
select throws_ok(
  format($$ select public.decide_attendance(%L, true) $$, t.record_of('stud1')),
  '42501', 'only a course rep for this class may decide this attendance',
  'a rep of another class cannot reach into this class''s queue'
);

select t.login(t.uid('rep1'));
select lives_ok(
  format($$ select public.decide_attendance(%L, true) $$, t.record_of('stud1')),
  'the class''s course rep can approve a student'
);

reset role;
select is((select status from public.attendance_records where id = t.record_of('stud1')),
          'approved', 'the record is approved');
select is((select verification_route from public.attendance_records where id = t.record_of('stud1')),
          'course_rep', 'and stamped with the route that decided it');
select ok((select decided_by = t.uid('rep1') and decided_at is not null
             from public.attendance_records where id = t.record_of('stud1')),
          'the decider is recorded, not inferable');
select ok((select dispute_deadline > now() from public.attendance_records where id = t.record_of('stud1')),
          'the dispute clock starts at the decision');

-- A decided record is closed. Only a dispute reopens it.
set local role authenticated;
select t.login(t.uid('rep1'));
select throws_ok(
  format($$ select public.decide_attendance(%L, false, 'changed my mind') $$, t.record_of('stud1')),
  '23514', 'this record has already been decided; it can only change through a dispute',
  'a rep cannot revisit a decision at will'
);

-- ---------------------------------------------------------------------------
-- Rejections must be justified, and the student is shown why
-- ---------------------------------------------------------------------------
select throws_ok(
  format($$ select public.decide_attendance(%L, false) $$, t.record_of('stud2')),
  '23514', 'a rejection must give a reason, and the student is shown it',
  'a rejection with no reason is refused'
);

select throws_ok(
  format($$ select public.decide_attendance(%L, false, '   ') $$, t.record_of('stud2')),
  '23514', 'a rejection must give a reason, and the student is shown it',
  'whitespace is not a reason'
);

select lives_ok(
  format($$ select public.decide_attendance(%L, false, 'not seen in the hall') $$, t.record_of('stud2')),
  'a rejection with a reason is accepted'
);

reset role;
select is((select rejection_reason from public.attendance_records where id = t.record_of('stud2')),
          'not seen in the hall', 'the reason is stored verbatim for the student to read');

-- ---------------------------------------------------------------------------
-- A course rep's own attendance goes to the watcher
-- ---------------------------------------------------------------------------
set local role authenticated;
select t.login(t.uid('rep1'));
select throws_ok(
  format($$ select public.decide_attendance(%L, true) $$, t.record_of('rep1')),
  '42501', 'a course rep''s own attendance is decided by the watcher',
  'a course rep cannot approve their own attendance'
);

select t.login(t.uid('rep2'));
select throws_ok(
  format($$ select public.decide_attendance(%L, true) $$, t.record_of('rep1')),
  '42501', 'a course rep''s own attendance is decided by the watcher',
  'nor can a fellow course rep approve it for them'
);

select t.login(t.uid('watcher'));
select lives_ok(
  format($$ select public.decide_attendance(%L, true) $$, t.record_of('rep1')),
  'the watcher decides a course rep''s own attendance'
);

reset role;
select is((select verification_route from public.attendance_records where id = t.record_of('rep1')),
          'watcher', 'and the record says so');

-- ---------------------------------------------------------------------------
-- Watcher absence: permitted, but never silent
-- ---------------------------------------------------------------------------
set local role authenticated;
select t.login(t.uid('rep1'));
select throws_ok(
  format($$ select public.declare_watcher_absence(%L) $$, t.oid('classA')),
  '42501', 'only this class''s watcher may declare an absence',
  'a course rep cannot declare the watcher absent on their behalf'
);

select t.login(t.uid('watcher'));
select lives_ok(
  format($$ select public.declare_watcher_absence(%L, current_date, 'sick') $$, t.oid('classA')),
  'the watcher can declare their own absence'
);

-- rep2's record is still pending; with the watcher declared absent, self-approval
-- is now permitted — and permanently stamped.
select t.login(t.uid('rep2'));
select public.submit_attendance(t.session(), t.on_campus_lat(), t.on_campus_lng(), 10.0, 'd-rep2');
select t.remember_records();
select lives_ok(
  format($$ select public.decide_attendance(%L, true) $$, t.record_of('rep2')),
  'with the watcher declared absent, a rep may approve their own attendance'
);

reset role;
select is((select verification_route from public.attendance_records where id = t.record_of('rep2')),
          'self_approved_watcher_declared_absent',
          'the self-approval is countable, not a silent bypass');

select ok(
  (select count(*) >= 4 from public.audit_log where entity = 'attendance_record'
     and action in ('approved', 'rejected')),
  'every decision is written to the audit log'
);

select * from finish();
rollback;
