-- Holidays and impromptu emergencies.
--
-- Two requirements:
--   1. A course rep or admin can declare a day a holiday. That day records as a
--      holiday and students cannot submit attendance on it.
--   2. A course rep or admin can declare a day an impromptu emergency — ON THAT
--      DAY ONLY — and any attendance already submitted and approved is reverted
--      and counted as the emergency.
--
-- The interesting tests are the ones about who may do this and when. A rep is a
-- student with a scoped grant (§4), and this feature hands them a button that
-- voids a day of academic records. The scope and the same-day rule are the only
-- things standing between "a rep can call off their own class" and "a student
-- can close the university and erase a term".

begin;

create extension if not exists pgtap with schema extensions;
\ir helpers.sql

select plan(28);

select tests.seed_fixture();

-- ─────────────────────────────────────────────────────────────────────────────
-- Scope: a rep declares for their OWN section, and nothing wider
-- ─────────────────────────────────────────────────────────────────────────────

select tests.set_auth_user(tests.uid('rep_a'));

select lives_ok(
  $$select public.declare_calendar_event(
      'holiday', current_date + 3, current_date + 3, 'No class Thursday', tests.uid('section_a')
    )$$,
  'a rep CAN declare a holiday for the section they administer'
);

-- THE privilege-escalation test. "Reps can declare a holiday" must not mean an
-- undergraduate can shut the university.
select throws_ok(
  $$select public.declare_calendar_event(
      'holiday', current_date + 3, current_date + 3, 'Everyone go home', null
    )$$,
  '42501',
  null,
  'a rep CANNOT declare an institution-wide holiday — that is admin''s alone'
);

select throws_ok(
  $$select public.declare_calendar_event(
      'holiday', current_date + 3, current_date + 3, 'Not my section', tests.uid('section_b')
    )$$,
  '42501',
  null,
  'a rep cannot declare a holiday for someone else''s section'
);

-- A break or an exam period is an institutional fact about the term.
select throws_ok(
  $$insert into public.academic_calendar_events
      (institution_id, class_section_id, title, event_type, starts_on, ends_on)
    values (
      (select institution_id from public.class_sections where id = tests.uid('section_a')),
      tests.uid('section_a'), 'Reading week', 'break', current_date + 3, current_date + 5
    )$$,
  '42501',
  null,
  'a rep cannot declare a break — reps get holidays and emergencies, not the term calendar'
);

select tests.clear_auth();

-- The appointment period governs this too.
select tests.set_auth_user(tests.uid('expired_rep'));
select throws_ok(
  $$select public.declare_calendar_event(
      'holiday', current_date + 3, current_date + 3, 'Nope', tests.uid('section_a')
    )$$,
  '42501',
  null,
  'a rep whose appointment ENDED cannot declare anything'
);
select tests.clear_auth();

select tests.set_auth_user(tests.uid('revoked_rep'));
select throws_ok(
  $$select public.declare_calendar_event(
      'holiday', current_date + 3, current_date + 3, 'Nope', tests.uid('section_a')
    )$$,
  '42501',
  null,
  'a REVOKED rep cannot declare anything'
);
select tests.clear_auth();

select tests.set_auth_user(tests.uid('student_1'));
select throws_ok(
  $$select public.declare_calendar_event(
      'holiday', current_date + 3, current_date + 3, 'Day off', tests.uid('section_a')
    )$$,
  '42501',
  null,
  'an ordinary student cannot declare a holiday'
);
select tests.clear_auth();

select tests.set_auth_user(tests.uid('admin'));
select lives_ok(
  $$select public.declare_calendar_event(
      'holiday', current_date + 10, current_date + 10, 'Founders'' Day', null
    )$$,
  'an admin CAN declare an institution-wide holiday'
);
select tests.clear_auth();

-- ─────────────────────────────────────────────────────────────────────────────
-- Dates: an emergency is TODAY, and nothing is backdated
-- ─────────────────────────────────────────────────────────────────────────────

select tests.set_auth_user(tests.uid('rep_a'));

-- "It is supposed to be on that particular day only." An emergency is
-- pronounced as it happens.
select throws_ok(
  $$select public.declare_calendar_event(
      'emergency', current_date - 1, current_date - 1, 'Yesterday was chaos', tests.uid('section_a')
    )$$,
  '23514',
  null,
  'an emergency CANNOT be declared for yesterday'
);

select throws_ok(
  $$select public.declare_calendar_event(
      'emergency', current_date + 1, current_date + 1, 'Tomorrow will be chaos', tests.uid('section_a')
    )$$,
  '23514',
  null,
  'an emergency cannot be declared for tomorrow — it is impromptu, not scheduled'
);

select throws_ok(
  $$select public.declare_calendar_event(
      'emergency', current_date, current_date + 2, 'All week', tests.uid('section_a')
    )$$,
  '23514',
  null,
  'an emergency cannot span several days — each day is pronounced on its own day'
);

-- The abuse this rule exists to stop: declaring last Tuesday a holiday to erase
-- last Tuesday's absences.
select throws_ok(
  $$select public.declare_calendar_event(
      'holiday', current_date - 7, current_date - 7, 'That week never happened', tests.uid('section_a')
    )$$,
  '23514',
  null,
  'a holiday cannot be BACKDATED — that is indistinguishable from erasing absences'
);

select tests.clear_auth();

select tests.set_auth_user(tests.uid('admin'));
select throws_ok(
  $$select public.declare_calendar_event(
      'holiday', current_date - 7, current_date - 7, 'Retroactive', null
    )$$,
  '23514',
  null,
  'not even an admin can backdate a holiday — correct records with an override instead'
);
select tests.clear_auth();

-- ─────────────────────────────────────────────────────────────────────────────
-- THE REQUIREMENT: an emergency reverts approved attendance
-- ─────────────────────────────────────────────────────────────────────────────

-- Set the scene: the session is open, students reported present, and the rep
-- approved them. Then the campus shuts.
select tests.set_auth_user(tests.uid('rep_a'));

update public.attendance_records
set decision = 'approved', decided_by = tests.uid('rep_a'), status = 'present'
where id in (tests.uid('record_s1'), tests.uid('record_s2'));

select tests.clear_auth();

select is(
  (select count(*) from public.attendance_records
    where id in (tests.uid('record_s1'), tests.uid('record_s2')) and status = 'present')::int,
  2,
  'two students are approved present before the emergency (scene set)'
);

select tests.set_auth_user(tests.uid('rep_a'));

select lives_ok(
  $$select public.declare_calendar_event(
      'emergency', current_date, current_date, 'Campus closed: flooding',
      tests.uid('section_a'), 'Water in the LT block; students told to stay away.'
    )$$,
  'a rep CAN pronounce today an emergency for their own section'
);

select tests.clear_auth();

select is(
  (select status from public.attendance_sessions where id = tests.uid('session_a_open')),
  'cancelled'::public.session_status,
  'the emergency cancels the day''s session'
);

select is(
  (select count(*) from public.attendance_records
    where session_id = tests.uid('session_a_open') and status = 'present')::int,
  0,
  'NO record is left saying present — approved attendance is reverted'
);

select is(
  (select count(*) from public.attendance_records
    where session_id = tests.uid('session_a_open') and status = 'cancelled')::int,
  3,
  'every record on the day is counted as the emergency (cancelled)'
);

-- The rep really did approve it, and that stays true. Voiding the status must
-- not rewrite what people actually did.
select is(
  (select decision from public.attendance_records where id = tests.uid('record_s1')),
  'approved'::public.attendance_decision,
  'the approval itself is NOT erased — the audit trail keeps what the rep did'
);

-- Traceable to the declaration that caused it, rather than a bare 'cancelled'.
select is(
  (select e.event_type
     from public.attendance_sessions s
     join public.academic_calendar_events e on e.id = s.cancelled_by_event_id
    where s.id = tests.uid('session_a_open')),
  'emergency'::public.calendar_event_type,
  'the session records WHY it was cancelled — the reason lives on the session, not on 300 records'
);

-- The denominator. This is what "not penalised" actually means.
select is(
  (select countable_total from public.attendance_summaries
    where student_id = tests.uid('student_1')
      and class_section_id = tests.uid('section_a')),
  0,
  'the emergency day leaves the percentage denominator — nobody is penalised for it'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Students cannot submit on a declared day
-- ─────────────────────────────────────────────────────────────────────────────

select tests.set_auth_user(tests.uid('outsider'));
select tests.clear_auth();

insert into public.enrollments (student_id, class_section_id, status, enrolled_at)
values (tests.uid('outsider'), tests.uid('section_a'), 'enrolled', now() - interval '60 days');

select tests.set_auth_user(tests.uid('outsider'));

select throws_ok(
  $$insert into public.attendance_records
      (student_id, session_id, class_section_id, status, submitted_at, submission_source)
    values (tests.uid('outsider'), tests.uid('session_a_open'), tests.uid('section_a'),
            'pending_verification', now(), 'student_web')$$,
  '42501',
  null,
  'a student CANNOT submit attendance on a day declared an emergency'
);

select tests.clear_auth();

-- And the same for a plain holiday, on a session that is still open — proving
-- the block comes from the DAY, not merely from the cancellation side effect.
select tests.set_auth_user(tests.uid('admin'));
select lives_ok(
  $$select public.declare_calendar_event(
      'holiday', current_date, current_date, 'Public holiday', null
    )$$,
  'an admin declares today an institution-wide holiday'
);
select tests.clear_auth();

select tests.set_auth_user(tests.uid('rep_b'));

select throws_ok(
  $$insert into public.attendance_records
      (student_id, session_id, class_section_id, status, submitted_at, submission_source)
    values (tests.uid('rep_b'), tests.uid('session_b_open'), tests.uid('section_b'),
            'pending_verification', now(), 'student_web')$$,
  '42501',
  null,
  'an institution-wide holiday blocks submission in every section'
);

select tests.clear_auth();

-- ─────────────────────────────────────────────────────────────────────────────
-- Accountability
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  (select count(*) from public.audit_log
    where action = 'calendar.declared.emergency'
      and actor_id = tests.uid('rep_a'))::int,
  1,
  'the emergency is audited against the rep who called it — this is not anonymous'
);

select is(
  (select (after->>'records_voided')::int from public.audit_log
    where action = 'calendar.declared.emergency'
      and actor_id = tests.uid('rep_a')
    order by id desc limit 1),
  3,
  'and the audit entry records how many records it voided'
);

-- A rep cannot quietly withdraw a declaration and take the evidence with it.
select tests.set_auth_user(tests.uid('rep_a'));

select throws_ok(
  $$delete from public.academic_calendar_events
    where event_type = 'emergency' and class_section_id = tests.uid('section_a')$$,
  '42501',
  null,
  'a rep cannot DELETE the emergency they declared'
);

-- Note the asymmetry, which is worth knowing when reading failures here:
-- DELETE throws 42501 because 0014 grants it to nobody, so it is refused at the
-- grant layer. UPDATE *is* granted to `authenticated`, so it reaches RLS — and
-- with no update policy for reps the row is simply invisible to the statement,
-- which affects zero rows and raises nothing. Same outcome, different layer, so
-- this asserts on the stored value rather than on an error.
update public.academic_calendar_events set title = 'nothing to see here'
where event_type = 'emergency'
  and class_section_id = tests.uid('section_a');

select tests.clear_auth();

-- Scoped to this test's own section. The seed declares an emergency too, so a
-- bare `where event_type = 'emergency'` matches two rows and the subquery
-- explodes. Same coupling that made tests.uid() collide with seed_uid(): the
-- fixture must not assume it is the only thing in the database.
select is(
  (select title from public.academic_calendar_events
    where event_type = 'emergency' and class_section_id = tests.uid('section_a')),
  'Campus closed: flooding',
  'nor edit it — a rep cannot rewrite the emergency they declared'
);

select * from finish();
rollback;
