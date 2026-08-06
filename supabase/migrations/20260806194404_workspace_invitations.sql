-- Workspace invitations stay pending until the invited identity explicitly
-- accepts the link. Membership is created by the acceptance function, never
-- by the browser or by an untrusted e-mail address.
create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null check (length(email) between 3 and 320),
  role text not null default 'agent' check (role in ('admin', 'agent', 'viewer')),
  invited_by uuid not null references auth.users(id) on delete restrict,
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'sent', 'failed')),
  delivery_kind text check (delivery_kind in ('invite', 'recovery')),
  last_error_code text,
  sent_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index workspace_invitations_open_email_idx
  on public.workspace_invitations (workspace_id, lower(email))
  where accepted_at is null and revoked_at is null;

create index workspace_invitations_workspace_created_idx
  on public.workspace_invitations (workspace_id, created_at desc);

alter table public.workspace_invitations enable row level security;
revoke all on table public.workspace_invitations from public, anon, authenticated;

create or replace function public.list_workspace_members_with_email(
  p_workspace_id uuid
)
returns table (
  id uuid,
  user_id uuid,
  workspace_id uuid,
  role text,
  display_name text,
  email text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  if (select private.workspace_member_role(p_workspace_id)) is null then
    return;
  end if;

  return query
  select wm.id,
    wm.user_id,
    wm.workspace_id,
    wm.role,
    wm.display_name,
    lower(u.email),
    wm.created_at
  from public.workspace_members as wm
  join auth.users as u on u.id = wm.user_id
  where wm.workspace_id = p_workspace_id
  order by wm.created_at asc;
end;
$$;

revoke all on function public.list_workspace_members_with_email(uuid)
  from public, anon;
grant execute on function public.list_workspace_members_with_email(uuid)
  to authenticated;

create or replace function public.create_workspace_invitation(
  p_workspace_id uuid,
  p_email text,
  p_role text default 'agent'
)
returns public.workspace_invitations
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  caller_role text := (select private.workspace_member_role(p_workspace_id));
  normalized_email text := lower(btrim(p_email));
  existing_user_id uuid;
  invitation public.workspace_invitations;
begin
  if caller_role is null or caller_role not in ('owner', 'admin') then
    raise exception 'workspace_role_denied' using errcode = '42501';
  end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or length(normalized_email) > 320 then
    raise exception 'invalid_invitation_email';
  end if;
  if p_role not in ('admin', 'agent', 'viewer') then
    raise exception 'invalid_workspace_role';
  end if;

  select u.id into existing_user_id
  from auth.users as u
  where lower(u.email) = normalized_email
  limit 1;

  if existing_user_id is not null and exists (
    select 1
    from public.workspace_members as wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = existing_user_id
  ) then
    raise exception 'workspace_member_exists' using errcode = '23505';
  end if;

  insert into public.workspace_invitations (workspace_id, email, role, invited_by)
  values (p_workspace_id, normalized_email, p_role, (select auth.uid()))
  returning * into invitation;

  insert into public.audit_log (
    workspace_id, actor_user_id, action, entity_type, entity_id, metadata_json
  ) values (
    p_workspace_id, (select auth.uid()), 'workspace.invitation_created',
    'workspace_invitation', invitation.id,
    jsonb_build_object('email', normalized_email, 'role', p_role)
  );

  return invitation;
exception
  when unique_violation then
    raise exception 'workspace_invitation_exists' using errcode = '23505';
end;
$$;

create or replace function public.update_workspace_invitation(
  p_workspace_id uuid,
  p_invitation_id uuid,
  p_role text
)
returns public.workspace_invitations
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  caller_role text := (select private.workspace_member_role(p_workspace_id));
  invitation public.workspace_invitations;
begin
  if caller_role is null or caller_role not in ('owner', 'admin') then
    raise exception 'workspace_role_denied' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'agent', 'viewer') then
    raise exception 'invalid_workspace_role';
  end if;

  select * into invitation
  from public.workspace_invitations
  where id = p_invitation_id and workspace_id = p_workspace_id
  for update;
  if invitation.id is null then
    raise exception 'workspace_invitation_not_found' using errcode = '22023';
  end if;
  if invitation.accepted_at is not null or invitation.revoked_at is not null then
    raise exception 'workspace_invitation_closed' using errcode = '22023';
  end if;

  update public.workspace_invitations
  set role = p_role, updated_at = timezone('utc', now())
  where id = invitation.id
  returning * into invitation;

  insert into public.audit_log (
    workspace_id, actor_user_id, action, entity_type, entity_id, metadata_json
  ) values (
    p_workspace_id, (select auth.uid()), 'workspace.invitation_role_updated',
    'workspace_invitation', invitation.id,
    jsonb_build_object('email', invitation.email, 'role', p_role)
  );

  return invitation;
end;
$$;

create or replace function public.revoke_workspace_invitation(
  p_workspace_id uuid,
  p_invitation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  caller_role text := (select private.workspace_member_role(p_workspace_id));
  invitation public.workspace_invitations;
begin
  if caller_role is null or caller_role not in ('owner', 'admin') then
    raise exception 'workspace_role_denied' using errcode = '42501';
  end if;

  update public.workspace_invitations
  set revoked_at = timezone('utc', now()), updated_at = timezone('utc', now())
  where id = p_invitation_id
    and workspace_id = p_workspace_id
    and accepted_at is null
    and revoked_at is null
  returning * into invitation;
  if invitation.id is null then
    raise exception 'workspace_invitation_not_found' using errcode = '22023';
  end if;

  insert into public.audit_log (
    workspace_id, actor_user_id, action, entity_type, entity_id, metadata_json
  ) values (
    p_workspace_id, (select auth.uid()), 'workspace.invitation_revoked',
    'workspace_invitation', invitation.id,
    jsonb_build_object('email', invitation.email)
  );

  return true;
end;
$$;

-- Delivery is recorded only by the trusted API after Auth accepts the send.
create or replace function public.record_workspace_invitation_delivery(
  p_invitation_id uuid,
  p_status text,
  p_kind text default null,
  p_error_code text default null
)
returns public.workspace_invitations
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  invitation public.workspace_invitations;
begin
  if p_status not in ('sent', 'failed') then
    raise exception 'invalid_invitation_delivery_status';
  end if;
  if p_kind is not null and p_kind not in ('invite', 'recovery') then
    raise exception 'invalid_invitation_delivery_kind';
  end if;

  update public.workspace_invitations
  set delivery_status = p_status,
    delivery_kind = coalesce(p_kind, delivery_kind),
    last_error_code = p_error_code,
    sent_at = case when p_status = 'sent' then timezone('utc', now()) else sent_at end,
    expires_at = case when p_status = 'sent' then timezone('utc', now()) + interval '1 hour' else expires_at end,
    updated_at = timezone('utc', now())
  where id = p_invitation_id
    and accepted_at is null
    and revoked_at is null
  returning * into invitation;
  if invitation.id is null then
    raise exception 'workspace_invitation_not_found' using errcode = '22023';
  end if;
  return invitation;
end;
$$;

create or replace function public.accept_workspace_invitation(
  p_invitation_id uuid
)
returns public.workspace_members
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_email text;
  actor_metadata jsonb;
  invitation public.workspace_invitations;
  member public.workspace_members;
begin
  if actor_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select lower(u.email), u.raw_user_meta_data
    into actor_email, actor_metadata
  from auth.users as u
  where u.id = actor_id;
  if actor_email is null then
    raise exception 'invited_email_missing';
  end if;

  select * into invitation
  from public.workspace_invitations
  where id = p_invitation_id
  for update;
  if invitation.id is null then
    raise exception 'workspace_invitation_not_found' using errcode = '22023';
  end if;
  if invitation.revoked_at is not null then
    raise exception 'workspace_invitation_revoked' using errcode = '22023';
  end if;
  if invitation.accepted_at is not null then
    raise exception 'workspace_invitation_already_accepted' using errcode = '22023';
  end if;
  if invitation.expires_at is null or invitation.expires_at <= timezone('utc', now()) then
    raise exception 'workspace_invitation_expired' using errcode = '22023';
  end if;
  if invitation.delivery_status <> 'sent' or invitation.email <> actor_email then
    raise exception 'workspace_invitation_email_mismatch' using errcode = '42501';
  end if;

  select * into member
  from public.workspace_members
  where workspace_id = invitation.workspace_id and user_id = actor_id
  for update;
  if member.id is null then
    insert into public.workspace_members (workspace_id, user_id, role, display_name)
    values (
      invitation.workspace_id,
      actor_id,
      invitation.role,
      coalesce(
        nullif(btrim(actor_metadata ->> 'full_name'), ''),
        nullif(split_part(actor_email, '@', 1), '')
      )
    )
    returning * into member;
  end if;

  update public.workspace_invitations
  set accepted_at = timezone('utc', now()), updated_at = timezone('utc', now())
  where id = invitation.id;

  insert into public.audit_log (
    workspace_id, actor_user_id, action, entity_type, entity_id, metadata_json
  ) values (
    invitation.workspace_id, actor_id, 'workspace.invitation_accepted',
    'workspace_invitation', invitation.id,
    jsonb_build_object('email', invitation.email, 'role', invitation.role)
  );

  return member;
end;
$$;

revoke all on function public.create_workspace_invitation(uuid, text, text)
  from public, anon;
grant execute on function public.create_workspace_invitation(uuid, text, text)
  to authenticated;
revoke all on function public.update_workspace_invitation(uuid, uuid, text)
  from public, anon;
grant execute on function public.update_workspace_invitation(uuid, uuid, text)
  to authenticated;
revoke all on function public.revoke_workspace_invitation(uuid, uuid)
  from public, anon;
grant execute on function public.revoke_workspace_invitation(uuid, uuid)
  to authenticated;
revoke all on function public.record_workspace_invitation_delivery(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_workspace_invitation_delivery(uuid, text, text, text)
  to service_role;
revoke all on function public.accept_workspace_invitation(uuid)
  from public, anon;
grant execute on function public.accept_workspace_invitation(uuid)
  to authenticated;
