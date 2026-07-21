-- 07 — The seeded rows that other things assume exist (0018).
--
-- Both of these are invisible failures. A missing settings row does not raise on
-- deployment; it surfaces later as every attendance function failing on a null threshold,
-- and the message names none of that. A missing class does not raise either; signup simply
-- shows "no classes have been set up" to every student who ever visits.

begin;
\ir fixtures/world.psql

select plan(6);

-- ---------------------------------------------------------------------------
-- The institution-wide attendance policy
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from public.attendance_settings where class_id is null),
  1,
  'exactly one institution-wide settings row exists'
);

-- effective_settings() left-joins the class override onto this row. With no such row the
-- join has nothing to hang off and returns zero rows, so every caller reads a null
-- threshold — which is why this is asserted rather than assumed.
select ok(
  (select count(*) = 1 from public.effective_settings(t.oid('classA'))),
  'effective_settings() resolves for a class with no override of its own'
);

select ok(
  (select first_window_minutes = 30 and windows_per_session = 2
          and rep_cancel_grace_minutes = 45
     from public.effective_settings(t.oid('classA'))),
  'and it resolves to the seeded institution-wide defaults'
);

-- ---------------------------------------------------------------------------
-- The classes a student picks at signup (D-065)
-- ---------------------------------------------------------------------------
select ok(
  (select count(*) = 2 from public.classes where name in ('RE1', 'RE2')),
  'the seeded test cohorts RE1 and RE2 both exist'
);

select ok(
  (select bool_and(level in (100, 200, 300, 400)) from public.classes),
  'every class carries a level the schema allows'
);

-- Signup is a form on a public page, so the class list has to be readable by someone who
-- does not yet have an account. If this ever regresses the dropdown is empty and every
-- new student is told signing up is not open.
set local role anon;
select ok(
  (select count(*) >= 2 from public.classes),
  'an unauthenticated visitor can read the class list, or nobody can sign up'
);
reset role;

select * from finish();
rollback;
