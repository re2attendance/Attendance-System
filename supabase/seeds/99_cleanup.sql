-- supabase/seeds/99_cleanup.sql
--
-- The seed helpers were scaffolding. Nothing in the `seed` schema should
-- outlive the reset: a stray seed_uid() left in a running database is an
-- invitation for something to start depending on it.
--
-- Its own file because it must be its own batch — see 00_helpers.sql.

drop schema if exists seed cascade;
