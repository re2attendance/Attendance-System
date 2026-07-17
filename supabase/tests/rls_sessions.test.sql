-- RLS: attendance_sessions, rule snapshots, and close_session().
--
-- Covers the two things the session lifecycle must guarantee: only the right
-- people can open/close/cancel a session, and closing one writes every absence
-- exactly once no matter how many times it is called.

begin;

create extension if not exists pgtap with schema extensions;
\ir helpers.sql

select plan(16);

select tests.seed_fixture();

-- ─────────────────────────────────────────────────────────────────────────────
-- Reading
-- ─────────────────────────────────────────────────────────────────────────────

select tests.set_anon();
select throws_ok(
  'select count(*) from public.attendance_sessions',
  '42501',
  null,
  'anon cannot read sessions'
);
select tests.clear_auth();

select tests.set_auth_user(tests.uid('student_1'));
select is(
  (select count(*) from public.attendance_sessions)::int,
  1,
  'a student sees sessions only for sections they are enrolled in'
);
select tests.clear_auth();

select tests.set_auth_user(tests.uid('outsider'));
select is(
  (select count(*) from public.attendance_sessions)::int,
  0,
  'a student enrolled in nothing sees no sessions'
);
select tests.clear_auth();

select tests.set_auth_user(tests.uid('rep_b'));
select is(
  (select count(*) from public.attendance_sessions where class_section_id = tests.uid('section_a'))::int,
  0,
  'a rep cannot see another section''s sessions'
);
select tests.clear_auth();

-- ─────────────────────────────────────────────────────────────────────────────
-- Writing
-- ─────────────────────────────────────────────────────────────────────────────

-- A student cannot open a session and mint a code — that is the anti-proxy
-- layer's whole premise (§7), and a student who can open a session can run one.
select tests.set_auth_user(tests.uid('student_1'));

update public.attendance_sessions
set status = 'cancelled', cancelled_at = now(), cancelled_reason = 'nope'
where id = tests.uid('session_a_open');

select tests.clear_auth();

select is(
  (select status from public.attendance_sessions where id = tests.uid('session_a_open')),
  'open'::public.session_status,
  'a student cannot cancel a session'
);

select tests.set_auth_user(tests.uid('expired_rep'));

update public.attendance_sessions
set status = 'cancelled', cancelled_at = now(), cancelled_reason = 'nope'
where id = tests.uid('session_a_open');

select tests.clear_auth();

select is(
  (select status from public.attendance_sessions where id = tests.uid('session_a_open')),
  'open'::public.session_status,
  'a rep whose appointment ended cannot cancel a session'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Rule snapshots are immutable (§5)
--
-- "Changing rules in week 10 never rewrites week 2's history." This is the
-- test that makes that sentence true rather than aspirational.
-- ─────────────────────────────────────────────────────────────────────────────

select tests.set_auth_user(tests.uid('admin'));

select throws_ok(
  $$update public.attendance_rule_snapshots set present_within_minutes = 999$$,
  '42501',
  null,
  'an admin cannot edit a rule snapshot — no UPDATE grant'
);

select tests.clear_auth();

-- As the table owner, where grants and RLS do not apply. The trigger does.
select throws_ok(
  $$update public.attendance_rule_snapshots set present_within_minutes = 999$$,
  '42501',
  null,
  'not even the table OWNER can edit a rule snapshot — week 2 is safe from week 10'
);

select throws_ok(
  $$delete from public.attendance_rule_snapshots$$,
  '42501',
  null,
  'nor delete one'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- close_session() — the load-bearing job (§6.1)
-- ─────────────────────────────────────────────────────────────────────────────

-- Six students are enrolled in section A. Three have records (two pending, one
-- being the rep's own). Closing must write absences for the other three and
-- sweep the three pending ones to absent (ADR-009).

select is(
  (select count(*) from public.attendance_records where session_id = tests.uid('session_a_open'))::int,
  3,
  'three records exist before close'
);

select tests.set_auth_user(tests.uid('rep_a'));

select is(
  (select absences_written from public.close_session(tests.uid('session_a_open'))),
  3,
  'close_session writes an absence for each enrolled student with no record'
);

select tests.clear_auth();

select is(
  (select count(*) from public.attendance_records where session_id = tests.uid('session_a_open'))::int,
  6,
  'every enrolled student now has a row — absences are rows, not the absence of rows'
);

select is(
  (select count(*) from public.attendance_records
    where session_id = tests.uid('session_a_open')
      and status in ('pending_verification', 'pending_permission_review'))::int,
  0,
  'no record is left pending after close (ADR-009)'
);

select is(
  (select status from public.attendance_sessions where id = tests.uid('session_a_open')),
  'closed'::public.session_status,
  'the session is closed'
);

-- THE IDEMPOTENCY TEST.
--
-- "Assume every job double-fires." The auto-close cron and a rep hitting Close
-- can land at the same moment; a cron retry after a timeout does the same. If
-- this writes 3 more absences, every student in the system gets duplicate rows
-- and every percentage is wrong.
select is(
  (select absences_written from public.close_session(tests.uid('session_a_open'))),
  0,
  'close_session is IDEMPOTENT — a second call writes nothing and does not raise'
);

select is(
  (select count(*) from public.attendance_records where session_id = tests.uid('session_a_open'))::int,
  6,
  'and the record count is unchanged after the double-fire'
);

select * from finish();
rollback;
