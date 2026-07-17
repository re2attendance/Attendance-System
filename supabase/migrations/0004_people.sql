-- 0004_people
--
-- profiles, user_roles, invitations.

-- 1:1 with auth.users. on delete cascade because when Supabase Auth loses the
-- user, an orphan profile is worse than no profile — but note that attendance
-- records reference profiles with `on delete restrict`, so a student with
-- history cannot be deleted at all. That is deliberate: academic records
-- outlive accounts, and GDPR erasure is an anonymisation path (docs/PRIVACY.md),
-- not a DELETE.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  institution_id uuid not null references public.institutions (id) on delete restrict,

  full_name text not null,
  email extensions.citext not null,

  -- Matric / student number. Null for staff. Unique per institution when
  -- present — enforced by a partial unique index in 0012, since staff nulls
  -- must not collide.
  matric_number extensions.citext,

  department_id uuid references public.departments (id) on delete restrict,
  program_id uuid references public.programs (id) on delete restrict,
  level smallint check (level between 100 and 900),

  -- Shown in the rep's verify queue so a human can match a face to a request
  -- (§6.3). Private bucket, signed URLs only.
  avatar_path text,

  status public.profile_status not null default 'active',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (institution_id, email)
);

-- Additive and scoped (§4). NOT an enum column on the profile: a user holds
-- Student and Course Rep simultaneously, and permissions must add up rather
-- than replace each other.
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  scope_type public.role_scope_type not null,
  -- Null exactly when scope_type = 'global'. Not an FK: the target table
  -- depends on scope_type, so integrity is enforced by the grant tables that
  -- own each scope (course_rep_assignments for reps, class_sections.instructor_id
  -- for instructors) rather than pretended at here.
  scope_id uuid,

  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_roles_scope_id_matches_type check (
    (scope_type = 'global') = (scope_id is null)
  ),
  unique (user_id, role, scope_type, scope_id)
);

-- §2 Q4: invite-only. §8: tokens hashed at rest, single-use, expiring, scoped.
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete restrict,

  email extensions.citext not null,
  role public.app_role not null,
  scope_type public.role_scope_type not null,
  scope_id uuid,

  -- The token itself is NEVER stored. This is a SHA-256 of it; the plaintext
  -- exists only in the invite email. A leaked database must not yield working
  -- invitations.
  token_hash text not null,

  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,

  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (token_hash),
  constraint invitations_scope_id_matches_type check (
    (scope_type = 'global') = (scope_id is null)
  ),
  -- Single-use: accepted implies an acceptor, and vice versa.
  constraint invitations_accepted_consistent check (
    (accepted_at is null) = (accepted_by is null)
  )
);
