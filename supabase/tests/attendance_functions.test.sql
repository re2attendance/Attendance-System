-- Attendance write functions (0018) — the behaviour the RLS suite cannot prove.
--
-- rls_attendance_records.test.sql proves WHO may read and write the ledger. This
-- proves what the write FUNCTIONS do once permitted: that a repeat submit does
-- not duplicate, that a second verdict does not overwrite the first (the race
-- the §6 gate names), that a rep cannot decide their own record, and that a
-- caller-supplied status inconsistent with the decision is refused rather than
-- written.
--
-- Real concurrency is serialised by the FOR UPDATE in attendance_decide_one; a
-- single-transaction test cannot fork, so it proves the invariant that makes the
-- lock matter — the decidability re-check INSIDE the lock, which is what turns
-- the second writer into a no-op reporting `already` instead of a clobber.

begin;

create extension if not exists pgtap with schema extensions;
\ir helpers.sql

select plan(26);

select tests.seed_fixture();

-- ─────────────────────────────────────────────────────────────────────────────
-- report_present — idempotency and the code gate
-- ─────────────────────────────────────────────────────────────────────────────

-- student_1 already has record_s1 in the fixture. A resubmit with the right code
-- returns THAT record, unchanged — the offline-queue retry contract (§6 risk 6).
select tests.set_auth_user(tests.uid('student_1'));

select is(
  (select record_id from public.report_present(tests.uid('session_a_open'), '123456')),
  tests.uid('record_s1'),
  'report_present returns the existing record for a student who already submitted'
);

select lives_ok(
  $$ select public.report_present(tests.uid('session_a_open'), '123456') $$,
  'a second report_present does not error'
);

select is(
  (select count(*) from public.attendance_records
   where student_id = tests.uid('student_1') and session_id = tests.uid('session_a_open'))::int,
  1,
  'still exactly one record after a repeat submit — unique(student,session) is the backstop'
);

select tests.clear_auth();

-- Wrong code is refused. The code check precedes idempotency, so even a student
-- with a record cannot "resubmit" with a bad code and must present a right one.
select tests.set_auth_user(tests.uid('student_2'));

select throws_ok(
  $$ select public.report_present(tests.uid('session_a_open'), '000000') $$,
  null, null,
  'a wrong attendance code is refused'
);

select is(
  (select status from public.attendance_records
   where student_id = tests.uid('student_2') and session_id = tests.uid('session_a_open')),
  'pending_verification'::public.attendance_status,
  'and the wrong-code attempt changed nothing about the existing record'
);

select tests.clear_auth();

-- A first-time submitter (corep_a is enrolled but has no record yet) creates one.
select tests.set_auth_user(tests.uid('corep_a'));

select is(
  (select status from public.report_present(tests.uid('session_a_open'), '123456')),
  'pending_verification'::public.attendance_status,
  'a first-time submit creates a pending_verification record'
);

select is(
  (select count(*) from public.attendance_records
   where student_id = tests.uid('corep_a') and session_id = tests.uid('session_a_open'))::int,
  1,
  'exactly one record now exists for the first-time submitter'
);

select is(
  (select record_id from public.report_present(tests.uid('session_a_open'), '123456')),
  (select id from public.attendance_records
   where student_id = tests.uid('corep_a') and session_id = tests.uid('session_a_open')),
  'a repeat submit returns that same record rather than making a second'
);

select tests.clear_auth();

-- A student enrolled in nothing cannot submit, even with the right code.
select tests.set_auth_user(tests.uid('outsider'));

select throws_ok(
  $$ select public.report_present(tests.uid('session_a_open'), '123456') $$,
  '42501', null,
  'a student not enrolled in the section is refused'
);

select tests.clear_auth();

-- ─────────────────────────────────────────────────────────────────────────────
-- decide_attendance — the verdict, and the race
-- ─────────────────────────────────────────────────────────────────────────────

-- corep_a is an active rep for section A and NOT student_1, so may decide it.
select tests.set_auth_user(tests.uid('corep_a'));

select is(
  (select status from public.decide_attendance(tests.uid('record_s1'), 'approved', 'present')),
  'present'::public.attendance_status,
  'a rep approving a record writes the derived status'
);

select is(
  (select verification_latency_seconds is not null
   from public.attendance_records where id = tests.uid('record_s1')),
  true,
  'the approval records verification latency (a rep metric, not a penalty)'
);

-- The race: a second decide on the now-resolved record reports `already` and
-- must NOT overwrite the first verdict. This is the post-lock re-check that
-- makes two concurrent reps safe.
select is(
  (select was_already_decided from public.decide_attendance(tests.uid('record_s1'), 'rejected', 'rejected')),
  true,
  'a second verdict on a decided record reports already_decided'
);

select is(
  (select status from public.attendance_records where id = tests.uid('record_s1')),
  'present'::public.attendance_status,
  'and the original verdict stands — the second writer did not clobber it'
);

select is(
  (select decided_by from public.attendance_records where id = tests.uid('record_s1')),
  tests.uid('corep_a'),
  'the first decider remains recorded'
);

select tests.clear_auth();

-- Conflict of interest: rep_a cannot decide rep_a's own record.
select tests.set_auth_user(tests.uid('rep_a'));

select throws_ok(
  $$ select public.decide_attendance(tests.uid('record_rep_a'), 'approved', 'present') $$,
  '42501', null,
  'a rep cannot decide their own attendance'
);

select is(
  (select status from public.attendance_records where id = tests.uid('record_rep_a')),
  'pending_verification'::public.attendance_status,
  'and their own record is left untouched for a co-rep to decide'
);

select tests.clear_auth();

-- The consistency guard: a status that does not match the decision is refused
-- and nothing is written.
select tests.set_auth_user(tests.uid('corep_a'));

select throws_ok(
  $$ select public.decide_attendance(tests.uid('record_s2'), 'approved', 'rejected') $$,
  null, null,
  'an approval claiming status rejected is refused'
);

select throws_ok(
  $$ select public.decide_attendance(tests.uid('record_s2'), 'rejected', 'present') $$,
  null, null,
  'a rejection claiming status present is refused'
);

select is(
  (select status from public.attendance_records where id = tests.uid('record_s2')),
  'pending_verification'::public.attendance_status,
  'a guarded call writes nothing'
);

select tests.clear_auth();

-- ─────────────────────────────────────────────────────────────────────────────
-- decide_attendance_bulk — skip, never fail the batch
-- ─────────────────────────────────────────────────────────────────────────────

-- rep_a bulk-approves two rows, one of which is rep_a's OWN. The own row is
-- skipped (conflict), the other decided — the batch does not fail over it.
select tests.set_auth_user(tests.uid('rep_a'));

select is(
  (select decided from public.decide_attendance_bulk(
     jsonb_build_array(
       jsonb_build_object('id', tests.uid('record_s2'),    'status', 'present'),
       jsonb_build_object('id', tests.uid('record_rep_a'), 'status', 'present')
     ),
     'approved')),
  1,
  'bulk decides the eligible row'
);

select is(
  (select status from public.attendance_records where id = tests.uid('record_s2')),
  'present'::public.attendance_status,
  'and the eligible row really was written'
);

-- A repeat of the same batch decides nothing: record_s2 is already resolved and
-- record_rep_a is still the caller''s own. Both skipped, batch still succeeds.
select is(
  (select skipped from public.decide_attendance_bulk(
     jsonb_build_array(
       jsonb_build_object('id', tests.uid('record_s2'),    'status', 'present'),
       jsonb_build_object('id', tests.uid('record_rep_a'), 'status', 'present')
     ),
     'approved')),
  2,
  'a repeat batch skips the already-decided and the conflict, none fatal'
);

select is(
  (select status from public.attendance_records where id = tests.uid('record_rep_a')),
  'pending_verification'::public.attendance_status,
  'the conflict row is never touched by a bulk either'
);

select tests.clear_auth();

-- ─────────────────────────────────────────────────────────────────────────────
-- rotate_session_code — the display's, not the student's
-- ─────────────────────────────────────────────────────────────────────────────

select tests.set_auth_user(tests.uid('corep_a'));

select is(
  (select length(code) from public.rotate_session_code(tests.uid('session_a_open'))),
  6,
  'a section administrator gets a six-digit code'
);

select ok(
  (select seconds_remaining from public.rotate_session_code(tests.uid('session_a_open'))) between 0 and 30,
  'with a rotation countdown in range'
);

select tests.clear_auth();

-- A plain student may not read the code — that would defeat the possession factor.
select tests.set_auth_user(tests.uid('student_1'));

select throws_ok(
  $$ select public.rotate_session_code(tests.uid('session_a_open')) $$,
  '42501', null,
  'a student cannot rotate or read a session code'
);

select tests.clear_auth();

select * from finish();
rollback;
