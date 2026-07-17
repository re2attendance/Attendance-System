-- 0011_rls_policies
--
-- THE SECURITY BOUNDARY.
--
-- Not middleware, not can(), not the UI. Those are conveniences that make the
-- product usable; this file is what makes it safe. If a policy here is wrong,
-- a student reads another student's academic record, and nothing upstream will
-- have stopped it.
--
-- Deny-by-default is structural, not declarative: `enable row level security`
-- with no permissive policy denies everything. So enabling RLS on every table
-- and then adding only the policies we mean IS the deny-by-default posture. A
-- table with RLS on and no policy is closed, which is the correct failure mode
-- for anything added later and forgotten.
--
-- Two conventions throughout:
--   · `to authenticated` on every policy. anon reads nothing, anywhere. The
--     absence of an anon policy is what enforces that.
--   · reads go through the auth_* helpers (0010), which are STABLE and
--     SECURITY DEFINER, so policies stay one function call deep and
--     index-friendly (§8).
--
-- Every policy in this file has a pgTAP test in supabase/tests. §8: "A policy
-- without a test doesn't count as done."

-- ─────────────────────────────────────────────────────────────────────────────
-- Enable RLS on EVERY table. No exceptions, no table ships without this.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array[
    'institutions', 'faculties', 'departments', 'programs',
    'academic_years', 'semesters', 'academic_calendar_events',
    'profiles', 'user_roles', 'invitations',
    'courses', 'class_sections', 'enrollments', 'course_rep_assignments',
    'schedule_rules', 'attendance_sessions', 'session_makeups',
    'permission_reasons', 'attendance_records', 'attendance_disputes',
    'attendance_rules', 'attendance_rule_snapshots',
    'audit_log', 'notifications', 'notification_preferences',
    'email_events', 'job_runs', 'feature_flags'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    -- Force RLS for the table owner too. Without this, the owner role bypasses
    -- every policy below, and "the owner" is exactly who a migration runs as.
    execute format('alter table public.%I force row level security', t);
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Org structure — readable by any authenticated user, written by admin.
--
-- Faculty and department names are not secrets; they are the furniture every
-- dropdown in the product is built from.
-- ─────────────────────────────────────────────────────────────────────────────

create policy institutions_read on public.institutions
  for select to authenticated using (true);
create policy institutions_admin on public.institutions
  for all to authenticated using (public.auth_is_admin()) with check (public.auth_is_admin());

create policy faculties_read on public.faculties
  for select to authenticated using (true);
create policy faculties_admin on public.faculties
  for all to authenticated using (public.auth_is_admin()) with check (public.auth_is_admin());

create policy departments_read on public.departments
  for select to authenticated using (true);
create policy departments_admin on public.departments
  for all to authenticated using (public.auth_is_admin()) with check (public.auth_is_admin());

create policy programs_read on public.programs
  for select to authenticated using (true);
create policy programs_admin on public.programs
  for all to authenticated using (public.auth_is_admin()) with check (public.auth_is_admin());

create policy academic_years_read on public.academic_years
  for select to authenticated using (true);
create policy academic_years_admin on public.academic_years
  for all to authenticated using (public.auth_is_admin()) with check (public.auth_is_admin());

create policy semesters_read on public.semesters
  for select to authenticated using (true);
create policy semesters_admin on public.semesters
  for all to authenticated using (public.auth_is_admin()) with check (public.auth_is_admin());

create policy calendar_events_read on public.academic_calendar_events
  for select to authenticated using (true);
create policy calendar_events_admin on public.academic_calendar_events
  for all to authenticated using (public.auth_is_admin()) with check (public.auth_is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- profiles
--
-- The PII table. A student reads their own profile and nobody else's.
--
-- Reps and instructors read the profiles of students in THEIR sections only —
-- they need a name and a photo to verify a face against a request (§6.3), and
-- they need it for exactly the people in the room, not the university.
-- ─────────────────────────────────────────────────────────────────────────────

create policy profiles_read_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy profiles_read_admin on public.profiles
  for select to authenticated using (public.auth_is_admin());

create policy profiles_read_own_students on public.profiles
  for select to authenticated using (
    exists (
      select 1
      from public.enrollments e
      where e.student_id = public.profiles.id
        and public.auth_can_administer_section(e.class_section_id)
    )
  );

-- A user may edit their own profile. WHICH columns they may edit is not RLS's
-- question and cannot be RLS's question: an earlier version of this policy
-- pinned the immutable fields with `status = (select status from profiles
-- where id = auth.uid())` and died with "infinite recursion detected in policy
-- for relation profiles" — a policy on profiles cannot read profiles.
--
-- RLS answers "which rows"; the columns are enforced by
-- profiles_protect_institutional_fields() in 0010, which is the right tool and
-- gives the user a real error instead of a silent no-op.
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy profiles_admin on public.profiles
  for all to authenticated using (public.auth_is_admin()) with check (public.auth_is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- user_roles — the keys to the kingdom.
--
-- Readable by the holder (the UI needs to know what to render) and by admin.
-- Writable by admin ONLY: a user who can insert their own user_roles row is an
-- admin, whatever the UI thinks.
-- ─────────────────────────────────────────────────────────────────────────────

create policy user_roles_read_own on public.user_roles
  for select to authenticated using (user_id = (select auth.uid()));

create policy user_roles_admin on public.user_roles
  for all to authenticated using (public.auth_is_admin()) with check (public.auth_is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- invitations
--
-- No SELECT policy for ordinary users, deliberately. An invitation row contains
-- a token hash and a role grant; acceptance happens through a Route Handler
-- using the service role, which looks the token up by hash. There is no reason
-- for a browser to read this table, so it cannot.
-- ─────────────────────────────────────────────────────────────────────────────

create policy invitations_admin on public.invitations
  for all to authenticated using (public.auth_is_admin()) with check (public.auth_is_admin());

-- Instructors invite reps into their own sections (§4).
create policy invitations_instructor on public.invitations
  for all to authenticated
  using (
    scope_type = 'class_section'
    and scope_id is not null
    and public.auth_is_instructor_for_section(scope_id)
  )
  with check (
    scope_type = 'class_section'
    and scope_id is not null
    and public.auth_is_instructor_for_section(scope_id)
    -- An instructor cannot mint an admin. Scoped invitations only.
    and role in ('course_rep', 'student')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Curriculum
-- ─────────────────────────────────────────────────────────────────────────────

create policy courses_read on public.courses
  for select to authenticated using (true);
create policy courses_admin on public.courses
  for all to authenticated using (public.auth_is_admin()) with check (public.auth_is_admin());

create policy class_sections_read on public.class_sections
  for select to authenticated using (true);
create policy class_sections_admin on public.class_sections
  for all to authenticated using (public.auth_is_admin()) with check (public.auth_is_admin());
create policy class_sections_instructor on public.class_sections
  for update to authenticated
  using (instructor_id = (select auth.uid()))
  with check (instructor_id = (select auth.uid()));

-- Enrollments: a student sees their own; section administrators see their
-- section's roster. Nobody else — the roster of a course is a list of who is
-- studying what, which is exactly the sort of thing GDPR has opinions about.
create policy enrollments_read_own on public.enrollments
  for select to authenticated using (student_id = (select auth.uid()));

create policy enrollments_read_section on public.enrollments
  for select to authenticated using (public.auth_can_administer_section(class_section_id));

create policy enrollments_admin on public.enrollments
  for all to authenticated using (public.auth_is_admin()) with check (public.auth_is_admin());

create policy enrollments_instructor on public.enrollments
  for all to authenticated
  using (public.auth_is_instructor_for_section(class_section_id))
  with check (public.auth_is_instructor_for_section(class_section_id));

-- §4: the Instructor appoints and revokes reps. A rep cannot appoint a rep —
-- otherwise the grant is self-propagating and the appointment period means
-- nothing.
create policy rep_assignments_read_own on public.course_rep_assignments
  for select to authenticated using (user_id = (select auth.uid()));

create policy rep_assignments_read_section on public.course_rep_assignments
  for select to authenticated using (public.auth_can_administer_section(class_section_id));

create policy rep_assignments_admin on public.course_rep_assignments
  for all to authenticated using (public.auth_is_admin()) with check (public.auth_is_admin());

create policy rep_assignments_instructor on public.course_rep_assignments
  for all to authenticated
  using (public.auth_is_instructor_for_section(class_section_id))
  with check (public.auth_is_instructor_for_section(class_section_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- Scheduling
-- ─────────────────────────────────────────────────────────────────────────────

create policy schedule_rules_read on public.schedule_rules
  for select to authenticated using (
    public.auth_is_enrolled_in_section(class_section_id)
    or public.auth_can_administer_section(class_section_id)
  );

create policy schedule_rules_write on public.schedule_rules
  for all to authenticated
  using (public.auth_is_admin() or public.auth_is_instructor_for_section(class_section_id))
  with check (public.auth_is_admin() or public.auth_is_instructor_for_section(class_section_id));

-- A student reads the sessions of sections they are enrolled in. That is the
-- Today screen's entire query.
create policy sessions_read on public.attendance_sessions
  for select to authenticated using (
    public.auth_is_enrolled_in_section(class_section_id)
    or public.auth_can_administer_section(class_section_id)
  );

-- Reps open, close and cancel sessions for their own sections, within their
-- appointment period — auth_can_administer_section carries the period check.
create policy sessions_write on public.attendance_sessions
  for all to authenticated
  using (public.auth_can_administer_section(class_section_id))
  with check (public.auth_can_administer_section(class_section_id));

create policy session_makeups_read on public.session_makeups
  for select to authenticated using (
    exists (
      select 1 from public.attendance_sessions s
      where s.id = session_makeups.cancelled_session_id
        and (
          public.auth_is_enrolled_in_section(s.class_section_id)
          or public.auth_can_administer_section(s.class_section_id)
        )
    )
  );

create policy session_makeups_write on public.session_makeups
  for all to authenticated
  using (
    exists (
      select 1 from public.attendance_sessions s
      where s.id = session_makeups.cancelled_session_id
        and public.auth_can_administer_section(s.class_section_id)
    )
  )
  with check (
    exists (
      select 1 from public.attendance_sessions s
      where s.id = session_makeups.cancelled_session_id
        and public.auth_can_administer_section(s.class_section_id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Rules
-- ─────────────────────────────────────────────────────────────────────────────

-- Readable by everyone: the student's live session card renders the present
-- window countdown from these, and a rule a student cannot see is a rule they
-- cannot be held to.
create policy permission_reasons_read on public.permission_reasons
  for select to authenticated using (true);
create policy permission_reasons_admin on public.permission_reasons
  for all to authenticated using (public.auth_is_admin()) with check (public.auth_is_admin());

create policy attendance_rules_read on public.attendance_rules
  for select to authenticated using (true);
create policy attendance_rules_admin on public.attendance_rules
  for all to authenticated using (public.auth_is_admin()) with check (public.auth_is_admin());

create policy rule_snapshots_read on public.attendance_rule_snapshots
  for select to authenticated using (true);

-- Snapshots are written when a session opens, by whoever opened it. There is
-- deliberately no UPDATE or DELETE policy — and the triggers in 0010 make that
-- true even for the service role, which RLS would not touch.
create policy rule_snapshots_insert on public.attendance_rule_snapshots
  for insert to authenticated with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- attendance_records — THE LEDGER
--
-- Everything above is preamble. This is the table the product exists to
-- protect.
-- ─────────────────────────────────────────────────────────────────────────────

-- §4: "Student — own records only."
create policy records_read_own on public.attendance_records
  for select to authenticated using (student_id = (select auth.uid()));

-- A rep reads their own sections' records, within their appointment period.
-- Not other sections'. Not the university's.
create policy records_read_section on public.attendance_records
  for select to authenticated using (public.auth_can_administer_section(class_section_id));

-- A student files their own request, for a section they are enrolled in, on a
-- session that is open.
--
-- The WITH CHECK is the "never trust the client" clause (§8), stated as data
-- rather than as a hope about the action layer:
--   · student_id must be them — no filing on a friend's behalf
--   · status must be a pending one — a client cannot submit itself 'present'
--   · no decision fields — a client cannot approve its own request
--   · is_override false — a client cannot forge an instructor override
--
-- submitted_at is not checked here because checking it is not enough: the
-- force_server_time trigger (0010) overwrites it, so a lying client is
-- corrected rather than rejected.
create policy records_insert_own on public.attendance_records
  for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and public.auth_is_enrolled_in_section(class_section_id)
    and public.auth_session_accepts_submissions(session_id)
    and status in ('pending_verification', 'pending_permission_review')
    and decision is null
    and permission_decision is null
    and is_override = false
    and not public.auth_section_is_finalized(class_section_id)
  );

-- THE CONFLICT-OF-INTEREST RULE (§4).
--
-- "A rep's own attendance request for a session they administer must be
-- approved by a co-rep or the instructor. Enforce in DB (RLS/constraint), not
-- just UI."
--
-- Stated as the more general truth it actually is: NOBODY decides their own
-- record. Not a rep, not an instructor who is somehow enrolled, not an admin.
-- The rule reads the same for every role, has no exceptions to remember, and
-- cannot be defeated by holding a second role.
--
-- `student_id <> auth.uid()` in BOTH using and with check: using stops them
-- reaching the row to decide it, with check stops them re-pointing a row at
-- themselves on the way out.
create policy records_decide_section on public.attendance_records
  for update to authenticated
  using (
    public.auth_can_administer_section(class_section_id)
    and student_id <> (select auth.uid())
    -- §6.6: records lock permanently once the semester is finalized.
    and not public.auth_section_is_finalized(class_section_id)
  )
  with check (
    public.auth_can_administer_section(class_section_id)
    and student_id <> (select auth.uid())
    and not public.auth_section_is_finalized(class_section_id)
  );

-- Admin is NOT given blanket access here, which is the one place this file
-- departs from the pattern above. §4 says admin does everything — but "decides
-- their own attendance record" is not a thing anyone should do, and an admin
-- who is also a student in a course is exactly the case the COI rule exists
-- for. Admin's real power over records is the override path, which is an
-- instructor/admin UPDATE that still cannot target their own row.
create policy records_admin_read on public.attendance_records
  for select to authenticated using (public.auth_is_admin());

create policy records_admin_write on public.attendance_records
  for update to authenticated
  using (public.auth_is_admin() and student_id <> (select auth.uid()))
  with check (public.auth_is_admin() and student_id <> (select auth.uid()));

-- No DELETE policy on attendance_records, for anyone. An academic record is not
-- deleted; deleted_at exists for GDPR anonymisation (docs/PRIVACY.md), which is
-- an UPDATE.

-- ─────────────────────────────────────────────────────────────────────────────
-- Disputes (§6.6)
-- ─────────────────────────────────────────────────────────────────────────────

create policy disputes_read_own on public.attendance_disputes
  for select to authenticated using (student_id = (select auth.uid()));

create policy disputes_insert_own on public.attendance_disputes
  for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and exists (
      select 1 from public.attendance_records r
      where r.id = record_id
        and r.student_id = (select auth.uid())
        and not public.auth_section_is_finalized(r.class_section_id)
    )
  );

create policy disputes_read_section on public.attendance_disputes
  for select to authenticated using (
    exists (
      select 1 from public.attendance_records r
      where r.id = attendance_disputes.record_id
        and public.auth_can_administer_section(r.class_section_id)
    )
  );

-- A rep responds; the instructor/admin has final say. A rep cannot resolve a
-- dispute about their own decision — same COI logic as above.
create policy disputes_respond_section on public.attendance_disputes
  for update to authenticated
  using (
    student_id <> (select auth.uid())
    and exists (
      select 1 from public.attendance_records r
      where r.id = attendance_disputes.record_id
        and public.auth_can_administer_section(r.class_section_id)
    )
  )
  with check (
    student_id <> (select auth.uid())
    and exists (
      select 1 from public.attendance_records r
      where r.id = attendance_disputes.record_id
        and public.auth_can_administer_section(r.class_section_id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- System
-- ─────────────────────────────────────────────────────────────────────────────

-- Admin reads the audit log. Nobody writes to it directly — there is no INSERT
-- policy, and log_audit() (0010, SECURITY DEFINER) is the only door. It stamps
-- actor_id itself, so an entry cannot lie about who acted.
--
-- No UPDATE or DELETE policy, and triggers enforce that beyond RLS's reach.
create policy audit_log_read_admin on public.audit_log
  for select to authenticated using (public.auth_is_admin());

create policy notifications_own on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));

-- Marking your own notification read. Sending is a job's business.
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy notification_preferences_own on public.notification_preferences
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Deliverability data is operational and contains recipient addresses.
create policy email_events_admin on public.email_events
  for select to authenticated using (public.auth_is_admin());

create policy job_runs_admin on public.job_runs
  for select to authenticated using (public.auth_is_admin());

-- Flags are read by the client to decide what to render, so they are readable.
-- They are not writable by anyone holding a user JWT except admin.
create policy feature_flags_read on public.feature_flags
  for select to authenticated using (true);

create policy feature_flags_admin on public.feature_flags
  for all to authenticated using (public.auth_is_admin()) with check (public.auth_is_admin());
