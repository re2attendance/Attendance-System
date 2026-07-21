-- 0004 — People: student profiles and role assignments.

-- Every non-admin user is a student first (build plan §5), so having a profile row
-- IS being a student. There is no 'student' role. Admins deliberately have no
-- profile: they are not students, and profiles requires an index number and a class
-- that an admin does not have (D-011 discussion, Q11).
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  full_name     text        not null,
  index_number  text        not null unique,
  email         extensions.citext not null unique,
  class_id      uuid        not null references public.classes (id) on delete restrict,
  created_at    timestamptz not null default now(),

  constraint profiles_name_not_blank  check (length(btrim(full_name)) > 0),
  constraint profiles_index_is_7_digits check (index_number ~ '^[0-9]{7}$'),

  -- Email must be <7-digit-index>@<domain>. The specific domain is configuration
  -- (NEXT_PUBLIC_UNIVERSITY_EMAIL_DOMAIN) and is enforced at signup, but the shape
  -- is enforced here so no future code path can insert a malformed identity.
  constraint profiles_email_shape check (email::text ~ '^[0-9]{7}@[a-z0-9.-]+\.[a-z]{2,}$'),

  -- "The first 7 digits of the email must match the entered student ID" (build plan
  -- §6) is a database constraint, not a validation step. Zod mirrors it for the
  -- error message; this is what makes it true.
  constraint profiles_email_matches_index check (
    split_part(email::text, '@', 1) = index_number
  )
);

comment on table public.profiles is
  'Student identities. Names are deliberately not unique — students share names. '
  'Uniqueness is on email and index number only.';

-- Roles beyond "student". Admin is global (class_id is null); course_rep and
-- watcher are scoped to a class.
create table public.role_assignments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  role        text        not null,
  class_id    uuid        references public.classes (id) on delete cascade,
  rep_slot    smallint,
  granted_by  uuid        references auth.users (id) on delete set null,
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,

  constraint role_assignments_role_valid check (role in ('admin', 'course_rep', 'watcher')),

  -- Admin is institution-wide; the class-scoped roles must name their class.
  constraint role_assignments_admin_is_global check ((role = 'admin') = (class_id is null)),

  -- Only course reps occupy a slot, and there are exactly three per class.
  constraint role_assignments_slot_iff_rep check ((role = 'course_rep') = (rep_slot is not null)),
  constraint role_assignments_slot_range   check (rep_slot is null or rep_slot between 1 and 3),

  constraint role_assignments_revoked_after_granted check (
    revoked_at is null or revoked_at >= granted_at
  )
);

-- "Minimum 1, maximum 3 course reps per class" (build plan §6) enforced declaratively:
-- slots are 1-3 by CHECK and each slot is unique per class, so a fourth rep has
-- nowhere to sit. No trigger, no counting query, and no race where two admins appoint
-- a third and fourth rep at the same moment. (The minimum of 1 is a workflow concern,
-- not a constraint — a class with no reps must be creatable before anyone is appointed.)
create unique index role_assignments_one_rep_per_slot
  on public.role_assignments (class_id, rep_slot)
  where role = 'course_rep' and revoked_at is null;

create unique index role_assignments_one_watcher_per_class
  on public.role_assignments (class_id)
  where role = 'watcher' and revoked_at is null;

-- A user cannot hold the same role twice over, live.
create unique index role_assignments_no_duplicate_live
  on public.role_assignments (user_id, role, coalesce(class_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where revoked_at is null;

comment on table public.role_assignments is
  'Elevated roles only. Revocation is soft (revoked_at) so history survives; the '
  'partial unique indexes police live assignments only.';
