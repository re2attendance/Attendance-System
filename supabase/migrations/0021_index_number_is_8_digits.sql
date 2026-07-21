-- 0021 — Index numbers are 8 digits, not 7.
--
-- Corrects 0004, which had it at 7. Two constraints encode the length and they have to move
-- together: the index itself, and the email shape — because `profiles_email_matches_index`
-- requires the address to begin with the index number, so an 8-digit index in a 7-digit
-- address is a row that satisfies neither.
--
-- Safe to apply without a data migration: `profiles` is empty. Signup has been reachable
-- for less than a day and no student account exists yet. Had there been rows, this would
-- need a rewrite step first, and `alter table … add constraint` would have rejected the
-- change outright rather than corrupting anything — which is the behaviour we want.
--
-- Not a `DESTRUCTIVE` migration: dropping a CHECK constraint removes a rule, not a row.

alter table public.profiles
  drop constraint profiles_index_is_7_digits,
  add  constraint profiles_index_is_8_digits check (index_number ~ '^[0-9]{8}$');

alter table public.profiles
  drop constraint profiles_email_shape,
  add  constraint profiles_email_shape check (
    email::text ~ '^[0-9]{8}@[a-z0-9.-]+\.[a-z]{2,}$'
  );

comment on column public.profiles.index_number is
  'The 8 digits on a student ID. The email prefix must equal it exactly '
  '(profiles_email_matches_index), so these two constraints always move together.';
