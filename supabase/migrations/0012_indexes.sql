-- 0012_indexes
--
-- §5: "Indexes on every FK, plus composites for the real queries."
--
-- Postgres does NOT index foreign keys automatically. It indexes the primary
-- key side; the referencing side is bare unless you say otherwise. Every
-- unindexed FK is a sequential scan waiting for the table to grow, and a lock
-- contention problem on the parent's DELETE.
--
-- The composites here are not speculative — each one is a query this product
-- actually runs, named in the comment. An index nobody's query shape matches is
-- write amplification with good intentions.

-- ── FK indexes ───────────────────────────────────────────────────────────────

create index faculties_institution_id_idx on public.faculties (institution_id);
create index departments_institution_id_idx on public.departments (institution_id);
create index departments_faculty_id_idx on public.departments (faculty_id);
create index programs_institution_id_idx on public.programs (institution_id);
create index programs_department_id_idx on public.programs (department_id);
create index academic_years_institution_id_idx on public.academic_years (institution_id);
create index semesters_institution_id_idx on public.semesters (institution_id);
create index semesters_academic_year_id_idx on public.semesters (academic_year_id);
create index calendar_events_institution_id_idx on public.academic_calendar_events (institution_id);
create index calendar_events_semester_id_idx on public.academic_calendar_events (semester_id);

create index profiles_institution_id_idx on public.profiles (institution_id);
create index profiles_department_id_idx on public.profiles (department_id);
create index profiles_program_id_idx on public.profiles (program_id);

create index user_roles_user_id_idx on public.user_roles (user_id);
create index user_roles_granted_by_idx on public.user_roles (granted_by);

create index invitations_institution_id_idx on public.invitations (institution_id);
create index invitations_invited_by_idx on public.invitations (invited_by);
create index invitations_accepted_by_idx on public.invitations (accepted_by);

create index courses_institution_id_idx on public.courses (institution_id);
create index courses_department_id_idx on public.courses (department_id);
create index courses_academic_year_id_idx on public.courses (academic_year_id);

create index class_sections_institution_id_idx on public.class_sections (institution_id);
create index class_sections_course_id_idx on public.class_sections (course_id);
create index class_sections_semester_id_idx on public.class_sections (semester_id);
create index class_sections_instructor_id_idx on public.class_sections (instructor_id);

create index enrollments_class_section_id_idx on public.enrollments (class_section_id);

create index rep_assignments_class_section_id_idx on public.course_rep_assignments (class_section_id);
create index rep_assignments_assigned_by_idx on public.course_rep_assignments (assigned_by);
create index rep_assignments_revoked_by_idx on public.course_rep_assignments (revoked_by);

create index schedule_rules_class_section_id_idx on public.schedule_rules (class_section_id);

create index sessions_opened_by_idx on public.attendance_sessions (opened_by);
create index sessions_closed_by_idx on public.attendance_sessions (closed_by);
create index sessions_cancelled_by_idx on public.attendance_sessions (cancelled_by);
create index sessions_schedule_rule_id_idx on public.attendance_sessions (generated_from_schedule_rule_id);
create index sessions_rules_snapshot_id_idx on public.attendance_sessions (rules_snapshot_id);

create index session_makeups_makeup_session_id_idx on public.session_makeups (makeup_session_id);

create index permission_reasons_institution_id_idx on public.permission_reasons (institution_id);

create index records_session_id_idx on public.attendance_records (session_id);
create index records_decided_by_idx on public.attendance_records (decided_by);
create index records_permission_reason_id_idx on public.attendance_records (permission_reason_id);
create index records_permission_decided_by_idx on public.attendance_records (permission_decided_by);
create index records_overridden_by_idx on public.attendance_records (overridden_by);
create index records_rules_snapshot_id_idx on public.attendance_records (rules_snapshot_id);

create index disputes_record_id_idx on public.attendance_disputes (record_id);
create index disputes_student_id_idx on public.attendance_disputes (student_id);
create index disputes_responded_by_idx on public.attendance_disputes (responded_by);
create index disputes_resolved_by_idx on public.attendance_disputes (resolved_by);

create index attendance_rules_institution_id_idx on public.attendance_rules (institution_id);
create index attendance_rules_created_by_idx on public.attendance_rules (created_by);
create index rule_snapshots_source_rule_id_idx on public.attendance_rule_snapshots (source_rule_id);

create index audit_log_actor_id_idx on public.audit_log (actor_id);
create index notifications_user_id_idx on public.notifications (user_id);

-- ── Composites for the queries this product actually runs ────────────────────

-- §5's named composite. "Sessions for this section, this term" — the register
-- grid, the section page, and the schedule generator's idempotency check.
create index sessions_section_date_idx
  on public.attendance_sessions (class_section_id, session_date desc);

-- The student's Today screen: "open sessions, for sections I'm in, right now".
-- Partial, because 'open' is a handful of rows out of a term's thousands and
-- this is the query that runs when 300 people open the app at 09:00.
create index sessions_open_idx
  on public.attendance_sessions (class_section_id, starts_at)
  where status = 'open';

-- The auto-close cron's sweep: "open sessions past their close time".
create index sessions_open_ends_at_idx
  on public.attendance_sessions (ends_at)
  where status = 'open';

-- §5's named composite. The student's history page and their percentage.
create index records_student_status_idx
  on public.attendance_records (student_id, status);

-- §5's named composite. The register grid, per session.
create index records_session_status_idx
  on public.attendance_records (session_id, status);

-- The rep's verify queue (§6.3) — the highest-traffic query in the product,
-- run every few seconds by every rep with a session open, and re-run by
-- Realtime on every submission.
--
-- §5 asks for a "partial index on pending statuses" and this is it. Partial
-- because a term's records are overwhelmingly resolved: this index stays the
-- size of the current queue rather than the size of history, so it lives in
-- memory permanently. submitted_at ordering matches the queue's "oldest-first"
-- sort, so the index answers the ORDER BY too.
create index records_pending_queue_idx
  on public.attendance_records (class_section_id, submitted_at)
  where status in ('pending_verification', 'pending_permission_review');

-- The section roster, and close_session()'s "who was enrolled on the day".
create index enrollments_section_student_idx
  on public.enrollments (class_section_id, student_id);

-- auth_is_active_rep_for_section() runs on virtually every rep-side policy
-- check. It must be an index hit, or RLS becomes the product's bottleneck.
create index rep_assignments_active_idx
  on public.course_rep_assignments (user_id, class_section_id, starts_at, ends_at)
  where revoked_at is null;

-- The audit log is written constantly and read rarely, but when it is read it
-- is always "what happened to this thing" or "what did this person do".
create index audit_log_entity_idx
  on public.audit_log (entity_type, entity_id, created_at desc);

create index audit_log_created_at_idx on public.audit_log (created_at desc);

-- The notification bell: unread, newest first.
create index notifications_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

-- Rule resolution: "the rules in force for this scope". Most-specific-wins
-- means this is queried per scope level, newest version first.
create index attendance_rules_scope_idx
  on public.attendance_rules (institution_id, scope, scope_id, version desc);

-- ── Uniqueness that needed a partial index ───────────────────────────────────

-- Matric numbers are unique per institution — but only among people who have
-- one. Staff profiles carry null, and in SQL nulls do not collide, so a plain
-- unique constraint would silently permit unlimited staff while appearing to
-- enforce something.
create unique index profiles_matric_number_unique
  on public.profiles (institution_id, matric_number)
  where matric_number is not null;

-- One session per section per timeslot. Stops the generate-sessions cron from
-- double-writing a term's worth of sessions when it double-fires — the same
-- idempotency argument as job_runs, enforced where it cannot be argued with.
create unique index sessions_section_starts_at_unique
  on public.attendance_sessions (class_section_id, starts_at)
  where status <> 'cancelled';

-- §4 requires appoint → revoke → re-appoint history, so (user_id,
-- class_section_id) cannot be unique. What must never happen is two
-- SIMULTANEOUS active grants for the same person and section — that makes
-- "who was rep on the day" ambiguous, which is the one question this table
-- exists to answer.
--
-- An exclusion constraint says exactly that and nothing more: no two
-- non-revoked rows for the same user and section may have overlapping
-- appointment periods. A unique index cannot express it; a trigger could, but
-- would race under concurrency.
alter table public.course_rep_assignments
  add constraint rep_assignments_no_overlapping_active
  exclude using gist (
    user_id with =,
    class_section_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (revoked_at is null);
