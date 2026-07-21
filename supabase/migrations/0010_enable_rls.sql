-- 0010 — Enable Row Level Security on every table.
--
-- Deliberately separate from, and immediately after, the tables themselves: with RLS
-- off, the anon key — which is inlined into the client bundle and therefore public —
-- can read and write every row. Locking is not a later phase.
--
-- Enabling RLS without policies denies everything, which is the correct resting state
-- for this design. Access is opened deliberately, table by table, in the policy
-- migration that follows. Nothing reads these tables yet, so nothing breaks.
--
-- Note that RLS does not apply to SECURITY DEFINER functions, which is exactly how
-- the attendance write path is meant to work (D-004): the client cannot touch the
-- tables, and every privileged write goes through a function that validates first.

alter table public.semesters              enable row level security;
alter table public.holidays               enable row level security;
alter table public.classes                enable row level security;
alter table public.rooms                  enable row level security;
alter table public.lecturers              enable row level security;
alter table public.profiles               enable row level security;
alter table public.role_assignments       enable row level security;
alter table public.courses                enable row level security;
alter table public.class_courses          enable row level security;
alter table public.timetable_entries      enable row level security;
alter table public.sessions               enable row level security;
alter table public.session_cancellations  enable row level security;
alter table public.attendance_settings    enable row level security;
alter table public.attendance_windows     enable row level security;
alter table public.attendance_checkins    enable row level security;
alter table public.attendance_flags       enable row level security;
alter table public.attendance_records     enable row level security;
alter table public.disputes               enable row level security;
alter table public.audit_log              enable row level security;
