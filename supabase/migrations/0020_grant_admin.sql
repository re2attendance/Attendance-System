-- 0020 — Grant the admin role to the owner's account (D-063).
--
-- **Why this cannot simply fail when the user is absent.**
--
-- D-063 chose "create the auth user in the dashboard, then a migration grants the role,
-- raising if it matches nothing so it cannot silently no-op". The raising half does not
-- survive contact with the rest of the system: migrations run on every environment, and
-- `auth.users` is per-environment. A hard failure here would break `supabase db reset` on
-- every developer machine and fail the `database` CI job on every pull request, because
-- neither has — or should have — the owner's account in it.
--
-- So it is conditional, and loud about it. In production the account exists and the role is
-- granted on deploy; everywhere else this reports and moves on. The intent of D-063 is kept
-- — the grant is in git, reviewable, and reproducible — while the mechanism suits the fact
-- that identities are not schema.
--
-- **Operationally: create the auth user before merging this.**
-- Supabase Dashboard → Authentication → Users → Add user → re2attendance@yahoo.com, with a
-- password, "Auto Confirm User" ticked. Branching applies this on merge to `main`; if the
-- account is not there yet, nothing is granted and this has to be re-run by hand.

do $$
declare
  v_email constant text := 're2attendance@yahoo.com';
  v_user  uuid;
begin
  select id into v_user from auth.users where lower(email) = v_email limit 1;

  if v_user is null then
    raise notice
      'Admin NOT granted: no auth user %. Expected on a local or CI database. In '
      'production, create the account (Dashboard -> Authentication -> Add user) and '
      're-run this statement.', v_email;
    return;
  end if;

  -- An admin is global: role_assignments_admin_is_global requires class_id to be null for
  -- 'admin' and non-null for the class-scoped roles. `granted_by` stays null because
  -- nobody granted it — the system did, and there was no administrator to do it.
  insert into public.role_assignments (user_id, role, class_id)
  values (v_user, 'admin', null)
  on conflict do nothing;

  -- Nothing to insert means the role was already held. Reporting which of the two happened
  -- matters: the interesting failure is a second admin appearing, not a repeated grant.
  if found then
    raise notice 'Admin granted to % (%).', v_email, v_user;
  else
    raise notice 'Admin already held by % (%); nothing changed.', v_email, v_user;
  end if;
end $$;
