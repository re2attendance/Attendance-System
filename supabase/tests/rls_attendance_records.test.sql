-- RLS: attendance_records — the ledger.
--
-- §8's mandatory matrix: student reads own / cannot read others', rep reads own
-- sections' / cannot read other sections', anon reads nothing, rep cannot
-- self-approve.

begin;

create extension if not exists pgtap with schema extensions;
\ir helpers.sql

select plan(24);

select tests.seed_fixture();

-- ─────────────────────────────────────────────────────────────────────────────
-- anon reads nothing (§8)
-- ─────────────────────────────────────────────────────────────────────────────

select tests.set_anon();

-- Refused at the GRANT layer, not merely filtered to zero rows by a policy.
-- That is the stronger claim and the one 0014 makes deliberately: anon is
-- turned away before RLS is consulted, so a stray permissive policy added later
-- still cannot expose anything to a logged-out visitor.
select throws_ok(
  'select count(*) from public.attendance_records',
  '42501',
  null,
  'anon is refused attendance_records at the grant layer, before RLS is even consulted'
);

select tests.clear_auth();

-- ─────────────────────────────────────────────────────────────────────────────
-- Student: own records only (§4)
-- ─────────────────────────────────────────────────────────────────────────────

select tests.set_auth_user(tests.uid('student_1'));

select is(
  (select count(*) from public.attendance_records)::int,
  1,
  'student_1 sees exactly one record: their own'
);

select is(
  (select student_id from public.attendance_records),
  tests.uid('student_1'),
  'and the record student_1 sees is theirs'
);

select is(
  (select count(*) from public.attendance_records where id = tests.uid('record_s2'))::int,
  0,
  'student_1 CANNOT read student_2''s record'
);

-- The core promise of the product to a student: nobody else in your class can
-- see what you did.
select is(
  (select count(*) from public.attendance_records where id = tests.uid('record_rep_a'))::int,
  0,
  'student_1 cannot read the rep''s record either'
);

select tests.clear_auth();

-- ─────────────────────────────────────────────────────────────────────────────
-- Outsider: enrolled in nothing, sees nothing. The deny-by-default proof.
-- ─────────────────────────────────────────────────────────────────────────────

select tests.set_auth_user(tests.uid('outsider'));

select is(
  (select count(*) from public.attendance_records)::int,
  0,
  'a user enrolled in nothing reads no records'
);

select tests.clear_auth();

-- ─────────────────────────────────────────────────────────────────────────────
-- Rep: own section only (§4)
-- ─────────────────────────────────────────────────────────────────────────────

select tests.set_auth_user(tests.uid('rep_a'));

select is(
  (select count(*) from public.attendance_records where class_section_id = tests.uid('section_a'))::int,
  3,
  'rep_a reads all three records in their own section'
);

select is(
  (select count(*) from public.attendance_records where class_section_id = tests.uid('section_b'))::int,
  0,
  'rep_a CANNOT read section B''s records — the scoping rule'
);

select tests.clear_auth();

select tests.set_auth_user(tests.uid('rep_b'));

select is(
  (select count(*) from public.attendance_records where class_section_id = tests.uid('section_a'))::int,
  0,
  'rep_b cannot read section A''s records — scoping holds in both directions'
);

select tests.clear_auth();

-- ─────────────────────────────────────────────────────────────────────────────
-- The appointment period is real (§4)
--
-- Both of these users have a course_rep_assignments row for section A. Neither
-- has authority. If these pass, "only within their appointment period" is
-- enforced rather than documented.
-- ─────────────────────────────────────────────────────────────────────────────

select tests.set_auth_user(tests.uid('expired_rep'));

select is(
  (select count(*) from public.attendance_records where student_id <> tests.uid('expired_rep'))::int,
  0,
  'a rep whose appointment ENDED reads no one else''s records'
);

select tests.clear_auth();

select tests.set_auth_user(tests.uid('revoked_rep'));

select is(
  (select count(*) from public.attendance_records where student_id <> tests.uid('revoked_rep'))::int,
  0,
  'a REVOKED rep reads no one else''s records'
);

select tests.clear_auth();

-- ─────────────────────────────────────────────────────────────────────────────
-- THE CONFLICT-OF-INTEREST RULE (§4)
--
-- "A rep's own attendance request for a session they administer must be
-- approved by a co-rep or the instructor. Enforce in DB (RLS/constraint), not
-- just UI."
--
-- These four tests are the reason this file exists.
-- ─────────────────────────────────────────────────────────────────────────────

select tests.set_auth_user(tests.uid('rep_a'));

-- The attack: rep_a approves rep_a. RLS makes the row unreachable for UPDATE,
-- so the write affects zero rows rather than raising — which is why this
-- asserts on the stored status afterwards, not on an error.
update public.attendance_records
set decision = 'approved', decided_at = now(), decided_by = tests.uid('rep_a'), status = 'present'
where id = tests.uid('record_rep_a');

select tests.clear_auth();

select is(
  (select status from public.attendance_records where id = tests.uid('record_rep_a')),
  'pending_verification'::public.attendance_status,
  'a rep CANNOT approve their own attendance record'
);

select is(
  (select decision from public.attendance_records where id = tests.uid('record_rep_a')),
  null,
  'and no decision was recorded on the rep''s own record'
);

-- The control: the same rep, on someone else's record, works. Without this the
-- test above could pass because reps cannot approve anything at all.
select tests.set_auth_user(tests.uid('rep_a'));

update public.attendance_records
set decision = 'approved', decided_at = now(), decided_by = tests.uid('rep_a'), status = 'present'
where id = tests.uid('record_s1');

select tests.clear_auth();

select is(
  (select status from public.attendance_records where id = tests.uid('record_s1')),
  'present'::public.attendance_status,
  'the same rep CAN approve a different student''s record (control)'
);

-- The remedy §4 prescribes: a co-rep decides it.
select tests.set_auth_user(tests.uid('corep_a'));

update public.attendance_records
set decision = 'approved', decided_at = now(), decided_by = tests.uid('corep_a'), status = 'present'
where id = tests.uid('record_rep_a');

select tests.clear_auth();

select is(
  (select status from public.attendance_records where id = tests.uid('record_rep_a')),
  'present'::public.attendance_status,
  'a CO-REP can approve the rep''s own record — the prescribed remedy works'
);

-- And the instructor, the other prescribed remedy.
select tests.set_auth_user(tests.uid('instructor'));

update public.attendance_records
set decision = 'approved', decided_at = now(), decided_by = tests.uid('instructor'), status = 'present'
where id = tests.uid('record_s2');

select tests.clear_auth();

select is(
  (select status from public.attendance_records where id = tests.uid('record_s2')),
  'present'::public.attendance_status,
  'the instructor can decide records in their own section'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Students cannot forge (§8: "never trust a client-supplied status")
-- ─────────────────────────────────────────────────────────────────────────────

select tests.set_auth_user(tests.uid('student_1'));

-- Submitting yourself present, directly.
select throws_ok(
  $$insert into public.attendance_records (student_id, session_id, class_section_id, status, submitted_at, submission_source)
    values (tests.uid('student_1'), tests.uid('session_b_open'), tests.uid('section_b'), 'present', now(), 'student_web')$$,
  '42501',
  null,
  'a student cannot insert a record for a section they are not enrolled in'
);

-- The important one: a client naming its own status.
select throws_ok(
  $$insert into public.attendance_records (student_id, session_id, class_section_id, status, submitted_at, submission_source)
    values (tests.uid('student_2'), tests.uid('session_a_open'), tests.uid('section_a'), 'present', now(), 'student_web')$$,
  '42501',
  null,
  'a student cannot file a record on another student''s behalf'
);

-- A student cannot decide their own record either — the COI rule is general.
update public.attendance_records
set decision = 'approved', status = 'present', decided_at = now()
where id = tests.uid('record_s1') and status <> 'present';

select tests.clear_auth();

select is(
  (select decided_by from public.attendance_records where id = tests.uid('record_s1')),
  tests.uid('rep_a'),
  'a student cannot overwrite the rep''s decision on their own record'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Server time is authoritative (§5) — the force_server_time trigger
-- ─────────────────────────────────────────────────────────────────────────────

select tests.set_auth_user(tests.uid('outsider'));
select tests.clear_auth();

-- Enroll the outsider so they can legitimately submit, then have them lie about
-- when. submitted_at is the ONE input deriveStatus anchors on: a client that
-- can set it can choose its own status, so the trigger overwrites rather than
-- trusts.
insert into public.enrollments (student_id, class_section_id, status, enrolled_at)
values (tests.uid('outsider'), tests.uid('section_a'), 'enrolled', now() - interval '60 days');

select tests.set_auth_user(tests.uid('outsider'));

insert into public.attendance_records (student_id, session_id, class_section_id, status, submitted_at, submission_source)
values (
  tests.uid('outsider'), tests.uid('session_a_open'), tests.uid('section_a'),
  'pending_verification',
  -- "I submitted an hour ago, honest."
  now() - interval '1 hour',
  'student_web'
);

select tests.clear_auth();

select ok(
  (select submitted_at from public.attendance_records
    where student_id = tests.uid('outsider')) > now() - interval '1 minute',
  'a client-supplied submitted_at is OVERWRITTEN with server time, not trusted'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Admin
-- ─────────────────────────────────────────────────────────────────────────────

select tests.set_auth_user(tests.uid('admin'));

select ok(
  (select count(*) from public.attendance_records)::int >= 4,
  'admin reads records across all sections'
);

select tests.clear_auth();

-- ─────────────────────────────────────────────────────────────────────────────
-- Nobody deletes an academic record
-- ─────────────────────────────────────────────────────────────────────────────

-- Refused at the grant layer: 0014 never grants DELETE to authenticated on
-- anything. Stronger than "no delete policy" — a DELETE policy added later
-- would still not make this possible, because the two layers must agree.
select tests.set_auth_user(tests.uid('admin'));

select throws_ok(
  $$delete from public.attendance_records where id = tests.uid('record_s1')$$,
  '42501',
  null,
  'not even admin can DELETE an attendance record — DELETE is not granted to anyone with a JWT'
);

select tests.clear_auth();

select tests.set_auth_user(tests.uid('rep_a'));

select throws_ok(
  $$delete from public.attendance_records where id = tests.uid('record_s2')$$,
  '42501',
  null,
  'nor can a rep delete one'
);

select tests.clear_auth();

select is(
  (select count(*) from public.attendance_records where id = tests.uid('record_s1'))::int,
  1,
  'and the record is still there'
);

select * from finish();
rollback;
