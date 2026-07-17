-- supabase/tests/helpers.sql
--
-- Shared fixtures and auth simulation for the RLS suite.
--
-- §8: "RLS policy tests are mandatory ... A policy without a test doesn't count
-- as done." These tests are the only evidence that 0011 does what it says.
-- Reading a policy tells you what someone intended; running it tells you what
-- is true. The mode:"file" bug in Phase 1's ESLint boundaries is the standing
-- reminder — that config looked correct and enforced nothing.

create schema if not exists tests;

-- The helpers must be callable from inside an assumed role — set_anon() leaves
-- us as `anon`, and the very next call is tests.clear_auth() to get back out.
-- 0014 revokes anon's access to public, and this schema needs its own grant or
-- the suite traps itself in the role it just assumed.
--
-- Test-only. This schema exists solely inside `supabase test db`, is never
-- created by a migration, and so never reaches any deployed database.
grant usage on schema tests to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Deterministic identities
-- ─────────────────────────────────────────────────────────────────────────────

-- A stable uuid per name, so tests say tests.uid('rep_a') instead of carrying
-- a hex literal. When an assertion fails it names a person, and the person's
-- name is the whole argument for the assertion.
--
-- The 'test:' prefix is not decoration. supabase/seeds uses the same md5
-- formula, and `db reset` seeds before tests run — so tests.uid('admin') and
-- seed_uid('admin') minted the SAME uuid and the fixture collided with the
-- seeded admin on users_pkey. The suite passed for as long as no seed existed,
-- which is the worst way to find out. Namespacing makes the fixture independent
-- of whatever the seed happens to contain.
create or replace function tests.uid(p_name text)
returns uuid
language sql
immutable
as $$
  select ('00000000-0000-4000-8000-' || substr(md5('test:' || p_name), 1, 12))::uuid;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Auth simulation
-- ─────────────────────────────────────────────────────────────────────────────

-- auth.uid() reads request.jwt.claims (verified against this database's own
-- auth.uid source, not assumed). Setting that GUC and the `authenticated` role
-- reproduces exactly what PostgREST does when a real user's JWT arrives, so
-- these tests exercise the same code path as production rather than an
-- approximation of it.
create or replace function tests.set_auth_user(p_user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', p_user_id::text,
      'role', 'authenticated',
      'aud', 'authenticated'
    )::text,
    true
  );
  set local role authenticated;
end;
$$;

-- The anon case: a JWT-less visitor. §8: "anon reads nothing."
create or replace function tests.set_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', null, true);
  set local role anon;
end;
$$;

-- Back to the superuser, for building fixtures.
create or replace function tests.clear_auth()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', null, true);
  reset role;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixture
-- ─────────────────────────────────────────────────────────────────────────────

-- One institution, one course, two sections, and the cast of characters the
-- policy matrix needs. Fixed UUIDs so tests can reference people by name
-- without a lookup, and so a failure names a person rather than a uuid.
--
-- The cast, and why each exists:
--   admin       — global admin
--   instructor  — owns section A only. Section B is someone else's.
--   rep_a       — active rep for section A, AND a student enrolled in it.
--                 The conflict-of-interest case: §4 says a user holds Student
--                 + Course Rep simultaneously and permissions must be additive
--                 and scoped. This person is the reason that rule exists.
--   corep_a     — second active rep for section A. Proves co-reps work, and is
--                 who legitimately approves rep_a's own record.
--   expired_rep — was a rep for section A; appointment ended yesterday. Proves
--                 authority is bounded in time, not by the existence of a row.
--   revoked_rep — was a rep for section A; revoked. Distinct from expired.
--   rep_b       — active rep for section B. Proves scoping: must see nothing
--                 of section A.
--   student_1   — enrolled in section A.
--   student_2   — enrolled in section A. student_1 must not see their records.
--   outsider    — enrolled in nothing. Proves the default is deny.

create or replace function tests.seed_fixture()
returns void
language plpgsql
as $$
declare
  v_inst uuid := '11111111-1111-1111-1111-111111111111';
  v_fac uuid := '11111111-1111-1111-1111-111111111112';
  v_dept uuid := '11111111-1111-1111-1111-111111111113';
  v_year uuid := '11111111-1111-1111-1111-111111111114';
  v_sem uuid := '11111111-1111-1111-1111-111111111115';
  v_course uuid := '11111111-1111-1111-1111-111111111116';
  v_snapshot uuid := '11111111-1111-1111-1111-111111111117';
begin
  insert into public.institutions (id, name, short_name, timezone)
    values (v_inst, 'Test University', 'TU', 'Africa/Accra');

  insert into public.faculties (id, institution_id, name, code)
    values (v_fac, v_inst, 'Science', 'SCI');

  insert into public.departments (id, institution_id, faculty_id, name, code)
    values (v_dept, v_inst, v_fac, 'Computer Science', 'CSC');

  insert into public.academic_years (id, institution_id, name, starts_on, ends_on)
    values (v_year, v_inst, '2025/2026', '2025-09-01', '2026-08-31');

  insert into public.semesters (id, institution_id, academic_year_id, name, starts_on, ends_on, status)
    values (v_sem, v_inst, v_year, 'First', '2025-09-01', '2026-01-31', 'active');

  insert into public.courses (id, institution_id, department_id, academic_year_id, code, title, credit_units, level)
    values (v_course, v_inst, v_dept, v_year, 'CSC 401', 'Compilers', 3, 400);

  -- auth.users first: profiles.id references it.
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select
    u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    u.email, 'x', now(), now(), now()
  from (values
    (tests.uid('admin'), 'admin@test.edu'),
    (tests.uid('instructor'), 'instructor@test.edu'),
    (tests.uid('instructor_b'), 'instructor_b@test.edu'),
    (tests.uid('rep_a'), 'rep_a@test.edu'),
    (tests.uid('corep_a'), 'corep_a@test.edu'),
    (tests.uid('expired_rep'), 'expired_rep@test.edu'),
    (tests.uid('revoked_rep'), 'revoked_rep@test.edu'),
    (tests.uid('rep_b'), 'rep_b@test.edu'),
    (tests.uid('student_1'), 'student_1@test.edu'),
    (tests.uid('student_2'), 'student_2@test.edu'),
    (tests.uid('outsider'), 'outsider@test.edu')
  ) as u(id, email);

  insert into public.profiles (id, institution_id, full_name, email, matric_number, department_id, level)
  values
    (tests.uid('admin'), v_inst, 'Ada Admin', 'admin@test.edu', null, v_dept, null),
    (tests.uid('instructor'), v_inst, 'Ivan Instructor', 'instructor@test.edu', null, v_dept, null),
    (tests.uid('instructor_b'), v_inst, 'Iris Instructor', 'instructor_b@test.edu', null, v_dept, null),
    (tests.uid('rep_a'), v_inst, 'Rita Rep', 'rep_a@test.edu', 'CSC/2021/0001', v_dept, 400),
    (tests.uid('corep_a'), v_inst, 'Cora Co-Rep', 'corep_a@test.edu', 'CSC/2021/0002', v_dept, 400),
    (tests.uid('expired_rep'), v_inst, 'Eli Expired', 'expired_rep@test.edu', 'CSC/2021/0003', v_dept, 400),
    (tests.uid('revoked_rep'), v_inst, 'Rob Revoked', 'revoked_rep@test.edu', 'CSC/2021/0004', v_dept, 400),
    (tests.uid('rep_b'), v_inst, 'Ben Rep-B', 'rep_b@test.edu', 'CSC/2021/0005', v_dept, 400),
    (tests.uid('student_1'), v_inst, 'Sam Student', 'student_1@test.edu', 'CSC/2021/0006', v_dept, 400),
    (tests.uid('student_2'), v_inst, 'Sara Student', 'student_2@test.edu', 'CSC/2021/0007', v_dept, 400),
    (tests.uid('outsider'), v_inst, 'Otto Outsider', 'outsider@test.edu', 'CSC/2021/0008', v_dept, 400);

  insert into public.user_roles (user_id, role, scope_type, scope_id) values
    (tests.uid('admin'), 'admin', 'global', null),
    (tests.uid('instructor'), 'instructor', 'global', null),
    (tests.uid('instructor_b'), 'instructor', 'global', null),
    (tests.uid('rep_a'), 'student', 'global', null),
    (tests.uid('corep_a'), 'student', 'global', null),
    (tests.uid('expired_rep'), 'student', 'global', null),
    (tests.uid('revoked_rep'), 'student', 'global', null),
    (tests.uid('rep_b'), 'student', 'global', null),
    (tests.uid('student_1'), 'student', 'global', null),
    (tests.uid('student_2'), 'student', 'global', null),
    (tests.uid('outsider'), 'student', 'global', null);

  -- The rep role grant, mirrored into user_roles for UI purposes. Note that
  -- course_rep_assignments is what RLS actually consults — this row grants
  -- nothing by itself, which is the point of modelling the grant as a row.
  insert into public.user_roles (user_id, role, scope_type, scope_id) values
    (tests.uid('rep_a'), 'course_rep', 'class_section', tests.uid('section_a')),
    (tests.uid('corep_a'), 'course_rep', 'class_section', tests.uid('section_a')),
    (tests.uid('rep_b'), 'course_rep', 'class_section', tests.uid('section_b'));

  insert into public.class_sections (id, institution_id, course_id, semester_id, section_code, instructor_id, room)
  values
    (tests.uid('section_a'), v_inst, v_course, v_sem, 'A', tests.uid('instructor'), 'LT1'),
    (tests.uid('section_b'), v_inst, v_course, v_sem, 'B', tests.uid('instructor_b'), 'LT2');

  insert into public.enrollments (student_id, class_section_id, status, enrolled_at) values
    (tests.uid('student_1'), tests.uid('section_a'), 'enrolled', now() - interval '60 days'),
    (tests.uid('student_2'), tests.uid('section_a'), 'enrolled', now() - interval '60 days'),
    (tests.uid('rep_a'), tests.uid('section_a'), 'enrolled', now() - interval '60 days'),
    (tests.uid('corep_a'), tests.uid('section_a'), 'enrolled', now() - interval '60 days'),
    (tests.uid('expired_rep'), tests.uid('section_a'), 'enrolled', now() - interval '60 days'),
    (tests.uid('revoked_rep'), tests.uid('section_a'), 'enrolled', now() - interval '60 days'),
    (tests.uid('rep_b'), tests.uid('section_b'), 'enrolled', now() - interval '60 days');

  insert into public.course_rep_assignments (user_id, class_section_id, assigned_by, starts_at, ends_at, revoked_at, revoked_by)
  values
    -- Active.
    (tests.uid('rep_a'), tests.uid('section_a'), tests.uid('instructor'), now() - interval '30 days', null, null, null),
    (tests.uid('corep_a'), tests.uid('section_a'), tests.uid('instructor'), now() - interval '30 days', null, null, null),
    (tests.uid('rep_b'), tests.uid('section_b'), tests.uid('instructor_b'), now() - interval '30 days', null, null, null),
    -- Appointment ended yesterday: the row exists, the authority does not.
    (tests.uid('expired_rep'), tests.uid('section_a'), tests.uid('instructor'), now() - interval '30 days', now() - interval '1 day', null, null),
    -- Revoked: distinct from expired, and equally powerless.
    (tests.uid('revoked_rep'), tests.uid('section_a'), tests.uid('instructor'), now() - interval '30 days', null, now() - interval '2 days', tests.uid('instructor'));

  insert into public.attendance_rule_snapshots (
    id, source_rule_id, source_version,
    present_within_minutes, late_within_minutes, beyond_late_window, min_attendance_percent
  ) values (v_snapshot, null, 1, 10, 20, 'late', 75);

  insert into public.permission_reasons (id, institution_id, code, label, counts_as_excused)
  values
    (tests.uid('reason_medical'), v_inst, 'medical', 'Medical', true),
    (tests.uid('reason_other'), v_inst, 'other', 'Other', false);

  -- An open session on section A, and a closed one for close_session tests.
  insert into public.attendance_sessions (
    id, class_section_id, session_date, starts_at, ends_at, status,
    opened_at, opened_by, session_code, code_rotated_at, rules_snapshot_id
  ) values (
    tests.uid('session_a_open'), tests.uid('section_a'), current_date,
    now() - interval '5 minutes', now() + interval '55 minutes', 'open',
    now() - interval '5 minutes', tests.uid('rep_a'), '123456', now(), v_snapshot
  );

  insert into public.attendance_sessions (
    id, class_section_id, session_date, starts_at, ends_at, status,
    opened_at, opened_by, session_code, code_rotated_at, rules_snapshot_id
  ) values (
    tests.uid('session_b_open'), tests.uid('section_b'), current_date,
    now() - interval '5 minutes', now() + interval '55 minutes', 'open',
    now() - interval '5 minutes', tests.uid('rep_b'), '654321', now(), v_snapshot
  );

  -- Records: one per student on the open section-A session.
  insert into public.attendance_records (
    id, student_id, session_id, class_section_id, status, submitted_at, submission_source, rules_snapshot_id
  ) values
    (tests.uid('record_s1'), tests.uid('student_1'), tests.uid('session_a_open'), tests.uid('section_a'),
     'pending_verification', now() - interval '2 minutes', 'student_web', v_snapshot),
    (tests.uid('record_s2'), tests.uid('student_2'), tests.uid('session_a_open'), tests.uid('section_a'),
     'pending_verification', now() - interval '1 minute', 'student_web', v_snapshot),
    -- The conflict-of-interest row: the rep's OWN request, on a session they
    -- administer. §4 says a co-rep or the instructor must decide it.
    (tests.uid('record_rep_a'), tests.uid('rep_a'), tests.uid('session_a_open'), tests.uid('section_a'),
     'pending_verification', now() - interval '3 minutes', 'student_web', v_snapshot);

  insert into public.attendance_records (
    id, student_id, session_id, class_section_id, status, submitted_at, submission_source, rules_snapshot_id
  ) values
    (tests.uid('record_b'), tests.uid('rep_b'), tests.uid('session_b_open'), tests.uid('section_b'),
     'pending_verification', now() - interval '2 minutes', 'student_web', v_snapshot);
end;
$$;
