-- 0001_extensions
--
-- supabase/migrations is the single source of truth for this database
-- (ADR-001): tables, indexes, RLS, functions, triggers, enums. Forward-only,
-- and replayed from scratch on every PR — if it is not in here, it does not
-- exist.

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "citext" with schema extensions;

-- Lets an exclusion constraint mix equality (user_id, class_section_id) with
-- range overlap (&&). 0012 uses it to forbid two overlapping ACTIVE rep
-- appointments for the same person and section, while still allowing the
-- appoint → revoke → re-appoint history that §4 requires.
create extension if not exists "btree_gist" with schema extensions;

-- Emails are case-insensitive in practice, and treating them otherwise invites
-- two accounts for one human. citext makes that structural rather than a
-- lower() call everyone has to remember.
