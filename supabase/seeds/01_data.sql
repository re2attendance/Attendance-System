-- supabase/seeds/01_data.sql
--
-- Runs on `pnpm db:reset`. §13: "Seeds must exercise every status and every
-- dashboard chart — a seed that produces empty dashboards is useless."
--
-- So this is not a handful of rows. It is a believable term in progress:
-- history behind it, live sessions right now, a queue waiting for a rep, and
-- arguments in flight. If a dashboard renders empty against this seed, the
-- dashboard is wrong.
--
-- Deterministic: every "random" choice is a hash of stable inputs, so the same
-- reset produces the same database. A seed that differs run to run makes a
-- failing test a coin toss.
--
-- Test accounts and their passwords: docs/TEST_ACCOUNTS.md.

-- ─────────────────────────────────────────────────────────────────────────────
-- Speed
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The summary trigger recomputes a student's section totals on every record
-- write. That is correct for one rep approving one student, and quadratic for a
-- seed inserting ~10k records. Disable it, insert, then recompute every pair
-- once at the end — which also proves recalc_attendance_summary() can rebuild
-- from nothing, the property a backfill would depend on.
alter table public.attendance_records disable trigger attendance_records_refresh_summary;

-- ─────────────────────────────────────────────────────────────────────────────
-- Org
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.institutions (id, name, short_name, timezone, allow_self_registration)
values (seed.seed_uid('inst'), 'University of Accra', 'UoA', 'Africa/Accra', false);

insert into public.faculties (id, institution_id, name, code) values
  (seed.seed_uid('fac_sci'), seed.seed_uid('inst'), 'Faculty of Science', 'SCI'),
  (seed.seed_uid('fac_eng'), seed.seed_uid('inst'), 'Faculty of Engineering', 'ENG');

insert into public.departments (id, institution_id, faculty_id, name, code) values
  (seed.seed_uid('dep_csc'), seed.seed_uid('inst'), seed.seed_uid('fac_sci'), 'Computer Science', 'CSC'),
  (seed.seed_uid('dep_mth'), seed.seed_uid('inst'), seed.seed_uid('fac_sci'), 'Mathematics', 'MTH'),
  (seed.seed_uid('dep_eee'), seed.seed_uid('inst'), seed.seed_uid('fac_eng'), 'Electrical Engineering', 'EEE');

insert into public.programs (id, institution_id, department_id, name, code, duration_years) values
  (seed.seed_uid('prog_csc'), seed.seed_uid('inst'), seed.seed_uid('dep_csc'), 'BSc Computer Science', 'BSC-CSC', 4),
  (seed.seed_uid('prog_mth'), seed.seed_uid('inst'), seed.seed_uid('dep_mth'), 'BSc Mathematics', 'BSC-MTH', 4),
  (seed.seed_uid('prog_eee'), seed.seed_uid('inst'), seed.seed_uid('dep_eee'), 'BEng Electrical Engineering', 'BENG-EEE', 4);

insert into public.academic_years (id, institution_id, name, starts_on, ends_on)
values (seed.seed_uid('year'), seed.seed_uid('inst'), '2025/2026', '2025-09-01', '2026-08-31');

-- One past semester (finalized — its records are locked, §6.6) and one live.
insert into public.semesters (id, institution_id, academic_year_id, name, starts_on, ends_on, add_drop_deadline, status, finalized_at) values
  (seed.seed_uid('sem_past'), seed.seed_uid('inst'), seed.seed_uid('year'), 'First',
   (current_date - interval '10 months')::date, (current_date - interval '6 months')::date,
   (current_date - interval '9 months')::date, 'finalized', now() - interval '6 months'),
  (seed.seed_uid('sem_now'), seed.seed_uid('inst'), seed.seed_uid('year'), 'Second',
   (current_date - interval '9 weeks')::date, (current_date + interval '5 weeks')::date,
   (current_date - interval '7 weeks')::date, 'active', null);

-- §5: sessions must not be auto-generated onto these.
insert into public.academic_calendar_events (institution_id, semester_id, title, event_type, starts_on, ends_on) values
  (seed.seed_uid('inst'), seed.seed_uid('sem_now'), 'Mid-semester break', 'break',
   (current_date - interval '3 weeks')::date, (current_date - interval '2 weeks' - interval '4 days')::date),
  (seed.seed_uid('inst'), seed.seed_uid('sem_now'), 'Founders'' Day', 'holiday',
   (current_date - interval '5 weeks')::date, (current_date - interval '5 weeks')::date),
  (seed.seed_uid('inst'), seed.seed_uid('sem_now'), 'Examinations', 'exam_period',
   (current_date + interval '5 weeks')::date, (current_date + interval '7 weeks')::date);

-- ─────────────────────────────────────────────────────────────────────────────
-- Rules
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.attendance_rules (
  id, institution_id, scope, scope_id, version,
  present_within_minutes, late_within_minutes, beyond_late_window,
  grace_period_minutes, auto_close_minutes_after_end,
  allow_late_submission, late_submission_window_hours, min_attendance_percent
) values (
  seed.seed_uid('rule_global_v1'), seed.seed_uid('inst'), 'global', null, 1,
  10, 20, 'late', 5, 15, true, 48, 75
);

-- A stricter section-level override, so the most-specific-wins cascade has
-- something to resolve and the admin rules screen has more than one row.
insert into public.attendance_rules (
  id, institution_id, scope, scope_id, version,
  present_within_minutes, late_within_minutes, beyond_late_window,
  grace_period_minutes, auto_close_minutes_after_end,
  allow_late_submission, late_submission_window_hours, min_attendance_percent
) values (
  seed.seed_uid('rule_sec1_v1'), seed.seed_uid('inst'), 'class_section', seed.seed_uid('section_1'), 1,
  5, 15, 'absent', 0, 10, false, 0, 80
);

insert into public.attendance_rule_snapshots (
  id, source_rule_id, source_version,
  present_within_minutes, late_within_minutes, beyond_late_window,
  grace_period_minutes, auto_close_minutes_after_end,
  allow_late_submission, late_submission_window_hours, min_attendance_percent
) values (
  seed.seed_uid('snap_v1'), seed.seed_uid('rule_global_v1'), 1,
  10, 20, 'late', 5, 15, true, 48, 75
);

insert into public.permission_reasons (id, institution_id, code, label, counts_as_excused, requires_attachment, sort_order) values
  (seed.seed_uid('reason_medical'), seed.seed_uid('inst'), 'medical', 'Medical', true, true, 1),
  (seed.seed_uid('reason_bereavement'), seed.seed_uid('inst'), 'bereavement', 'Bereavement', true, false, 2),
  (seed.seed_uid('reason_religious'), seed.seed_uid('inst'), 'religious', 'Religious observance', true, false, 3),
  (seed.seed_uid('reason_sanctioned'), seed.seed_uid('inst'), 'sanctioned', 'University-sanctioned activity', true, false, 4),
  (seed.seed_uid('reason_other'), seed.seed_uid('inst'), 'other', 'Other', false, false, 5);

-- ─────────────────────────────────────────────────────────────────────────────
-- People
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Passwords are bcrypt-hashed so these accounts really log in from Phase 3.
-- Local seed only — this file never runs against a deployed database.

-- Staff
select seed.make_user('admin', 'admin@uoa.edu.gh');
select seed.make_user('instructor_1', 'k.mensah@uoa.edu.gh');
select seed.make_user('instructor_2', 'a.owusu@uoa.edu.gh');
select seed.make_user('instructor_3', 'y.asante@uoa.edu.gh');

insert into public.profiles (id, institution_id, full_name, email, matric_number, department_id, program_id, level, status) values
  (seed.seed_uid('admin'), seed.seed_uid('inst'), 'Ama Darko', 'admin@uoa.edu.gh', null, seed.seed_uid('dep_csc'), null, null, 'active'),
  (seed.seed_uid('instructor_1'), seed.seed_uid('inst'), 'Dr Kwame Mensah', 'k.mensah@uoa.edu.gh', null, seed.seed_uid('dep_csc'), null, null, 'active'),
  (seed.seed_uid('instructor_2'), seed.seed_uid('inst'), 'Dr Akosua Owusu', 'a.owusu@uoa.edu.gh', null, seed.seed_uid('dep_mth'), null, null, 'active'),
  (seed.seed_uid('instructor_3'), seed.seed_uid('inst'), 'Dr Yaw Asante', 'y.asante@uoa.edu.gh', null, seed.seed_uid('dep_eee'), null, null, 'active');

insert into public.user_roles (user_id, role, scope_type, scope_id) values
  (seed.seed_uid('admin'), 'admin', 'global', null),
  (seed.seed_uid('instructor_1'), 'instructor', 'global', null),
  (seed.seed_uid('instructor_2'), 'instructor', 'global', null),
  (seed.seed_uid('instructor_3'), 'instructor', 'global', null);

-- 300 students. Names are assembled from small pools — enough variety that a
-- table of 40 rows looks like a real cohort rather than "Student 1..40", which
-- is the seed equivalent of lorem ipsum (§11.9).
do $$
declare
  v_first text[] := array['Kofi','Ama','Yaw','Akua','Kwabena','Abena','Kwesi','Esi','Kojo','Adwoa',
                          'Fiifi','Efua','Kwaku','Afia','Nana','Akosua','Yaa','Kwame','Aba','Kobby'];
  v_last text[] := array['Mensah','Owusu','Boateng','Asante','Adjei','Appiah','Darko','Ofori','Agyemang','Sarpong',
                         'Antwi','Amoah','Bediako','Frimpong','Gyasi','Nkrumah','Osei','Quartey','Tetteh','Yeboah'];
  i int;
  v_key text;
  v_id uuid;
  v_name text;
  v_dept uuid;
  v_prog uuid;
  v_status public.profile_status;
begin
  for i in 1..300 loop
    v_key := 'student_' || i;
    v_name := v_first[1 + (seed.seed_roll(v_key || 'f') % 20)] || ' ' ||
              v_last[1 + (seed.seed_roll(v_key || 'l') % 20)];

    case (i % 3)
      when 0 then v_dept := seed.seed_uid('dep_csc'); v_prog := seed.seed_uid('prog_csc');
      when 1 then v_dept := seed.seed_uid('dep_mth'); v_prog := seed.seed_uid('prog_mth');
      else v_dept := seed.seed_uid('dep_eee'); v_prog := seed.seed_uid('prog_eee');
    end case;

    -- A few non-active students, because every list and filter in the product
    -- has to cope with them and a seed of 300 healthy students never proves it.
    v_status := case
      when i = 297 then 'withdrawn'::public.profile_status
      when i = 298 then 'suspended'::public.profile_status
      when i = 299 then 'graduated'::public.profile_status
      else 'active'::public.profile_status
    end;

    v_id := seed.make_user(v_key, 'student' || i || '@st.uoa.edu.gh');

    insert into public.profiles (id, institution_id, full_name, email, matric_number, department_id, program_id, level, status)
    values (v_id, seed.seed_uid('inst'), v_name, 'student' || i || '@st.uoa.edu.gh',
            'CSC/2021/' || lpad(i::text, 4, '0'), v_dept, v_prog, 400, v_status);

    insert into public.user_roles (user_id, role, scope_type, scope_id)
    values (v_id, 'student', 'global', null);
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Curriculum — 12 courses, 20 sections
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_codes text[] := array['CSC 401','CSC 403','CSC 405','CSC 407','MTH 401','MTH 403',
                          'EEE 401','EEE 403','CSC 411','CSC 413','MTH 411','EEE 411'];
  v_titles text[] := array['Compilers','Operating Systems','Computer Networks','Artificial Intelligence',
                           'Real Analysis','Abstract Algebra','Power Systems','Control Engineering',
                           'Distributed Systems','Machine Learning','Numerical Methods','Signal Processing'];
  i int;
  v_dept uuid;
begin
  for i in 1..12 loop
    v_dept := case
      when v_codes[i] like 'CSC%' then seed.seed_uid('dep_csc')
      when v_codes[i] like 'MTH%' then seed.seed_uid('dep_mth')
      else seed.seed_uid('dep_eee')
    end;

    insert into public.courses (id, institution_id, department_id, academic_year_id, code, title, credit_units, level)
    values (seed.seed_uid('course_' || i), seed.seed_uid('inst'), v_dept, seed.seed_uid('year'),
            v_codes[i], v_titles[i], 3, 400);
  end loop;
end;
$$;

-- 20 sections: 12 in the live semester, 8 in the finalized one.
do $$
declare
  i int;
  v_course uuid;
  v_sem uuid;
  v_instructor uuid;
begin
  for i in 1..20 loop
    v_course := seed.seed_uid('course_' || (1 + ((i - 1) % 12)));
    v_sem := case when i <= 12 then seed.seed_uid('sem_now') else seed.seed_uid('sem_past') end;
    v_instructor := seed.seed_uid('instructor_' || (1 + ((i - 1) % 3)));

    insert into public.class_sections (id, institution_id, course_id, semester_id, section_code, instructor_id, capacity, room)
    values (seed.seed_uid('section_' || i), seed.seed_uid('inst'), v_course, v_sem,
            case when i <= 12 then 'A' else 'B' end,
            v_instructor, 120, 'LT' || (1 + (i % 6)));
  end loop;
end;
$$;

-- Enrollments: every student into ~4 of the 12 live sections.
do $$
declare
  s int;
  sec int;
begin
  for s in 1..300 loop
    for sec in 1..12 loop
      if seed.seed_roll('enr_' || s || '_' || sec) < 33 then
        insert into public.enrollments (student_id, class_section_id, status, enrolled_at, dropped_at)
        values (
          seed.seed_uid('student_' || s),
          seed.seed_uid('section_' || sec),
          -- A handful of drops, so the denominator has to think.
          case when seed.seed_roll('drop_' || s || '_' || sec) < 4 then 'dropped'::public.enrollment_status
               else 'enrolled'::public.enrollment_status end,
          now() - interval '9 weeks',
          case when seed.seed_roll('drop_' || s || '_' || sec) < 4 then now() - interval '5 weeks'
               else null end
        )
        on conflict (student_id, class_section_id) do nothing;
      end if;
    end loop;
  end loop;
end;
$$;

-- Reps. Section 1 gets two (co-reps), one expired and one revoked — every state
-- the rep-assignment table can hold, because §4's whole argument is that this
-- is a row with a history and not a boolean.
do $$
declare
  sec int;
  v_rep uuid;
begin
  for sec in 1..12 loop
    select e.student_id into v_rep
    from public.enrollments e
    where e.class_section_id = seed.seed_uid('section_' || sec)
      and e.status = 'enrolled'
    order by e.student_id
    limit 1;

    if v_rep is not null then
      insert into public.course_rep_assignments (user_id, class_section_id, assigned_by, starts_at)
      values (v_rep, seed.seed_uid('section_' || sec), seed.seed_uid('instructor_1'), now() - interval '8 weeks');

      insert into public.user_roles (user_id, role, scope_type, scope_id)
      values (v_rep, 'course_rep', 'class_section', seed.seed_uid('section_' || sec))
      on conflict do nothing;
    end if;
  end loop;

  -- A co-rep on section 1: the mid-term reinforcement case, and the person who
  -- can legitimately approve the primary rep's own attendance (§4).
  select e.student_id into v_rep
  from public.enrollments e
  where e.class_section_id = seed.seed_uid('section_1')
    and e.status = 'enrolled'
    and e.student_id not in (
      select user_id from public.course_rep_assignments where class_section_id = seed.seed_uid('section_1')
    )
  order by e.student_id
  limit 1;

  if v_rep is not null then
    insert into public.course_rep_assignments (user_id, class_section_id, assigned_by, starts_at)
    values (v_rep, seed.seed_uid('section_1'), seed.seed_uid('instructor_1'), now() - interval '3 weeks');

    insert into public.user_roles (user_id, role, scope_type, scope_id)
    values (v_rep, 'course_rep', 'class_section', seed.seed_uid('section_1'))
    on conflict do nothing;
  end if;

  -- A handover: someone whose appointment ended. The row stays; the authority
  -- does not. This is what makes "who was rep in week 2?" answerable.
  select e.student_id into v_rep
  from public.enrollments e
  where e.class_section_id = seed.seed_uid('section_2')
    and e.status = 'enrolled'
    and e.student_id not in (
      select user_id from public.course_rep_assignments where class_section_id = seed.seed_uid('section_2')
    )
  order by e.student_id
  limit 1;

  if v_rep is not null then
    insert into public.course_rep_assignments (user_id, class_section_id, assigned_by, starts_at, ends_at)
    values (v_rep, seed.seed_uid('section_2'), seed.seed_uid('instructor_1'),
            now() - interval '8 weeks', now() - interval '4 weeks');
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Schedule rules — Mon/Thu, so generate-sessions has something to expand
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.schedule_rules (class_section_id, day_of_week, starts_at_local, ends_at_local, room, effective_from, effective_to)
select
  seed.seed_uid('section_' || i),
  d,
  (time '08:00' + ((i % 6) * interval '2 hours')),
  (time '10:00' + ((i % 6) * interval '2 hours')),
  'LT' || (1 + (i % 6)),
  (current_date - interval '9 weeks')::date,
  (current_date + interval '5 weeks')::date
from generate_series(1, 12) i
cross join unnest(array[1, 4]) d;

-- ─────────────────────────────────────────────────────────────────────────────
-- History — 8 weeks of closed sessions
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.attendance_sessions (
  id, class_section_id, session_date, starts_at, ends_at, description, room, status,
  opened_at, opened_by, closed_at, closed_by, session_code, code_rotated_at, rules_snapshot_id
)
select
  seed.seed_uid('sess_' || i || '_' || w),
  seed.seed_uid('section_' || i),
  (current_date - ((9 - w) * 7) * interval '1 day')::date,
  (current_date - ((9 - w) * 7) * interval '1 day')::timestamptz + interval '8 hours' + ((i % 6) * interval '2 hours'),
  (current_date - ((9 - w) * 7) * interval '1 day')::timestamptz + interval '10 hours' + ((i % 6) * interval '2 hours'),
  'Week ' || w || ' lecture',
  'LT' || (1 + (i % 6)),
  'closed',
  (current_date - ((9 - w) * 7) * interval '1 day')::timestamptz + interval '8 hours' + ((i % 6) * interval '2 hours'),
  seed.seed_uid('instructor_1'),
  (current_date - ((9 - w) * 7) * interval '1 day')::timestamptz + interval '10 hours' + ((i % 6) * interval '2 hours'),
  seed.seed_uid('instructor_1'),
  lpad((seed.seed_roll('code_' || i || '_' || w) * 7919 % 1000000)::text, 6, '0'),
  (current_date - ((9 - w) * 7) * interval '1 day')::timestamptz + interval '8 hours',
  seed.seed_uid('snap_v1')
from generate_series(1, 12) i
cross join generate_series(1, 8) w;

-- One cancelled session, so the "excluded from the denominator" path is real
-- and the makeup link has something to point at.
insert into public.attendance_sessions (
  id, class_section_id, session_date, starts_at, ends_at, description, room, status,
  cancelled_at, cancelled_by, cancelled_reason, rules_snapshot_id
) values (
  seed.seed_uid('sess_cancelled'), seed.seed_uid('section_1'),
  (current_date - interval '5 weeks')::date,
  (current_date - interval '5 weeks')::timestamptz + interval '8 hours',
  (current_date - interval '5 weeks')::timestamptz + interval '10 hours',
  'Week 4 lecture', 'LT2', 'cancelled',
  now() - interval '5 weeks', seed.seed_uid('instructor_1'),
  'Lecturer at conference; rescheduled.', seed.seed_uid('snap_v1')
);

insert into public.attendance_sessions (
  id, class_section_id, session_date, starts_at, ends_at, description, room, status,
  opened_at, opened_by, closed_at, closed_by, session_code, code_rotated_at, rules_snapshot_id
) values (
  seed.seed_uid('sess_makeup'), seed.seed_uid('section_1'),
  (current_date - interval '4 weeks' + interval '2 days')::date,
  (current_date - interval '4 weeks' + interval '2 days')::timestamptz + interval '16 hours',
  (current_date - interval '4 weeks' + interval '2 days')::timestamptz + interval '18 hours',
  'Makeup for week 4', 'LT2', 'closed',
  now() - interval '4 weeks', seed.seed_uid('instructor_1'),
  now() - interval '4 weeks' + interval '2 hours', seed.seed_uid('instructor_1'),
  '445566', now() - interval '4 weeks', seed.seed_uid('snap_v1')
);

insert into public.session_makeups (cancelled_session_id, makeup_session_id, created_by)
values (seed.seed_uid('sess_cancelled'), seed.seed_uid('sess_makeup'), seed.seed_uid('instructor_1'));

-- Historical records. The status mix is weighted to look like a real cohort:
-- mostly present, a tail of late, a real minority absent, a few rejected, and
-- the permission outcomes. Every status in the enum appears.
insert into public.attendance_records (
  student_id, session_id, class_section_id, status,
  submitted_at, submission_source, decision, decided_at, decided_by,
  verification_latency_seconds, permission_reason_id, permission_decision,
  permission_decided_at, permission_decided_by, permission_decision_note,
  rules_snapshot_id
)
select
  e.student_id,
  s.id,
  s.class_section_id,
  st.status,
  case when st.status in ('present','late','rejected') then s.starts_at + (st.roll % 25) * interval '1 minute' end,
  case when st.status in ('present','late','rejected') then 'student_web'::public.submission_source
       when st.status = 'absent' then 'system'::public.submission_source end,
  case when st.status in ('present','late') then 'approved'::public.attendance_decision
       when st.status = 'rejected' then 'rejected'::public.attendance_decision end,
  case when st.status in ('present','late','rejected') then s.starts_at + ((st.roll % 25) + 3) * interval '1 minute' end,
  case when st.status in ('present','late','rejected') then seed.seed_uid('instructor_1') end,
  case when st.status in ('present','late','rejected') then 60 + (st.roll % 400) end,
  case when st.status in ('permission_granted','excused') then seed.seed_uid('reason_medical')
       when st.status = 'absent' and st.roll % 17 = 0 then seed.seed_uid('reason_other') end,
  case when st.status in ('permission_granted','excused') then 'granted'::public.permission_decision
       when st.status = 'absent' and st.roll % 17 = 0 then 'rejected'::public.permission_decision end,
  case when st.status in ('permission_granted','excused') or (st.status = 'absent' and st.roll % 17 = 0)
       then s.starts_at - interval '2 hours' end,
  case when st.status in ('permission_granted','excused') or (st.status = 'absent' and st.roll % 17 = 0)
       then seed.seed_uid('instructor_1') end,
  case when st.status = 'absent' and st.roll % 17 = 0
       then 'No supporting evidence provided, and the reason given does not meet the policy.' end,
  s.rules_snapshot_id
from public.attendance_sessions s
join public.enrollments e
  on e.class_section_id = s.class_section_id
 and e.enrolled_at <= s.starts_at
 and (e.dropped_at is null or e.dropped_at > s.starts_at)
cross join lateral (
  select
    seed.seed_roll(e.student_id::text || s.id::text) as roll,
    case
      -- Student 300 is the low-attendance case: the eligibility report and the
      -- warning job need someone to actually be failing.
      when e.student_id = seed.seed_uid('student_300') then
        case when seed.seed_roll(e.student_id::text || s.id::text) < 60 then 'absent'::public.attendance_status
             else 'present'::public.attendance_status end
      when seed.seed_roll(e.student_id::text || s.id::text) < 60 then 'present'::public.attendance_status
      when seed.seed_roll(e.student_id::text || s.id::text) < 74 then 'late'::public.attendance_status
      when seed.seed_roll(e.student_id::text || s.id::text) < 87 then 'absent'::public.attendance_status
      when seed.seed_roll(e.student_id::text || s.id::text) < 90 then 'rejected'::public.attendance_status
      when seed.seed_roll(e.student_id::text || s.id::text) < 94 then 'permission_granted'::public.attendance_status
      -- ADR-010: a realistic term has some. If the seed never produces
      -- `unverified`, nobody building the register grid or the rep-activity
      -- report ever sees the state their screen has to explain.
      when seed.seed_roll(e.student_id::text || s.id::text) < 97 then 'unverified'::public.attendance_status
      else 'excused'::public.attendance_status
    end as status
) st
where s.status = 'closed'
on conflict (student_id, session_id) do nothing;

-- The cancelled session's records — every enrolled student, all cancelled.
insert into public.attendance_records (student_id, session_id, class_section_id, status, rules_snapshot_id)
select e.student_id, seed.seed_uid('sess_cancelled'), seed.seed_uid('section_1'), 'cancelled', seed.seed_uid('snap_v1')
from public.enrollments e
where e.class_section_id = seed.seed_uid('section_1')
on conflict (student_id, session_id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- Right now — three open sessions with a live queue (§13)
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.attendance_sessions (
  id, class_section_id, session_date, starts_at, ends_at, description, room, status,
  opened_at, opened_by, session_code, code_rotated_at, rules_snapshot_id
)
select
  seed.seed_uid('sess_open_' || i),
  seed.seed_uid('section_' || i),
  current_date,
  -- Staggered so the Today screen shows one inside the present window, one in
  -- the late window, and one just started — the three states the live session
  -- card has to render, visible at once.
  now() - (case i when 1 then interval '4 minutes' when 2 then interval '14 minutes' else interval '1 minute' end),
  now() + interval '55 minutes',
  'Today''s lecture', 'LT' || (1 + (i % 6)), 'open',
  now() - interval '15 minutes',
  seed.seed_uid('instructor_1'),
  lpad((seed.seed_roll('opencode_' || i) * 7919 % 1000000)::text, 6, '0'),
  now(),
  seed.seed_uid('snap_v1')
from generate_series(1, 3) i;

-- A queue waiting for a rep: pending verifications, oldest-first, so the verify
-- screen has something to be about.
insert into public.attendance_records (
  student_id, session_id, class_section_id, status, submitted_at, submission_source,
  device_fingerprint, submitted_ip, anti_proxy_flags, rules_snapshot_id
)
select
  e.student_id,
  seed.seed_uid('sess_open_' || i),
  seed.seed_uid('section_' || i),
  'pending_verification',
  now() - ((seed.seed_roll('pend_' || e.student_id::text) % 8) + 1) * interval '1 minute',
  'student_web',
  'fp_' || substr(md5(e.student_id::text), 1, 16),
  ('10.0.0.' || (1 + seed.seed_roll('ip_' || e.student_id::text) % 250))::inet,
  '{}',
  seed.seed_uid('snap_v1')
from generate_series(1, 3) i
join public.enrollments e
  on e.class_section_id = seed.seed_uid('section_' || i)
 and e.status = 'enrolled'
where seed.seed_roll('submits_' || e.student_id::text || i::text) < 55
on conflict (student_id, session_id) do nothing;

-- §7 layer 2: two students submitting from one device. Flagged, NEVER
-- auto-blocked — the rep's judgement is the control, and the badge is what
-- makes the queue worth looking at.
update public.attendance_records
set device_fingerprint = 'fp_shared_device_0001',
    anti_proxy_flags = array['shared_device']
where session_id = seed.seed_uid('sess_open_1')
  and student_id in (
    select student_id from public.attendance_records
    where session_id = seed.seed_uid('sess_open_1')
    order by student_id
    limit 2
  );

-- Pending permission requests, so the rep's permission queue is not empty.
insert into public.attendance_records (
  student_id, session_id, class_section_id, status,
  permission_reason_id, permission_note, rules_snapshot_id
)
select
  e.student_id,
  seed.seed_uid('sess_open_2'),
  seed.seed_uid('section_2'),
  'pending_permission_review',
  seed.seed_uid('reason_medical'),
  'Down with malaria since yesterday; hospital note attached.',
  seed.seed_uid('snap_v1')
from public.enrollments e
where e.class_section_id = seed.seed_uid('section_2')
  and e.status = 'enrolled'
  and seed.seed_roll('perm_' || e.student_id::text) < 6
on conflict (student_id, session_id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- Disputes (§13: "a couple of disputes")
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.attendance_disputes (record_id, student_id, message, status)
select r.id, r.student_id,
  'I was in the lecture and submitted from the back row — the code would not go through on my phone. Ask the rep, he saw me.',
  'open'
from public.attendance_records r
where r.status = 'absent'
order by r.id
limit 1;

insert into public.attendance_disputes (record_id, student_id, message, status, responded_at, responded_by, response_note)
select r.id, r.student_id,
  'Marked late but I was there before the lecturer. My submission was at 8:03.',
  'responded', now() - interval '2 days', seed.seed_uid('instructor_1'),
  'Checked the log — submission is timestamped 8:14. Referring to the instructor.'
from public.attendance_records r
where r.status = 'late'
order by r.id
limit 1;

insert into public.attendance_disputes (
  record_id, student_id, message, status, responded_at, responded_by, response_note,
  resolved_at, resolved_by, resolution_note
)
select r.id, r.student_id,
  'I had an approved permission for this session but it shows absent.',
  'resolved', now() - interval '6 days', seed.seed_uid('instructor_1'),
  'Looks like the permission was filed after the session closed.',
  now() - interval '5 days', seed.seed_uid('instructor_1'),
  'Upheld. Permission was granted late but the reason is valid; record overridden to excused.'
from public.attendance_records r
where r.status = 'rejected'
order by r.id
limit 1;

-- An instructor override, so the audit trail and the overrides screen have a
-- real example — is_override, a reason, and an author (§6.6).
update public.attendance_records
set status = 'excused',
    is_override = true,
    override_reason = 'Dispute upheld: permission granted late but the reason is valid.',
    overridden_by = seed.seed_uid('instructor_1')
where id = (
  select record_id from public.attendance_disputes where status = 'resolved' limit 1
);

-- ─────────────────────────────────────────────────────────────────────────────
-- System
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.notification_preferences (user_id, event_type, channel)
select p.id, e.event_type, 'in_app'
from public.profiles p
cross join (values ('attendance.approved'), ('attendance.rejected'), ('session.opened'), ('attendance.low_warning')) e(event_type)
on conflict (user_id, event_type) do nothing;

insert into public.notifications (user_id, event_type, title, body, link_path, read_at)
select seed.seed_uid('student_1'), 'session.opened', 'CSC 401 is open',
       'Report present before 08:10 to be marked present.', '/student/today', null;

insert into public.job_runs (job_name, run_key, status, started_at, finished_at, result) values
  ('close-sessions', 'close-sessions:' || to_char(now() - interval '1 day', 'YYYY-MM-DD"T"HH24:00'), 'succeeded',
   now() - interval '1 day', now() - interval '1 day' + interval '4 seconds',
   '{"sessions_closed": 12, "absences_written": 143}'::jsonb),
  ('generate-sessions', 'generate-sessions:' || to_char(now() - interval '1 day', 'YYYY-MM-DD'), 'succeeded',
   now() - interval '1 day', now() - interval '1 day' + interval '2 seconds',
   '{"sessions_created": 24}'::jsonb);

insert into public.audit_log (actor_id, action, entity_type, entity_id, after)
select seed.seed_uid('instructor_1'), 'attendance.overridden', 'attendance_record', r.id,
       jsonb_build_object('status', 'excused', 'reason', r.override_reason)
from public.attendance_records r
where r.is_override
limit 1;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rebuild the summaries
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The trigger was off for the bulk insert. Recomputing every (student, section)
-- pair from scratch here also exercises the path a backfill would take, and
-- proves the summary can be rebuilt from the ledger alone — which is the whole
-- reason it is derived rather than authoritative.

alter table public.attendance_records enable trigger attendance_records_refresh_summary;

do $$
declare r record;
begin
  for r in
    select distinct student_id, class_section_id
    from public.attendance_records
    where deleted_at is null
  loop
    perform public.recalc_attendance_summary(r.student_id, r.class_section_id);
  end loop;
end;
$$;
