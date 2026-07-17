-- RLS: audit_log — append-only.
--
-- §5: "append-only, no update/delete grants to anyone".
--
-- "Anyone" is the interesting word. An audit log that a sufficiently privileged
-- role can edit is not an audit log — it is a record of what the last person
-- with that role wanted you to believe. These tests check the claim against the
-- roles that actually exist, including the ones RLS does not apply to.

begin;

create extension if not exists pgtap with schema extensions;
\ir helpers.sql

select plan(11);

select tests.seed_fixture();

insert into public.audit_log (actor_id, action, entity_type, entity_id, after)
values (tests.uid('rep_a'), 'attendance.approved', 'attendance_record', tests.uid('record_s1'), '{"status":"present"}'::jsonb);

-- ─────────────────────────────────────────────────────────────────────────────
-- Reading
-- ─────────────────────────────────────────────────────────────────────────────

select tests.set_anon();
select throws_ok(
  'select count(*) from public.audit_log',
  '42501',
  null,
  'anon cannot read the audit log'
);
select tests.clear_auth();

select tests.set_auth_user(tests.uid('student_1'));
select is(
  (select count(*) from public.audit_log)::int,
  0,
  'a student cannot read the audit log'
);
select tests.clear_auth();

select tests.set_auth_user(tests.uid('rep_a'));
select is(
  (select count(*) from public.audit_log)::int,
  0,
  'a rep cannot read the audit log — not even entries about their own decisions'
);
select tests.clear_auth();

select tests.set_auth_user(tests.uid('instructor'));
select is(
  (select count(*) from public.audit_log)::int,
  0,
  'an instructor cannot read the audit log'
);
select tests.clear_auth();

select tests.set_auth_user(tests.uid('admin'));

-- Scoped to this test's own entry rather than counting the whole table: the
-- seed writes audit rows too, and an absolute count here would make the suite
-- depend on how much history the seed happens to generate.
select is(
  (select count(*) from public.audit_log where entity_id = tests.uid('record_s1'))::int,
  1,
  'admin can read the audit log'
);
select tests.clear_auth();

-- ─────────────────────────────────────────────────────────────────────────────
-- Writing — the only door is log_audit()
-- ─────────────────────────────────────────────────────────────────────────────

select tests.set_auth_user(tests.uid('rep_a'));

select throws_ok(
  $$insert into public.audit_log (actor_id, action, entity_type)
    values (tests.uid('admin'), 'forged.entry', 'attendance_record')$$,
  '42501',
  null,
  'nobody can INSERT into audit_log directly — 0014 revokes the grant'
);

-- The sanctioned door. It stamps actor_id from auth.uid() itself, so an entry
-- cannot lie about who acted — which is the whole reason direct INSERT is shut.
select lives_ok(
  $$select public.log_audit('attendance.approved', 'attendance_record', tests.uid('record_s1'))$$,
  'log_audit() is the sanctioned door and works for an authenticated user'
);

select tests.clear_auth();

select is(
  (select actor_id from public.audit_log where action = 'attendance.approved' order by id desc limit 1),
  tests.uid('rep_a'),
  'log_audit() stamps the real actor — a caller cannot forge attribution'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Immutability — enforced by trigger, so it holds for roles RLS never sees
-- ─────────────────────────────────────────────────────────────────────────────

select tests.set_auth_user(tests.uid('admin'));

select throws_ok(
  $$update public.audit_log set action = 'rewritten' where action = 'attendance.approved'$$,
  '42501',
  null,
  'admin cannot UPDATE an audit entry'
);

select tests.clear_auth();

-- The real test. We are now the table OWNER (postgres), the role migrations run
-- as — RLS does not constrain it and grants are irrelevant to it. If
-- append-only were implemented with policies or grants alone, this would
-- succeed. It is implemented with a trigger, so it does not.
select throws_ok(
  $$update public.audit_log set action = 'rewritten' where action = 'attendance.approved'$$,
  '42501',
  null,
  'not even the table OWNER can UPDATE an audit entry — the trigger applies to everyone'
);

select throws_ok(
  $$delete from public.audit_log$$,
  '42501',
  null,
  'not even the table OWNER can DELETE an audit entry'
);

select * from finish();
rollback;
