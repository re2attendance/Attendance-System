-- 0015_invitations
--
-- The invite flow's two RPCs.
--
-- A new migration rather than an edit to 0010: this is Phase 3's work, not a
-- correction to Phase 2's, and the migration list reads better as a narrative
-- than as a single file that keeps growing.
--
-- Why RPCs at all, rather than the service-role client:
--
-- Accepting an invitation means creating a profile and role grants for someone
-- who does not have them yet — which is exactly the shape of thing that usually
-- reaches for service_role. But lib/supabase/admin.ts is ESLint-fenced to
-- jobs/* and app/api/cron/*, and invite acceptance is neither. The choice was
-- to widen the fence or to not need it.
--
-- Not needing it is better. These functions are SECURITY DEFINER, so they can
-- write the rows RLS would refuse — but they are narrow: each does exactly one
-- job, checks its own preconditions, and cannot be pointed at anything else. A
-- service-role client in a request path can do ANYTHING; this can create one
-- profile for one caller from one valid token. The fence stays intact and the
-- privileged surface stays two functions wide instead of one whole client.

-- ─────────────────────────────────────────────────────────────────────────────
-- Reading an invitation, by hash
-- ─────────────────────────────────────────────────────────────────────────────

-- invitations has no SELECT policy for ordinary users (0011) — a row holds a
-- token hash and a role grant, and a readable invitations table with an admin
-- invite in it is an admin account. So the /invite/[token] page cannot query
-- it, and this is the only way to look one up.
--
-- It takes the HASH, not the token: the plaintext never reaches the database,
-- so it cannot land in pg_stat_statements, a slow-query log, or a backup.
--
-- Returns only what the page needs to render — the email it was sent to, and
-- what accepting will grant. Never the hash, never who invited them, never the
-- other invitations. An attacker with a guessed hash learns one address they
-- already had to know the hash of.
create or replace function public.get_invitation_by_token_hash(p_token_hash text)
returns table (
  email text,
  role public.app_role,
  scope_type public.role_scope_type,
  scope_id uuid,
  institution_name text,
  is_valid boolean,
  invalid_reason text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    i.email::text,
    i.role,
    i.scope_type,
    i.scope_id,
    inst.name,
    (i.accepted_at is null and i.revoked_at is null and i.expires_at > now()) as is_valid,
    case
      when i.accepted_at is not null then 'accepted'
      when i.revoked_at is not null then 'revoked'
      when i.expires_at <= now() then 'expired'
      else null
    end as invalid_reason
  from public.invitations i
  join public.institutions inst on inst.id = i.institution_id
  where i.token_hash = p_token_hash;
$$;

revoke all on function public.get_invitation_by_token_hash(text) from public;
-- `anon` genuinely needs this one: the person opening an invitation has no
-- account yet, so they have no JWT. It is the single exception to 0014's "anon
-- gets nothing", and it is narrow — a function that returns one row for a
-- caller who already knows a 256-bit secret.
grant execute on function public.get_invitation_by_token_hash(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Accepting one
-- ─────────────────────────────────────────────────────────────────────────────

-- Called by the newly-signed-up user, so auth.uid() is them. Creates their
-- profile and role grants from the invitation, and marks it accepted.
--
-- ORDER MATTERS, and getting it wrong is a real bug this had:
--
-- The first version claimed the invitation first, on the reasoning that a
-- conditional UPDATE is a clean atomic gate. But invitations.accepted_by
-- references profiles(id), and the profile does not exist yet at that point —
-- so every acceptance died on a foreign key violation. Found by running the
-- flow, not by reading it.
--
-- So: lock the row, create the profile, then claim. `for update` does the same
-- serialisation job as the conditional update — a second caller blocks on the
-- lock, then re-reads and finds accepted_at set — and the whole function is one
-- transaction, so a loser's profile insert rolls back with their claim.
create or replace function public.accept_invitation(
  p_token_hash text,
  p_full_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_invitation public.invitations;
  v_email text;
begin
  if v_user_id is null then
    raise exception 'accept_invitation: no authenticated user'
      using errcode = 'insufficient_privilege';
  end if;

  if p_full_name is null or length(trim(p_full_name)) = 0 then
    raise exception 'accept_invitation: a name is required'
      using errcode = 'check_violation';
  end if;

  -- Lock it. A concurrent caller with the same link waits here, and finds it
  -- spent when it re-reads below.
  select * into v_invitation
  from public.invitations i
  where i.token_hash = p_token_hash
  for update;

  if not found
     or v_invitation.accepted_at is not null
     or v_invitation.revoked_at is not null
     or v_invitation.expires_at <= now()
  then
    raise exception 'accept_invitation: this invitation is not valid — it may have expired, been withdrawn, or already been used'
      using errcode = 'check_violation';
  end if;

  -- The invitation was sent to an address; the account must BE that address.
  -- Without this, anyone holding the link could attach the grant to an account
  -- of their choosing — an invitation is a role grant, and an admin invitation
  -- forwarded to the wrong person would otherwise be an admin account.
  select u.email into v_email from auth.users u where u.id = v_user_id;

  if lower(v_email) is distinct from lower(v_invitation.email::text) then
    raise exception 'accept_invitation: this invitation was sent to a different email address'
      using errcode = 'insufficient_privilege';
  end if;

  -- The profile FIRST: accepted_by references it.
  insert into public.profiles (id, institution_id, full_name, email, status)
  values (
    v_user_id,
    v_invitation.institution_id,
    trim(p_full_name),
    v_invitation.email,
    'active'
  )
  on conflict (id) do nothing;

  -- Now claim it. The row is already locked, so this cannot race.
  update public.invitations
  set accepted_at = now(),
      accepted_by = v_user_id
  where id = v_invitation.id;

  -- Everyone is a student of the institution. §4: roles are ADDITIVE — a course
  -- rep is a student who also holds a scoped grant, and this is where that
  -- becomes true rather than being asserted in a comment.
  insert into public.user_roles (user_id, role, scope_type, scope_id, granted_by)
  values (v_user_id, 'student', 'global', null, v_invitation.invited_by)
  on conflict do nothing;

  -- Then the invited role, if it is something more.
  if v_invitation.role <> 'student' then
    insert into public.user_roles (user_id, role, scope_type, scope_id, granted_by)
    values (
      v_user_id,
      v_invitation.role,
      v_invitation.scope_type,
      v_invitation.scope_id,
      v_invitation.invited_by
    )
    on conflict do nothing;
  end if;

  -- A course_rep grant in user_roles is a UI marker; the AUTHORITY lives in
  -- course_rep_assignments with its appointment period (§4), and RLS reads that
  -- one. Creating the appointment is the instructor's act, not a side effect of
  -- someone opening an email — so an invited rep can sign in and see rep
  -- surfaces, and can do nothing until they are actually appointed.
  --
  -- That asymmetry is deliberate and worth knowing when this looks like a bug.

  insert into public.audit_log (actor_id, action, entity_type, entity_id, after)
  values (
    v_user_id,
    'invitation.accepted',
    'invitation',
    v_invitation.id,
    jsonb_build_object(
      'role', v_invitation.role,
      'scope_type', v_invitation.scope_type,
      'scope_id', v_invitation.scope_id
    )
  );

  return v_user_id;
end;
$$;

revoke all on function public.accept_invitation(text, text) from public;
grant execute on function public.accept_invitation(text, text) to authenticated;
