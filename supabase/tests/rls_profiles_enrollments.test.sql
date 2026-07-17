-- RLS: profiles and enrollments.
--
-- profiles is the PII table; enrollments is the roster. Both leak "who is
-- studying what", which is exactly what GDPR-equivalent obligations (§2 Q8)
-- are about.

begin;

create extension if not exists pgtap with schema extensions;
\ir helpers.sql

select plan(19);

select tests.seed_fixture();

-- ─────────────────────────────────────────────────────────────────────────────
-- profiles
-- ─────────────────────────────────────────────────────────────────────────────

select tests.set_anon();
select throws_ok(
  'select count(*) from public.profiles',
  '42501',
  null,
  'anon cannot read profiles'
);
select tests.clear_auth();

select tests.set_auth_user(tests.uid('student_1'));

-- A student sees themselves. They do NOT see their classmates: §4 says
-- "Student — own records only", and a class list is not theirs to have.
select is(
  (select count(*) from public.profiles)::int,
  1,
  'a student reads exactly one profile: their own'
);

select is(
  (select id from public.profiles),
  tests.uid('student_1'),
  'and it is theirs'
);

-- The self-promotion attack. A user may edit their own profile — name, avatar —
-- but level, status, matric and institution are institutional facts.
update public.profiles set status = 'active', full_name = 'Renamed' where id = tests.uid('student_1');

select tests.clear_auth();

select is(
  (select full_name from public.profiles where id = tests.uid('student_1')),
  'Renamed',
  'a student CAN rename themselves (control — the update policy works at all)'
);

select tests.set_auth_user(tests.uid('student_1'));

-- Suspended students must not be able to un-suspend themselves. This raises
-- rather than silently reverting: the user gets told why, and a UI that tries
-- it gets a real error instead of a write that appears to work.
select throws_ok(
  $$update public.profiles set status = 'graduated' where id = tests.uid('student_1')$$,
  '42501',
  null,
  'a student CANNOT change their own status — an institutional fact, not a preference'
);

select throws_ok(
  $$update public.profiles set matric_number = 'CSC/2021/9999' where id = tests.uid('student_1')$$,
  '42501',
  null,
  'a student cannot change their own matric number'
);

select throws_ok(
  $$update public.profiles set level = 100 where id = tests.uid('student_1')$$,
  '42501',
  null,
  'a student cannot change their own level'
);

select tests.clear_auth();

-- The control: an admin CAN, because for an admin these are exactly the fields
-- the job is made of.
select tests.set_auth_user(tests.uid('admin'));

select lives_ok(
  $$update public.profiles set status = 'suspended' where id = tests.uid('student_1')$$,
  'an admin CAN change a student''s status (control)'
);

select tests.clear_auth();

select is(
  (select status from public.profiles where id = tests.uid('student_1')),
  'suspended'::public.profile_status,
  'and the change stuck'
);

-- Put it back, so later assertions in this file are not reasoning about a
-- suspended student.
update public.profiles set status = 'active' where id = tests.uid('student_1');

-- A rep needs the name and photo of students in their own section, to match a
-- face to a request (§6.3). Only their section.
select tests.set_auth_user(tests.uid('rep_a'));

select ok(
  (select count(*) from public.profiles where id = tests.uid('student_1')) = 1,
  'a rep CAN read the profile of a student in their own section'
);

select is(
  (select count(*) from public.profiles where id = tests.uid('rep_b'))::int,
  0,
  'a rep CANNOT read the profile of a student in someone else''s section'
);

select is(
  (select count(*) from public.profiles where id = tests.uid('outsider'))::int,
  0,
  'a rep cannot read the profile of a student enrolled in nothing'
);

select tests.clear_auth();

-- The expired rep loses profile access the moment their appointment ends.
select tests.set_auth_user(tests.uid('expired_rep'));

select is(
  (select count(*) from public.profiles where id = tests.uid('student_1'))::int,
  0,
  'a rep whose appointment ended cannot read their former students'' profiles'
);

select tests.clear_auth();

select tests.set_auth_user(tests.uid('admin'));
select ok(
  (select count(*) from public.profiles)::int >= 11,
  'admin reads all profiles'
);
select tests.clear_auth();

-- ─────────────────────────────────────────────────────────────────────────────
-- enrollments — the roster
-- ─────────────────────────────────────────────────────────────────────────────

select tests.set_auth_user(tests.uid('student_1'));

select is(
  (select count(*) from public.enrollments)::int,
  1,
  'a student sees only their own enrollment, not the class roster'
);

select tests.clear_auth();

select tests.set_auth_user(tests.uid('rep_a'));

select is(
  (select count(*) from public.enrollments where class_section_id = tests.uid('section_a'))::int,
  6,
  'a rep sees their own section''s full roster'
);

select is(
  (select count(*) from public.enrollments where class_section_id = tests.uid('section_b'))::int,
  0,
  'a rep sees nothing of another section''s roster'
);

select tests.clear_auth();

-- A rep cannot enroll people. §4: reps manage sessions and verification, not
-- the register. Enrollment is admin/instructor work.
select tests.set_auth_user(tests.uid('rep_a'));

select throws_ok(
  $$insert into public.enrollments (student_id, class_section_id, status)
    values (tests.uid('outsider'), tests.uid('section_a'), 'enrolled')$$,
  '42501',
  null,
  'a rep CANNOT enroll a student — that is admin/instructor work'
);

select tests.clear_auth();

-- The control: the section's instructor can.
select tests.set_auth_user(tests.uid('instructor'));

select lives_ok(
  $$insert into public.enrollments (student_id, class_section_id, status)
    values (tests.uid('outsider'), tests.uid('section_a'), 'enrolled')$$,
  'the instructor CAN enroll a student into their own section (control)'
);

select tests.clear_auth();

select * from finish();
rollback;
