-- 0012 — RLS policies.
--
-- Two layers, deliberately. Policies decide which ROWS a role may see. Grants decide
-- which VERBS a role may attempt at all. Where a table must never be written directly
-- — the whole attendance chain — the verb is revoked as well as unpolicied, so a
-- careless permissive policy added later still cannot open a write path.
--
-- `anon` gets nothing anywhere. Every policy targets `authenticated`.

-- ---------------------------------------------------------------------------
-- Grants. Declared here rather than inherited.
--
-- Supabase carries two sets of default privileges for schema `public`: one from
-- `supabase_admin` granting full DML to anon/authenticated/service_role, and one
-- from `postgres` granting only `Dxtm` (TRUNCATE, REFERENCES, TRIGGER, MAINTAIN).
-- Migrations run as `postgres`, so which one applies depends on platform version —
-- and it genuinely differed between this project's local stack and its hosted
-- database. Relying on it means the same migration produces different security in
-- two environments, which is how a policy gap ships unnoticed.
--
-- Note also that the default hands out TRUNCATE, and **TRUNCATE is not subject to
-- RLS**: a role holding it can empty a table no policy would let it read. That
-- alone makes the defaults unacceptable to inherit for an attendance ledger.
--
-- So: revoke everything, then grant back deliberately.
-- ---------------------------------------------------------------------------

-- Nobody unauthenticated touches anything.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- No TRUNCATE for anyone but the owner, on any table, ever.
revoke truncate on all tables in schema public from authenticated, service_role;

-- Baseline: a signed-in user may *attempt* to read anything; policies decide which
-- rows actually come back. Read access without a matching policy returns zero rows.
grant select on all tables in schema public to authenticated;

-- Tables the admin manages. The verbs are granted to `authenticated` because that
-- is the only role a logged-in admin has; the admin_writes_* policies below are
-- what restrict them to actual admins.
grant insert, update, delete on
  public.semesters, public.holidays, public.classes, public.rooms,
  public.lecturers, public.courses, public.class_courses,
  public.timetable_entries, public.sessions, public.attendance_settings,
  public.role_assignments
to authenticated;

-- Profiles: a user creates and edits their own row at signup. Never deletes.
grant insert, update on public.profiles to authenticated;

-- Everything else — the entire attendance chain and the audit log — receives no
-- DML grant at all. Writes reach those tables only through SECURITY DEFINER
-- functions, which run as the owner and do not need a caller-side grant.

-- ---------------------------------------------------------------------------
-- Reference data: readable by any signed-in user, writable only by the admin.
-- A student needs the timetable to know where to be; none of it is sensitive.
-- ---------------------------------------------------------------------------
create policy read_semesters on public.semesters
  for select to authenticated using (true);
create policy admin_writes_semesters on public.semesters
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy read_holidays on public.holidays
  for select to authenticated using (true);
create policy admin_writes_holidays on public.holidays
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy read_classes on public.classes
  for select to authenticated using (true);
create policy admin_writes_classes on public.classes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy read_rooms on public.rooms
  for select to authenticated using (true);
create policy admin_writes_rooms on public.rooms
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy read_lecturers on public.lecturers
  for select to authenticated using (true);
create policy admin_writes_lecturers on public.lecturers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy read_courses on public.courses
  for select to authenticated using (true);
create policy admin_writes_courses on public.courses
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy read_class_courses on public.class_courses
  for select to authenticated using (true);
create policy admin_writes_class_courses on public.class_courses
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy read_timetable on public.timetable_entries
  for select to authenticated using (true);
create policy admin_writes_timetable on public.timetable_entries
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy read_settings on public.attendance_settings
  for select to authenticated using (true);
create policy admin_writes_settings on public.attendance_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Sessions: your own class only. The admin manages them but, per build plan §6,
-- gets no attendance data — a session is scheduling, not attendance.
-- ---------------------------------------------------------------------------
create policy read_own_class_sessions on public.sessions
  for select to authenticated
  using (public.is_admin() or class_id = public.my_class_id());

create policy admin_writes_sessions on public.sessions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy read_cancellations on public.session_cancellations
  for select to authenticated
  using (
    public.is_admin()
    or public.session_class(session_id) = public.my_class_id()
  );

-- ---------------------------------------------------------------------------
-- Profiles.
--
-- Note what is absent: the admin has NO row access here. Build plan §6 says the
-- admin sees student names only — never index numbers or emails — and RLS filters
-- rows, not columns. The admin reads the view at the bottom of this file instead.
-- ---------------------------------------------------------------------------
create policy read_own_profile on public.profiles
  for select to authenticated using (id = (select auth.uid()));

-- Reps and watchers need names to run their queues, and only for their own class.
create policy staff_read_class_profiles on public.profiles
  for select to authenticated
  using (
    public.is_course_rep(class_id) or public.is_watcher(class_id)
  );

create policy update_own_profile on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Signup inserts the caller's own profile and nobody else's.
create policy insert_own_profile on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));

-- A profile is an attendance identity; deleting one would orphan its records.
revoke delete on public.profiles from authenticated;

-- ---------------------------------------------------------------------------
-- Role assignments: see your own, see who runs your class, admin sees all.
-- Only the admin appoints anyone.
-- ---------------------------------------------------------------------------
create policy read_role_assignments on public.role_assignments
  for select to authenticated
  using (
    public.is_admin()
    or user_id = (select auth.uid())
    or class_id = public.my_class_id()
  );

create policy admin_writes_roles on public.role_assignments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- The attendance chain — read-only to every client, always.
--
-- Writes happen exclusively through SECURITY DEFINER functions (0013), which
-- validate before they insert. Revoking the verbs means this holds even if someone
-- later adds a permissive policy by mistake.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on
  public.attendance_windows, public.attendance_checkins,
  public.attendance_flags, public.attendance_records,
  public.disputes, public.session_cancellations
from authenticated;

-- Windows: visible to your class, so a student can see attendance is open.
create policy read_windows on public.attendance_windows
  for select to authenticated
  using (
    public.is_admin() or public.session_class(session_id) = public.my_class_id()
  );

-- Check-ins: your own, plus the staff who verify your class.
create policy read_own_checkins on public.attendance_checkins
  for select to authenticated using (student_id = (select auth.uid()));

create policy staff_read_class_checkins on public.attendance_checkins
  for select to authenticated
  using (
    public.is_course_rep(public.window_class(window_id))
    or public.is_watcher(public.window_class(window_id))
  );

-- Flags are for verifiers only, never for the student they concern. Showing someone
-- "we noticed your submission shared a device" teaches them precisely how to evade
-- the check next week.
create policy staff_read_flags on public.attendance_flags
  for select to authenticated
  using (
    public.is_course_rep(public.checkin_class(checkin_id))
    or public.is_watcher(public.checkin_class(checkin_id))
  );

-- Records.
create policy read_own_records on public.attendance_records
  for select to authenticated using (student_id = (select auth.uid()));

-- A rep sees their whole class's history — build plan §8 requires it for the
-- dashboard, charts and rankings.
create policy rep_reads_class_records on public.attendance_records
  for select to authenticated
  using (public.is_course_rep(public.session_class(session_id)));

-- A watcher's remit is narrower: only the reps' own attendance, which is the single
-- job the role exists for (build plan §6).
create policy watcher_reads_rep_records on public.attendance_records
  for select to authenticated
  using (
    public.is_watcher(public.session_class(session_id))
    and public.record_belongs_to_rep(id)
  );

-- The admin exception (D-016), scoped as tightly as the requirement allows: judging
-- a dispute requires seeing the record under dispute, and nothing else.
create policy admin_reads_disputed_records on public.attendance_records
  for select to authenticated
  using (public.is_admin() and public.record_has_open_dispute(id));

-- Disputes: your own; your class's reps see them (§6); the admin judges them.
create policy read_own_disputes on public.disputes
  for select to authenticated using (student_id = (select auth.uid()));

create policy rep_reads_class_disputes on public.disputes
  for select to authenticated
  using (public.is_course_rep(public.session_class(
    (select r.session_id from public.attendance_records r where r.id = record_id)
  )));

create policy admin_reads_disputes on public.disputes
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Audit log: admin reads, nobody writes.
--
-- This is the admin's window onto rep behaviour (D-015) — visible without exposing
-- attendance itself. Writes come from definer triggers only; UPDATE and DELETE were
-- already revoked in 0009.
-- ---------------------------------------------------------------------------
revoke insert on public.audit_log from authenticated;

create policy admin_reads_audit on public.audit_log
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- The admin's student directory: names only.
--
-- Build plan §6 — "a student list showing full names only; index numbers and emails
-- are hidden". RLS cannot express that, because it filters rows and the requirement
-- is about columns. A view can: the sensitive columns are simply not selected, so
-- there is no query the admin can write that returns them.
-- ---------------------------------------------------------------------------
create view public.admin_student_directory
with (security_invoker = false) as
  select p.id, p.full_name, c.name as class_name, c.level
    from public.profiles p
    join public.classes c on c.id = p.class_id
   where public.is_admin();

-- The blanket revokes at the top of this file ran before this view existed, so it
-- picked default privileges back up. Strip them and grant only what it needs.
revoke all on public.admin_student_directory from anon, public, authenticated;
grant select on public.admin_student_directory to authenticated;

comment on view public.admin_student_directory is
  'Admin-facing student list. Deliberately omits index_number and email — the admin '
  'has no row access to public.profiles at all, so this view is the only path, and '
  'it cannot be made to yield the hidden columns.';
