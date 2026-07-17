-- supabase/seeds/00_helpers.sql
--
-- Scaffolding for the seed. Loaded first via config.toml's `sql_paths`.
--
-- This is a separate FILE and not the top of seed.sql for a concrete reason:
-- the CLI sends each seed file to Postgres as one batch, and every statement in
-- a batch is prepared before any of them executes. So a schema or function
-- created partway through a file cannot be referenced later in that same file —
-- it fails with `schema "seed" does not exist`, which reads like the CREATE
-- never ran when in fact it just had not run YET.
--
-- Separate files are separate batches. 00_helpers runs and commits; 01_data
-- then prepares against a database where these already exist.
--
-- pg_temp was the first attempt and fails for a related reason: the temp schema
-- belongs to one session, and there is no promise the next batch is on it.
--
-- 99_cleanup.sql drops all of this, so nothing here survives the reset.

-- A real schema, not pg_temp: the CLI sends this file as several batches, and a
-- temp schema created in one is not visible in the next ("schema pg_temp does
-- not exist"). Dropped at the end, so nothing survives into the database.
create schema if not exists seed;

-- ─────────────────────────────────────────────────────────────────────────────
-- Deterministic pseudo-randomness
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function seed.seed_uid(p_name text)
returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-' || substr(md5(p_name), 1, 12))::uuid;
$$;

-- Stable 0-99 from any key.
create or replace function seed.seed_roll(p_key text)
returns int language sql immutable as $$
  select ('x' || substr(md5(p_key), 1, 8))::bit(32)::bigint % 100;
$$;

-- Creates an auth.users row that GoTrue will actually accept.
--
-- The empty strings below are not padding. GoTrue scans these columns into
-- non-nullable Go strings, so a NULL makes it fail the login with
-- `converting NULL to string is unsupported`, surfaced to the client as a 500
-- "Database error querying schema" that says nothing about the real cause.
--
-- The columns are nullable in the schema, so the database accepts the row
-- happily. Postgres and GoTrue disagree about what a valid user is, and only
-- one of them is asked at INSERT time.
--
-- This shipped in Phase 2 and made every one of the 304 seeded accounts
-- unable to log in. Nothing caught it: Phase 2 had no login, and the pgTAP
-- suite sets request.jwt.claims directly — it never goes through GoTrue, so the
-- 104 RLS tests all passed against accounts that could not authenticate. Found
-- in Phase 3 by driving a real login, which is the only thing that would have.
--
-- The lesson generalises: writing directly into another system's tables means
-- adopting its invariants without its validation.
create or replace function seed.make_user(p_key text, p_email text)
returns uuid language plpgsql as $$
declare v_id uuid := seed.seed_uid(p_key);
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token,
    email_change, email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token
  ) values (
    v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_email, extensions.crypt('password123', extensions.gen_salt('bf')),
    now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    '', '', '', '', '', '', '', ''
  );
  return v_id;
end;
$$;
