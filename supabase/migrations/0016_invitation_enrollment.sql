-- 0016_invitation_enrollment
--
-- An invitation can carry the section it should enrol you into.
--
-- ── why ──────────────────────────────────────────────────────────────────────
--
-- A registrar imports 300 students from a spreadsheet. This product is
-- invite-only (§2 Q4), and enrollments.student_id references profiles.id —
-- which references auth.users. So a student who has never signed in cannot be
-- enrolled, because they do not exist.
--
-- Without this column the import has two bad options: refuse every unknown
-- student and tell a registrar to invite 300 people one at a time, or import
-- nothing until everyone has already accepted — which they cannot do, because
-- nobody has invited them. The chicken has no egg.
--
-- So the intent is stored ON the invitation and settled when it is accepted.
-- The import can then say something honest and useful in its preview:
--
--   "142 students will be enrolled now.
--    158 have no account — they will be invited, and enrolled when they accept."
--
-- ── why not just create the profiles ─────────────────────────────────────────
--
-- Because a profile with no auth.users row is impossible (the FK), and creating
-- auth users in bulk means the service-role client — which is ESLint-fenced to
-- jobs and cron for good reasons, and an admin import is neither. Inventing
-- accounts for people who have not set a password also means inventing a
-- password, or an account that cannot be used, or a shadow "pending student"
-- state that every query then has to know about.
--
-- One nullable column, settled on acceptance, needs none of that.

alter table public.invitations
  add column enroll_in_section_id uuid references public.class_sections (id) on delete set null,
  -- The registrar's spreadsheet knows the matric number; the student should not
  -- have to type it, and should not be able to choose it. It is an
  -- institutional fact (profiles_protect_institutional_fields in 0010 stops
  -- them editing it later), so it travels on the invitation rather than being
  -- asked for on the signup form.
  add column matric_number extensions.citext;

comment on column public.invitations.enroll_in_section_id is
  'Set by the CSV importer. When this invitation is accepted, the new student is enrolled in this section. Null for invitations that carry no enrolment intent (staff, or a student invited by hand).';

comment on column public.invitations.matric_number is
  'Carried from the roster import so the student does not type their own matric number — it is an institutional fact, not a preference.';

-- The FK is `on delete set null`, not cascade: if the section is deleted the
-- invitation is still a valid invitation to join the institution. Losing the
-- enrolment intent is correct; losing the invitation is not.

create index invitations_enroll_in_section_id_idx
  on public.invitations (enroll_in_section_id)
  where enroll_in_section_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- accept_invitation, now settling the enrolment
-- ─────────────────────────────────────────────────────────────────────────────

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
  insert into public.profiles (id, institution_id, full_name, email, matric_number, status)
  values (
    v_user_id,
    v_invitation.institution_id,
    trim(p_full_name),
    v_invitation.email,
    v_invitation.matric_number,
    'active'
  )
  on conflict (id) do nothing;

  -- Now claim it. The row is already locked, so this cannot race.
  update public.invitations
  set accepted_at = now(),
      accepted_by = v_user_id
  where id = v_invitation.id;

  -- Everyone is a student of the institution. §4: roles are ADDITIVE — a course
  -- rep is a student who also holds a scoped grant.
  insert into public.user_roles (user_id, role, scope_type, scope_id, granted_by)
  values (v_user_id, 'student', 'global', null, v_invitation.invited_by)
  on conflict do nothing;

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

  -- Settle the enrolment the importer recorded (0016).
  --
  -- enrolled_at is now(), NOT the date of the import. That is deliberate and it
  -- matters: close_session() asks "was this student enrolled ON THE DAY", so a
  -- backdated enrolment would make them retroactively absent for every session
  -- since the import — punishing them for taking a week to open their email.
  -- They join the register when they join, and Phase 4's roster screen lets an
  -- admin backdate deliberately if a registrar says so.
  if v_invitation.enroll_in_section_id is not null then
    insert into public.enrollments (student_id, class_section_id, status, enrolled_at)
    values (v_user_id, v_invitation.enroll_in_section_id, 'enrolled', now())
    on conflict (student_id, class_section_id) do nothing;
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, after)
  values (
    v_user_id,
    'invitation.accepted',
    'invitation',
    v_invitation.id,
    jsonb_build_object(
      'role', v_invitation.role,
      'scope_type', v_invitation.scope_type,
      'scope_id', v_invitation.scope_id,
      'enrolled_in_section', v_invitation.enroll_in_section_id
    )
  );

  return v_user_id;
end;
$$;

revoke all on function public.accept_invitation(text, text) from public;
grant execute on function public.accept_invitation(text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- import_roster() — the atomic half of the CSV importer
-- ─────────────────────────────────────────────────────────────────────────────

-- §14: "CSV import (with dry-run preview + per-row error report)".
--
-- ALL OR NOTHING, and that is the entire reason this is a database function
-- rather than a loop in TypeScript. A plpgsql function is one transaction: if
-- row 147 fails, rows 1-146 roll back with it. An import that dies halfway and
-- leaves 146 students half-created is how a pilot ends — the registrar cannot
-- tell what happened, cannot safely retry, and does not trust the tool again.
--
-- The client does the parsing, the validation and the preview (parse.ts, pure
-- and unit-tested; queries.ts for the lookups). By the time anything reaches
-- here it has already been shown to a human who pressed a button. This function
-- writes, and it writes everything or nothing.
--
-- Payload shape — an array of:
--   { email, full_name, matric_number, section_id, token_hash }
--
-- token_hash is present for students with no account and null for those who
-- have one. Tokens are generated in TypeScript (features/invitations/tokens.ts,
-- 256 bits of crypto.randomBytes) and only their hashes cross to the database —
-- §8: hashed at rest. The plaintext never appears in a query, so it cannot land
-- in pg_stat_statements or a slow-query log.
--
-- SECURITY DEFINER, so the authorisation check is explicit rather than
-- delegated to policies this deliberately runs outside of. It is narrow: one
-- caller, one payload shape, two tables.
create or replace function public.import_roster(p_rows jsonb)
returns table (
  enrolled integer,
  invited integer,
  already_enrolled integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_institution uuid;
  v_row jsonb;
  v_student uuid;
  v_enrolled integer := 0;
  v_invited integer := 0;
  v_existing integer := 0;
begin
  if v_actor is null then
    raise exception 'import_roster: no authenticated user'
      using errcode = 'insufficient_privilege';
  end if;

  -- Admin or instructor. Reps do not import rosters: §4 gives them sessions and
  -- verification, not the register.
  if not (public.auth_is_admin() or public.auth_has_role('instructor')) then
    raise exception 'import_roster: only an admin or instructor can import a roster'
      using errcode = 'insufficient_privilege';
  end if;

  select institution_id into v_institution from public.profiles where id = v_actor;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    -- Match by matric number within the institution. Matric, not email: a
    -- student's address changes and their matric does not, and the registrar's
    -- spreadsheet is authoritative about matric numbers in a way it is not
    -- about anything else.
    select p.id into v_student
    from public.profiles p
    where p.institution_id = v_institution
      and p.matric_number = (v_row->>'matric_number')::extensions.citext;

    if v_student is not null then
      insert into public.enrollments (student_id, class_section_id, status, enrolled_at)
      values (v_student, (v_row->>'section_id')::uuid, 'enrolled', now())
      on conflict (student_id, class_section_id) do nothing;

      if found then
        v_enrolled := v_enrolled + 1;
      else
        -- Already on the register. Not an error — re-importing last week's
        -- file with ten new names appended is a normal thing to do, and it must
        -- be safe.
        v_existing := v_existing + 1;
      end if;
    else
      -- No account. Invite them, and record the enrolment to settle when they
      -- accept.
      insert into public.invitations (
        institution_id, email, role, scope_type, scope_id,
        token_hash, expires_at, invited_by,
        enroll_in_section_id, matric_number
      ) values (
        v_institution,
        (v_row->>'email')::extensions.citext,
        'student', 'global', null,
        v_row->>'token_hash',
        now() + interval '7 days',
        v_actor,
        (v_row->>'section_id')::uuid,
        (v_row->>'matric_number')::extensions.citext
      )
      on conflict (token_hash) do nothing;

      v_invited := v_invited + 1;
    end if;
  end loop;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, after)
  values (
    v_actor, 'roster.imported', 'class_section', null,
    jsonb_build_object(
      'enrolled', v_enrolled,
      'invited', v_invited,
      'already_enrolled', v_existing,
      'rows', jsonb_array_length(p_rows)
    )
  );

  return query select v_enrolled, v_invited, v_existing;
end;
$$;

revoke all on function public.import_roster(jsonb) from public;
grant execute on function public.import_roster(jsonb) to authenticated;
