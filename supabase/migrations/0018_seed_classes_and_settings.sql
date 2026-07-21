-- 0018 — The first classes, and the policy row every attendance function reads.
--
-- Seed data in a migration rather than a seed script, deliberately: Supabase Branching
-- applies migrations to production on merge and never runs `supabase/seed.sql`, so a seed
-- file would populate every developer's machine and nothing that matters (D-059).

-- ---------------------------------------------------------------------------
-- Classes (D-065)
--
-- Two test cohorts, named by the owner. `level` is required and must be one of
-- 100/200/300/400 (0003); both are set to 100 because these exist to exercise the system
-- rather than to describe a real year group, and the admin can change it in Phase 2.
-- ---------------------------------------------------------------------------
insert into public.classes (name, level) values
  ('RE1', 100),
  ('RE2', 100)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- The institution-wide attendance policy.
--
-- `effective_settings()` resolves a class override against the row where class_id is null
-- (D-013). **Without this row it returns no rows at all**, and every function built on it
-- — submit_attendance, open_attendance_window, decide_attendance, raise_dispute — fails
-- on a null threshold rather than on anything a reader would recognise. Nothing created
-- this row until now; it was missing from production entirely.
--
-- Every value here is the column default, written out rather than inherited so the
-- operative policy is visible in one place instead of spread across 0007 and 0016.
-- ---------------------------------------------------------------------------
insert into public.attendance_settings (
  class_id,
  first_window_minutes,
  window_duration_minutes,
  windows_per_session,
  auto_open_after_minutes,
  gps_accuracy_floor_m,
  watcher_timeout_hours,
  dispute_window_minutes,
  max_disputes_per_semester,
  rep_cancel_grace_minutes,
  -- The campus geofence is deliberately left null: the constraint requires the centre and
  -- the radius together or neither, and nobody has supplied UPSA's coordinates yet.
  --
  -- **This disables the location check.** submit_attendance skips the fence entirely when
  -- campus_center is null, so until Phase 3 sets real coordinates a student could record
  -- attendance from anywhere. That is acceptable only because no attendance exists yet,
  -- and it must be closed before the first real session runs.
  campus_center,
  campus_radius_m
) values (
  null, 30, 10, 2, 15, 150, 2, 60, 2, 45, null, null
)
on conflict do nothing;
