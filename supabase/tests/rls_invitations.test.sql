-- Invitations: who may create them, and what accepting one does.
--
-- §8: "Invitation tokens: hashed at rest, single-use, expiring, scoped."
--
-- An invitation IS a role grant. A readable invitations table with an admin
-- invite in it is an admin account, and a link that can be pointed at a
-- different email is a way to hand yourself someone else's authority. Those two
-- sentences are what this file tests.

begin;

create extension if not exists pgtap with schema extensions;
\ir helpers.sql

select plan(19);

select tests.seed_fixture();

-- A live invitation, and one of each spent kind. Hashes are fake but distinct —
-- the real hashing happens in TypeScript (features/invitations/tokens.ts); the
-- database only ever sees a hash, which is the property under test.
insert into public.invitations (
  id, institution_id, email, role, scope_type, scope_id,
  token_hash, expires_at, invited_by, accepted_at, accepted_by, revoked_at
)
select
  tests.uid('inv_' || k), '11111111-1111-1111-1111-111111111111',
  (k || '@test.edu')::extensions.citext, 'student', 'global', null,
  'hash_' || k,
  case when k = 'expired' then now() - interval '1 day' else now() + interval '7 days' end,
  tests.uid('admin'),
  case when k = 'accepted' then now() else null end,
  case when k = 'accepted' then tests.uid('student_2') else null end,
  case when k = 'revoked' then now() else null end
from unnest(array['live', 'expired', 'revoked', 'accepted']) k;

-- ─────────────────────────────────────────────────────────────────────────────
-- Nobody reads the invitations table
-- ─────────────────────────────────────────────────────────────────────────────

select tests.set_anon();
select throws_ok(
  'select count(*) from public.invitations',
  '42501',
  null,
  'anon cannot read invitations'
);
select tests.clear_auth();

select tests.set_auth_user(tests.uid('student_1'));
select is(
  (select count(*) from public.invitations)::int,
  0,
  'a student cannot read invitations — a token hash and a role grant are not theirs to browse'
);
select tests.clear_auth();

select tests.set_auth_user(tests.uid('rep_a'));
select is(
  (select count(*) from public.invitations)::int,
  0,
  'nor can a rep'
);
select tests.clear_auth();

-- ─────────────────────────────────────────────────────────────────────────────
-- Lookup by hash — the only door, and it takes the hash, never the token
-- ─────────────────────────────────────────────────────────────────────────────

select tests.set_anon();

-- anon genuinely needs this: someone opening an invitation has no account yet.
select is(
  (select is_valid from public.get_invitation_by_token_hash('hash_live')),
  true,
  'anon CAN look up a live invitation by hash — they have no account yet, so they must'
);

select is(
  (select invalid_reason from public.get_invitation_by_token_hash('hash_expired')),
  'expired',
  'an expired invitation reports why'
);

select is(
  (select invalid_reason from public.get_invitation_by_token_hash('hash_revoked')),
  'revoked',
  'a revoked one reports why'
);

select is(
  (select invalid_reason from public.get_invitation_by_token_hash('hash_accepted')),
  'accepted',
  'an already-used one reports why'
);

select is(
  (select count(*)::int from public.get_invitation_by_token_hash('hash_nonexistent')),
  0,
  'an unknown hash returns nothing at all'
);

select tests.clear_auth();

-- ─────────────────────────────────────────────────────────────────────────────
-- Who may create one (RLS, 0011)
-- ─────────────────────────────────────────────────────────────────────────────

select tests.set_auth_user(tests.uid('instructor'));

select lives_ok(
  $$insert into public.invitations
      (institution_id, email, role, scope_type, scope_id, token_hash, expires_at, invited_by)
    values ('11111111-1111-1111-1111-111111111111', 'newrep@test.edu', 'course_rep',
            'class_section', tests.uid('section_a'), 'hash_newrep', now() + interval '7 days',
            tests.uid('instructor'))$$,
  'an instructor CAN invite a rep into their own section'
);

-- THE escalation test. An instructor minting an admin would make every
-- instructor an admin, one email at a time.
select throws_ok(
  $$insert into public.invitations
      (institution_id, email, role, scope_type, scope_id, token_hash, expires_at, invited_by)
    values ('11111111-1111-1111-1111-111111111111', 'me@test.edu', 'admin',
            'class_section', tests.uid('section_a'), 'hash_admin', now() + interval '7 days',
            tests.uid('instructor'))$$,
  '42501',
  null,
  'an instructor CANNOT mint an admin'
);

select throws_ok(
  $$insert into public.invitations
      (institution_id, email, role, scope_type, scope_id, token_hash, expires_at, invited_by)
    values ('11111111-1111-1111-1111-111111111111', 'x@test.edu', 'course_rep',
            'class_section', tests.uid('section_b'), 'hash_other', now() + interval '7 days',
            tests.uid('instructor'))$$,
  '42501',
  null,
  'nor invite into a section they do not own'
);

select tests.clear_auth();

select tests.set_auth_user(tests.uid('rep_a'));
select throws_ok(
  $$insert into public.invitations
      (institution_id, email, role, scope_type, scope_id, token_hash, expires_at, invited_by)
    values ('11111111-1111-1111-1111-111111111111', 'friend@test.edu', 'course_rep',
            'class_section', tests.uid('section_a'), 'hash_rep', now() + interval '7 days',
            tests.uid('rep_a'))$$,
  '42501',
  null,
  'a REP cannot invite anyone — a rep who can appoint a rep is a self-propagating grant (§4)'
);
select tests.clear_auth();

select tests.set_auth_user(tests.uid('student_1'));
select throws_ok(
  $$insert into public.invitations
      (institution_id, email, role, scope_type, scope_id, token_hash, expires_at, invited_by)
    values ('11111111-1111-1111-1111-111111111111', 'friend@test.edu', 'student',
            'global', null, 'hash_student', now() + interval '7 days', tests.uid('student_1'))$$,
  '42501',
  null,
  'a student cannot invite anyone'
);
select tests.clear_auth();

-- ─────────────────────────────────────────────────────────────────────────────
-- Accepting
-- ─────────────────────────────────────────────────────────────────────────────

-- A brand-new auth user with no profile — exactly the state signUp() leaves
-- someone in, mid-flow. The empty-string token columns are not decoration:
-- GoTrue scans them into non-nullable Go strings, and NULLs there make every
-- login fail with a 500 that blames the schema. That bug shipped in the Phase 2
-- seed and made all 304 accounts unable to log in.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change,
  email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token
) values (
  tests.uid('invitee'), '00000000-0000-0000-0000-000000000000', 'authenticated',
  'authenticated', 'live@test.edu', 'x', now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  '', '', '', '', '', '', '', ''
);

select tests.set_auth_user(tests.uid('invitee'));

select lives_ok(
  $$select public.accept_invitation('hash_live', 'Ivy Invitee')$$,
  'a newly signed-up user CAN claim the invitation sent to their address'
);

select tests.clear_auth();

select is(
  (select full_name from public.profiles where id = tests.uid('invitee')),
  'Ivy Invitee',
  'accepting creates their profile'
);

-- §4: roles are ADDITIVE. Everyone is a student of the institution; the invited
-- role is something MORE, not something instead.
select is(
  (select string_agg(role::text, '+' order by role::text)
     from public.user_roles where user_id = tests.uid('invitee')),
  'student',
  'and grants the invited role — additive, so a student invite yields exactly student'
);

select is(
  (select accepted_by from public.invitations where token_hash = 'hash_live'),
  tests.uid('invitee'),
  'and marks the invitation used, by them'
);

-- Single-use. The gate is a lock + re-check inside one transaction, not a
-- read-then-write.
select tests.set_auth_user(tests.uid('invitee'));
select throws_ok(
  $$select public.accept_invitation('hash_live', 'Ivy Again')$$,
  '23514',
  null,
  'the same invitation cannot be claimed twice'
);

-- THE hijack test. The invitation was sent to live@test.edu; this account is
-- someone else. Without this check, anyone who got hold of the link — a
-- forwarded email, a shared screen — could attach the grant to their own
-- account. For an admin invitation that is the whole system.
select tests.clear_auth();
select tests.set_auth_user(tests.uid('student_1'));

select throws_ok(
  $$select public.accept_invitation('hash_newrep', 'Sam Student')$$,
  '42501',
  null,
  'an invitation CANNOT be claimed by an account with a different email'
);

select tests.clear_auth();

select * from finish();
rollback;
