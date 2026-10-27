-- Role-aware policies for agent runs and media, audit log is write-protected
-- from browsers, the last-owner guard serializes concurrent demotions, and the
-- human-pause helper is no longer executable by PUBLIC.

-- Agent runs: every member can read; owner/admin/agent can queue runs,
-- only owner/admin can approve/update/delete. Viewers cannot write.
drop policy if exists "members can access agent runs" on public.agent_runs;
drop policy if exists "members can access agent events" on public.agent_run_events;
drop policy if exists "members can read agent runs" on public.agent_runs;
drop policy if exists "agents can write agent runs" on public.agent_runs;
drop policy if exists "agents can queue agent runs" on public.agent_runs;
drop policy if exists "admins can update agent runs" on public.agent_runs;
drop policy if exists "admins can delete agent runs" on public.agent_runs;
drop policy if exists "members can read agent events" on public.agent_run_events;
create policy "members can read agent runs" on public.agent_runs
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "agents can queue agent runs" on public.agent_runs
  for insert to authenticated
  with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));
-- Approving/rejecting a run is admin-only (matches the API route's role check).
create policy "admins can update agent runs" on public.agent_runs
  for update to authenticated
  using (public.workspace_can(workspace_id, array['owner', 'admin']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin']));
create policy "admins can delete agent runs" on public.agent_runs
  for delete to authenticated
  using (public.workspace_can(workspace_id, array['owner', 'admin']));
create policy "members can read agent events" on public.agent_run_events
  for select to authenticated using (public.is_workspace_member(workspace_id));

-- Media: members read; owner/admin/agent write (send requests become WhatsApp
-- sends, so viewers must never create them).
drop policy if exists "workspace members can access media batches" on public.media_batches;
drop policy if exists "workspace members can access media assets" on public.media_assets;
drop policy if exists "workspace members can access media variants" on public.media_variants;
drop policy if exists "workspace members can access media send requests" on public.media_send_requests;
drop policy if exists "workspace members can read media batches" on public.media_batches;
drop policy if exists "workspace agents can write media batches" on public.media_batches;
drop policy if exists "workspace members can read media assets" on public.media_assets;
drop policy if exists "workspace agents can write media assets" on public.media_assets;
drop policy if exists "workspace members can read media variants" on public.media_variants;
drop policy if exists "workspace agents can write media variants" on public.media_variants;
drop policy if exists "workspace members can read media send requests" on public.media_send_requests;
drop policy if exists "workspace agents can write media send requests" on public.media_send_requests;

create policy "workspace members can read media batches" on public.media_batches
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "workspace agents can write media batches" on public.media_batches
  for all to authenticated
  using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));
create policy "workspace members can read media assets" on public.media_assets
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "workspace agents can write media assets" on public.media_assets
  for all to authenticated
  using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));
create policy "workspace members can read media variants" on public.media_variants
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "workspace agents can write media variants" on public.media_variants
  for all to authenticated
  using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));
create policy "workspace members can read media send requests" on public.media_send_requests
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "workspace agents can write media send requests" on public.media_send_requests
  for all to authenticated
  using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));

-- Audit rows are written by security definer functions and triggers only.
drop policy if exists "workspace members can append audit" on public.audit_log;
revoke insert, update, delete on public.audit_log from public, anon, authenticated;

-- Last-owner guard: lock the owner rows before counting so two concurrent
-- demotions/removals cannot both succeed and leave the workspace ownerless.
create or replace function private.update_workspace_member_role(
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
  perform 1 from public.workspace_members
  where workspace_id = p_workspace_id and role = 'owner'
  order by id
  for update;
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

create or replace function private.remove_workspace_member(
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
  perform 1 from public.workspace_members
  where workspace_id = p_workspace_id and role = 'owner'
  order by id
  for update;
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

revoke all on function private.update_workspace_member_role(uuid, uuid, text) from public, anon;
revoke all on function private.remove_workspace_member(uuid, uuid) from public, anon;
grant execute on function private.update_workspace_member_role(uuid, uuid, text) to authenticated, service_role;
grant execute on function private.remove_workspace_member(uuid, uuid) to authenticated, service_role;

-- Internal helper: only security definer wrappers/triggers (owner) call it.
revoke all on function private.pause_conversation_for_human(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function private.pause_conversation_for_human(uuid, uuid, uuid, uuid, text) to service_role;
