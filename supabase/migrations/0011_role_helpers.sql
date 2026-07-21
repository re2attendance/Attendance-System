-- 0011 — Role helpers.
--
-- Every policy needs to ask "who is this?", and the obvious way — a subquery against
-- role_assignments — deadlocks the moment role_assignments has its own policy that
-- looks at profiles: Postgres raises infinite recursion, and the tempting fix is to
-- disable RLS on one of them, which is precisely how these systems leak.
--
-- These functions are SECURITY DEFINER, so they run as the owner and bypass RLS on
-- the tables they read. Policies call them instead of querying directly, and the
-- recursion never arises.
--
-- Every function is:
--   stable            — same answer throughout a statement, so the planner caches it
--   security definer  — bypasses RLS on role_assignments / profiles
--   search_path = ''  — nothing resolves through a caller-controlled path, so a
--                       hostile schema on the search path cannot hijack a name
--
-- `(select auth.uid())` is wrapped in a subselect deliberately: Postgres hoists it
-- into an InitPlan and evaluates it once per statement rather than once per row.

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.role_assignments ra
     where ra.user_id = (select auth.uid())
       and ra.role = 'admin'
       and ra.revoked_at is null
  );
$$;

create or replace function public.is_student()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()));
$$;

-- The class a student belongs to; null for admins, who have no profile.
create or replace function public.my_class_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.class_id from public.profiles p where p.id = (select auth.uid());
$$;

create or replace function public.is_course_rep(target_class uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.role_assignments ra
     where ra.user_id = (select auth.uid())
       and ra.role = 'course_rep'
       and ra.class_id = target_class
       and ra.revoked_at is null
  );
$$;

create or replace function public.is_watcher(target_class uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.role_assignments ra
     where ra.user_id = (select auth.uid())
       and ra.role = 'watcher'
       and ra.class_id = target_class
       and ra.revoked_at is null
  );
$$;

-- Which class a session belongs to. Needed by policies on the attendance tables,
-- which are two or three joins away from a class and would otherwise have to
-- subquery sessions — itself an RLS-protected table.
create or replace function public.session_class(target_session uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select s.class_id from public.sessions s where s.id = target_session;
$$;

create or replace function public.window_class(target_window uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select s.class_id
    from public.attendance_windows w
    join public.sessions s on s.id = w.session_id
   where w.id = target_window;
$$;

create or replace function public.checkin_class(target_checkin uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select s.class_id
    from public.attendance_checkins c
    join public.attendance_windows w on w.id = c.window_id
    join public.sessions s on s.id = w.session_id
   where c.id = target_checkin;
$$;

-- Is this attendance record currently under dispute? The admin's read access to
-- attendance is scoped to exactly this (D-016) — the narrow exception to "the admin
-- cannot see attendance records" that judging a dispute requires.
create or replace function public.record_has_open_dispute(target_record uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.disputes d
     where d.record_id = target_record and d.state = 'open'
  );
$$;

-- Is the student who owns this record a course rep for its class? Their attendance
-- is routed to the watcher rather than to their fellow reps (build plan §7.3).
create or replace function public.record_belongs_to_rep(target_record uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.attendance_records r
      join public.sessions s on s.id = r.session_id
      join public.role_assignments ra
        on ra.user_id = r.student_id
       and ra.class_id = s.class_id
       and ra.role = 'course_rep'
       and ra.revoked_at is null
     where r.id = target_record
  );
$$;

revoke execute on function
  public.is_admin(), public.is_student(), public.my_class_id(),
  public.is_course_rep(uuid), public.is_watcher(uuid),
  public.session_class(uuid), public.window_class(uuid), public.checkin_class(uuid),
  public.record_has_open_dispute(uuid), public.record_belongs_to_rep(uuid)
from public, anon;

grant execute on function
  public.is_admin(), public.is_student(), public.my_class_id(),
  public.is_course_rep(uuid), public.is_watcher(uuid),
  public.session_class(uuid), public.window_class(uuid), public.checkin_class(uuid),
  public.record_has_open_dispute(uuid), public.record_belongs_to_rep(uuid)
to authenticated;
