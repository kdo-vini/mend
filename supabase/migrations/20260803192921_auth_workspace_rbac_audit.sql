-- Mend workspace authentication and RBAC.
--
-- Workspace membership remains the source of truth. No client supplied
-- workspace id is trusted by these helpers: every access check resolves the
-- current auth.uid() to a membership row inside the database.

create or replace function public.workspace_member_role(target_workspace_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select wm.role
  from public.workspace_members as wm
  where wm.workspace_id = target_workspace_id
    and wm.user_id = (select auth.uid())
  limit 1;
$$;

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select public.workspace_member_role(target_workspace_id) is not null;
$$;

create or replace function public.workspace_can(target_workspace_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select coalesce(public.workspace_member_role(target_workspace_id) = any(allowed_roles), false);
$$;

revoke all on function public.workspace_member_role(uuid) from public, anon;
grant execute on function public.workspace_member_role(uuid) to authenticated;
revoke all on function public.workspace_can(uuid, text[]) from public, anon;
grant execute on function public.workspace_can(uuid, text[]) to authenticated;

create or replace function public.create_workspace(
  p_name text,
  p_slug text,
  p_issue_prefix text default 'MEND',
  p_timezone text default 'America/Sao_Paulo',
  p_default_language text default 'en'
)
returns public.workspaces
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor uuid := (select auth.uid());
  workspace public.workspaces;
  normalized_name text := btrim(p_name);
  normalized_slug text := lower(btrim(p_slug));
  normalized_prefix text := upper(btrim(coalesce(nullif(p_issue_prefix, ''), 'MEND')));
begin
  if actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if normalized_name is null or length(normalized_name) not between 1 and 120 then
    raise exception 'invalid_workspace_name';
  end if;
  if normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(normalized_slug) > 64 then
    raise exception 'invalid_workspace_slug';
  end if;
  if normalized_prefix !~ '^[A-Z][A-Z0-9]{1,7}$' then
    raise exception 'invalid_issue_prefix';
  end if;

  insert into public.workspaces (name, slug, issue_prefix, timezone, default_language)
  values (normalized_name, normalized_slug, normalized_prefix, coalesce(nullif(btrim(p_timezone), ''), 'America/Sao_Paulo'), coalesce(nullif(btrim(p_default_language), ''), 'en'))
  returning * into workspace;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (workspace.id, actor, 'owner');

  return workspace;
exception
  when unique_violation then
    raise exception 'workspace_slug_taken' using errcode = '23505';
end;
$$;

create or replace function public.add_workspace_member(
  p_workspace_id uuid,
  p_user_id uuid,
  p_role text default 'agent'
)
returns public.workspace_members
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_role text := public.workspace_member_role(p_workspace_id);
  member public.workspace_members;
begin
  if caller_role is null or caller_role not in ('owner', 'admin') then
    raise exception 'workspace_role_denied' using errcode = '42501';
  end if;
  if p_role not in ('owner', 'admin', 'agent', 'viewer') then
    raise exception 'invalid_workspace_role';
  end if;
  if caller_role = 'admin' and p_role = 'owner' then
    raise exception 'workspace_role_denied' using errcode = '42501';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (p_workspace_id, p_user_id, p_role)
  returning * into member;

  insert into public.audit_log (workspace_id, actor_user_id, action, entity_type, entity_id, metadata_json)
  values (p_workspace_id, (select auth.uid()), 'workspace.member_added', 'workspace_member', member.id,
    jsonb_build_object('user_id', p_user_id, 'role', p_role));

  return member;
exception
  when unique_violation then
    raise exception 'workspace_member_exists' using errcode = '23505';
end;
$$;

create or replace function public.update_workspace_member_role(
  p_workspace_id uuid,
  p_user_id uuid,
  p_role text
)
returns public.workspace_members
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_role text := public.workspace_member_role(p_workspace_id);
  current_member public.workspace_members;
  updated_member public.workspace_members;
  owner_count integer;
begin
  if caller_role is null or caller_role not in ('owner', 'admin') then
    raise exception 'workspace_role_denied' using errcode = '42501';
  end if;
  if p_role not in ('owner', 'admin', 'agent', 'viewer') then
    raise exception 'invalid_workspace_role';
  end if;
  select * into current_member
  from public.workspace_members
  where workspace_id = p_workspace_id and user_id = p_user_id;
  if current_member.id is null then
    raise exception 'workspace_member_not_found' using errcode = '22023';
  end if;
  if caller_role = 'admin' and (current_member.role = 'owner' or p_role = 'owner') then
    raise exception 'workspace_role_denied' using errcode = '42501';
  end if;
  if current_member.role = 'owner' and p_role <> 'owner' then
    select count(*) into owner_count from public.workspace_members where workspace_id = p_workspace_id and role = 'owner';
    if owner_count <= 1 then
      raise exception 'workspace_requires_owner';
    end if;
  end if;

  update public.workspace_members
  set role = p_role
  where id = current_member.id
  returning * into updated_member;

  insert into public.audit_log (workspace_id, actor_user_id, action, entity_type, entity_id, metadata_json)
  values (p_workspace_id, (select auth.uid()), 'workspace.member_role_updated', 'workspace_member', updated_member.id,
    jsonb_build_object('user_id', p_user_id, 'from_role', current_member.role, 'to_role', p_role));

  return updated_member;
end;
$$;

create or replace function public.remove_workspace_member(
  p_workspace_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_role text := public.workspace_member_role(p_workspace_id);
  current_member public.workspace_members;
  owner_count integer;
begin
  if caller_role is null or caller_role not in ('owner', 'admin') then
    raise exception 'workspace_role_denied' using errcode = '42501';
  end if;
  select * into current_member
  from public.workspace_members
  where workspace_id = p_workspace_id and user_id = p_user_id;
  if current_member.id is null then
    raise exception 'workspace_member_not_found' using errcode = '22023';
  end if;
  if caller_role = 'admin' and current_member.role = 'owner' then
    raise exception 'workspace_role_denied' using errcode = '42501';
  end if;
  if current_member.role = 'owner' then
    select count(*) into owner_count from public.workspace_members where workspace_id = p_workspace_id and role = 'owner';
    if owner_count <= 1 then
      raise exception 'workspace_requires_owner';
    end if;
  end if;

  delete from public.workspace_members where id = current_member.id;
  insert into public.audit_log (workspace_id, actor_user_id, action, entity_type, entity_id, metadata_json)
  values (p_workspace_id, (select auth.uid()), 'workspace.member_removed', 'workspace_member', current_member.id,
    jsonb_build_object('user_id', p_user_id, 'role', current_member.role));
  return true;
end;
$$;

revoke all on function public.create_workspace(text, text, text, text, text) from public, anon;
grant execute on function public.create_workspace(text, text, text, text, text) to authenticated;
revoke all on function public.add_workspace_member(uuid, uuid, text) from public, anon;
grant execute on function public.add_workspace_member(uuid, uuid, text) to authenticated;
revoke all on function public.update_workspace_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.update_workspace_member_role(uuid, uuid, text) to authenticated;
revoke all on function public.remove_workspace_member(uuid, uuid) from public, anon;
grant execute on function public.remove_workspace_member(uuid, uuid) to authenticated;

-- Workspace changes are auditable even when they are made through a direct
-- authenticated update. Membership mutations are intentionally RPC-only and
-- write their own audit rows above.
create or replace function public.audit_workspace_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.audit_log (workspace_id, actor_user_id, action, entity_type, entity_id, metadata_json)
  values (
    coalesce(new.id, old.id),
    (select auth.uid()),
    case tg_op when 'INSERT' then 'workspace.created' when 'UPDATE' then 'workspace.updated' else 'workspace.deleted' end,
    'workspace',
    coalesce(new.id, old.id),
    jsonb_build_object('name', coalesce(new.name, old.name), 'slug', coalesce(new.slug, old.slug))
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists workspaces_audit_trigger on public.workspaces;
create trigger workspaces_audit_trigger
after insert or update or delete on public.workspaces
for each row execute function public.audit_workspace_change();

-- Replace the original member-only policies with explicit role-aware policies.
drop policy if exists "members can see workspaces" on public.workspaces;
drop policy if exists "members can see own membership" on public.workspace_members;
drop policy if exists "members can access channels" on public.channel_connections;
drop policy if exists "members can access contacts" on public.contacts;
drop policy if exists "members can access conversations" on public.conversations;
drop policy if exists "members can access messages" on public.messages;
drop policy if exists "members can access ai state" on public.conversation_ai_state;
drop policy if exists "members can access issues" on public.issues;
drop policy if exists "members can access labels" on public.labels;
drop policy if exists "members can access issue labels" on public.issue_labels;
drop policy if exists "members can access issue comments" on public.issue_comments;
drop policy if exists "members can access repositories" on public.repositories;
drop policy if exists "members can access coding runs" on public.coding_runs;
drop policy if exists "members can access coding events" on public.coding_run_events;
drop policy if exists "members can access knowledge" on public.knowledge_articles;
drop policy if exists "members can access jobs" on public.jobs;
drop policy if exists "members can access audit" on public.audit_log;

create policy "workspace members can read workspaces" on public.workspaces
  for select to authenticated using (public.is_workspace_member(id));
create policy "workspace managers can update workspaces" on public.workspaces
  for update to authenticated
  using (public.workspace_can(id, array['owner', 'admin']))
  with check (public.workspace_can(id, array['owner', 'admin']));

create policy "workspace members can read memberships" on public.workspace_members
  for select to authenticated using (public.is_workspace_member(workspace_id));

create policy "workspace members can read channels" on public.channel_connections
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "workspace managers can write channels" on public.channel_connections
  for all to authenticated
  using (public.workspace_can(workspace_id, array['owner', 'admin']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin']));

create policy "workspace members can read contacts" on public.contacts
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "workspace agents can write contacts" on public.contacts
  for all to authenticated
  using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));

create policy "workspace members can read conversations" on public.conversations
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "workspace agents can write conversations" on public.conversations
  for all to authenticated
  using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));

create policy "workspace members can read messages" on public.messages
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "workspace agents can write messages" on public.messages
  for all to authenticated
  using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));

create policy "workspace members can read ai state" on public.conversation_ai_state
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "workspace agents can write ai state" on public.conversation_ai_state
  for all to authenticated
  using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));

create policy "workspace members can read issues" on public.issues
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "workspace agents can write issues" on public.issues
  for all to authenticated
  using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));

create policy "workspace members can read labels" on public.labels
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "workspace agents can write labels" on public.labels
  for all to authenticated
  using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));

create policy "workspace members can read issue labels" on public.issue_labels
  for select to authenticated
  using (exists (select 1 from public.issues where id = issue_id and public.is_workspace_member(workspace_id)));
create policy "workspace agents can write issue labels" on public.issue_labels
  for all to authenticated
  using (exists (select 1 from public.issues where id = issue_id and public.workspace_can(workspace_id, array['owner', 'admin', 'agent'])))
  with check (exists (select 1 from public.issues where id = issue_id and public.workspace_can(workspace_id, array['owner', 'admin', 'agent'])));

create policy "workspace members can read issue comments" on public.issue_comments
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "workspace agents can write issue comments" on public.issue_comments
  for all to authenticated
  using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));

create policy "workspace members can read repositories" on public.repositories
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "workspace managers can write repositories" on public.repositories
  for all to authenticated
  using (public.workspace_can(workspace_id, array['owner', 'admin']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin']));

create policy "workspace members can read coding runs" on public.coding_runs
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "workspace agents can write coding runs" on public.coding_runs
  for all to authenticated
  using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));

create policy "workspace members can read coding events" on public.coding_run_events
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "workspace agents can write coding events" on public.coding_run_events
  for all to authenticated
  using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));

create policy "workspace members can read knowledge" on public.knowledge_articles
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "workspace agents can write knowledge" on public.knowledge_articles
  for all to authenticated
  using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));

-- Jobs are backend-only. service_role bypasses RLS and claims/updates jobs.
create policy "workspace managers can read audit" on public.audit_log
  for select to authenticated
  using (public.workspace_can(workspace_id, array['owner', 'admin']));
create policy "workspace members can append audit" on public.audit_log
  for insert to authenticated
  with check (
    actor_user_id = (select auth.uid())
    and (workspace_id is null or public.is_workspace_member(workspace_id))
  );

-- Storage follows the same read/write split as application data.
drop policy if exists "workspace members can access private media" on storage.objects;
create policy "workspace members can read private media" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'private-media'
    and name ~ '^[0-9a-fA-F-]{36}/'
    and public.is_workspace_member((split_part(name, '/', 1))::uuid)
  );
create policy "workspace agents can write private media" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'private-media'
    and name ~ '^[0-9a-fA-F-]{36}/'
    and public.workspace_can((split_part(name, '/', 1))::uuid, array['owner', 'admin', 'agent'])
  )
  with check (
    bucket_id = 'private-media'
    and name ~ '^[0-9a-fA-F-]{36}/'
    and public.workspace_can((split_part(name, '/', 1))::uuid, array['owner', 'admin', 'agent'])
  );
