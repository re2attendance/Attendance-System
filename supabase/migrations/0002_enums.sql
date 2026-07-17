-- 0002_enums

-- Roles are additive and scoped rows in user_roles (§4), never a column on the
-- profile. A user is Student AND Course Rep at the same time, and a rep is a
-- student who happens to hold a grant for one section.
create type public.app_role as enum (
  'admin',
  'instructor',
  'course_rep',
  'student'
);

-- What a role grant is scoped TO. 'global' is admin's; a rep's grant is always
-- scoped to a class_section and bounded in time (see course_rep_assignments).
create type public.role_scope_type as enum (
  'global',
  'institution',
  'faculty',
  'department',
  'course',
  'class_section'
);

-- The ledger's vocabulary (§5). Two distinctions here are load-bearing and must
-- survive every future refactor:
--
--   rejected ≠ absent   — rejected means "claimed present, wasn't". Both count
--                         against attendance; collapsing them erases the
--                         difference between not turning up and being judged to
--                         have lied, which is what disputes turn on.
--   excused ≠ permission_granted
--                       — excused leaves the percentage denominator entirely;
--                         permission_granted stays in it. Driven by
--                         permission_reasons.counts_as_excused.
--
--   unverified ≠ absent  — the student submitted on time and nobody ever
--                         decided. See ADR-010. Charging a student for a rep's
--                         inaction is the one place this system would make
--                         someone lose for something they could not influence,
--                         so it gets its own word and leaves the denominator.
--
-- Ordered so `order by status` groups the unresolved states together: the two
-- pendings and their terminal form sit at the top, verdicts follow.
create type public.attendance_status as enum (
  'pending_verification',
  'pending_permission_review',
  'unverified',
  'present',
  'late',
  'permission_granted',
  'absent',
  'rejected',
  'excused',
  'cancelled'
);

-- §6.1: scheduled → open → closed, or cancelled at any point. Absences do not
-- exist until close_session() runs.
create type public.session_status as enum (
  'scheduled',
  'open',
  'closed',
  'cancelled'
);

-- Attendance percentage is meaningless without this table's status: a student
-- who dropped in week 3 must not be absent for weeks 4-14.
create type public.enrollment_status as enum (
  'enrolled',
  'dropped',
  'withdrawn'
);

create type public.profile_status as enum (
  'active',
  'suspended',
  'withdrawn',
  'graduated'
);

-- 'finalized' is terminal and load-bearing: §6.6 says records lock permanently
-- once the semester is finalized. After that even an instructor override is
-- refused.
create type public.semester_status as enum (
  'upcoming',
  'active',
  'closed',
  'finalized'
);

create type public.attendance_decision as enum ('approved', 'rejected');
create type public.permission_decision as enum ('granted', 'rejected');

create type public.dispute_status as enum (
  'open',
  'responded',
  'resolved',
  'rejected'
);

-- Rules cascade most-specific-wins: section overrides course overrides
-- department overrides global.
create type public.rule_scope as enum (
  'global',
  'department',
  'course',
  'class_section'
);

-- §6.5: "Approved, beyond that → late (or absent if the rule says so — make it
-- explicit, don't leave it implied)." So it is a stored rule, not a constant in
-- a branch.
create type public.beyond_late_window as enum ('late', 'absent');

-- Sessions must not be auto-generated onto these (§5), and no session on one of
-- these days accepts a submission.
--
-- 'emergency' is the impromptu one: campus shuts, nobody can come in. It
-- differs from 'holiday' in exactly two ways, and both are enforced rather than
-- documented (see declare_calendar_event in 0010):
--
--   · it may only be declared FOR TODAY — never in advance, never backdated
--   · it applies to a single day
--
-- A holiday is planned, so it is declared ahead. An emergency is not, so it is
-- declared as it happens. Neither may be backdated: a retroactive declaration
-- is indistinguishable from erasing a day's absences, which is the whole reason
-- someone would want one.
create type public.calendar_event_type as enum (
  'holiday',
  'break',
  'exam_period',
  'emergency'
);

create type public.notification_channel as enum ('email', 'in_app', 'off');

-- How an attendance request reached us. Recorded per record so an audit can
-- tell a phone in a lecture hall from a rep's manual entry from a job.
create type public.submission_source as enum (
  'student_web',
  'rep_manual',
  'system'
);

create type public.job_run_status as enum ('running', 'succeeded', 'failed');
