-- 0019 — Let an unauthenticated visitor read the class list.
--
-- 0012 states "anon gets nothing anywhere. Every policy targets `authenticated`", and
-- revokes every privilege from `anon` across the schema. That was right for everything it
-- was written against — attendance, profiles, disputes — and wrong for exactly one table,
-- which nothing depended on until signup existed.
--
-- A student picks their class *while creating their account*, so the dropdown is rendered
-- for someone who has no session yet. Without this the query returns "permission denied",
-- the page falls back to its empty state, and every visitor is told signing up is not open
-- — with the database, the seed and the form all working correctly. Caught by a test
-- (07_seed) rather than by anyone using it, which is the only reason it is not shipping.
--
-- Deliberately the narrowest possible exception:
--
--   * `classes` only. Not rooms, not courses, not semesters — none of which signup needs.
--   * `select` only. `anon` still cannot write anything, anywhere.
--   * Nothing here is confidential: a class is a cohort name and a year of study, printed
--     on every timetable and noticeboard in the university. The roster is in `profiles`,
--     which `anon` still cannot touch.

grant select on public.classes to anon;

create policy read_classes_anon on public.classes
  for select to anon using (true);

comment on table public.classes is
  'Readable without a session (0019): the signup form must offer the class list to '
  'someone who does not have an account yet. Supersedes the "anon gets nothing" rule '
  'stated in 0012, for this table and this verb only.';
