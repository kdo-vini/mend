alter table public.workspace_members
  add column is_active boolean not null default false;

-- Keep the member list RPC contract stable while including availability.
drop function public.list_workspace_members_with_email(uuid);
drop function private.list_workspace_members_with_email(uuid);

create function private.list_workspace_members_with_email(p_workspace_id uuid)
returns table (
  id uuid,
  user_id uuid,
  workspace_id uuid,
  role text,
  display_name text,
  email text,
  created_at timestamptz,
  is_active boolean
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
  select wm.id, wm.user_id, wm.workspace_id, wm.role, wm.display_name,
    lower(u.email), wm.created_at, wm.is_active
  from public.workspace_members as wm
  join auth.users as u on u.id = wm.user_id
  where wm.workspace_id = p_workspace_id
  order by wm.created_at asc;
end;
$$;

create function public.list_workspace_members_with_email(p_workspace_id uuid)
returns table (
  id uuid,
  user_id uuid,
  workspace_id uuid,
  role text,
  display_name text,
  email text,
  created_at timestamptz,
  is_active boolean
)
language sql
stable
security invoker
set search_path = pg_catalog, public, private
as $$ select * from private.list_workspace_members_with_email($1); $$;

revoke all on function private.list_workspace_members_with_email(uuid) from public, anon;
grant execute on function private.list_workspace_members_with_email(uuid) to authenticated;
revoke all on function public.list_workspace_members_with_email(uuid) from public, anon;
grant execute on function public.list_workspace_members_with_email(uuid) to authenticated;

create function private.set_workspace_member_availability(
  p_workspace_id uuid,
  p_user_id uuid,
  p_is_active boolean
)
returns public.workspace_members
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  updated_member public.workspace_members;
begin
  update public.workspace_members
  set is_active = p_is_active
  where workspace_id = p_workspace_id and user_id = p_user_id
  returning * into updated_member;
  if updated_member.id is null then
    raise exception 'workspace_member_not_found' using errcode = '22023';
  end if;
  return updated_member;
end;
$$;

create function public.set_workspace_member_availability(
  p_workspace_id uuid,
  p_user_id uuid,
  p_is_active boolean
)
returns public.workspace_members
language sql
volatile
security invoker
set search_path = pg_catalog, public, private
as $$ select private.set_workspace_member_availability($1, $2, $3); $$;

revoke all on function private.set_workspace_member_availability(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function private.set_workspace_member_availability(uuid, uuid, boolean)
  to service_role;
revoke all on function public.set_workspace_member_availability(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_workspace_member_availability(uuid, uuid, boolean)
  to service_role;

create function private.assign_unassigned_conversation(
  p_workspace_id uuid,
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  target public.conversations;
  chosen_user_id uuid;
begin
  -- Serializes assignments across different conversations in one workspace so
  -- two simultaneous handoffs cannot both select the same least-loaded member.
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));

  select * into target
  from public.conversations
  where workspace_id = p_workspace_id and id = p_conversation_id
  for update;
  if target.id is null then
    return jsonb_build_object('status', 'conversation_not_found');
  end if;
  if target.assigned_user_id is not null then
    return jsonb_build_object(
      'status', 'already_assigned',
      'assignee_user_id', target.assigned_user_id
    );
  end if;

  select wm.user_id into chosen_user_id
  from public.workspace_members as wm
  where wm.workspace_id = p_workspace_id
    and wm.is_active
    and wm.role in ('owner', 'admin', 'agent')
  order by (
    select count(*)
    from public.conversations as c
    where c.workspace_id = p_workspace_id
      and c.assigned_user_id = wm.user_id
      and c.status = 'open'
  ) asc, wm.created_at asc, wm.user_id asc
  limit 1;

  if chosen_user_id is null then
    insert into public.notifications (
      workspace_id, user_id, kind, title, body, entity_type, entity_id,
      payload_json, dedupe_key
    ) values (
      p_workspace_id, null, 'ai.assignment_waiting', 'Conversation waiting for an assignee',
      'No active team member is available to take this conversation.',
      'conversation', p_conversation_id, '{}'::jsonb,
      'ai-assignment-waiting:' || p_conversation_id::text
    ) on conflict (
      workspace_id,
      coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
      dedupe_key
    ) do nothing;
    return jsonb_build_object('status', 'no_active_member');
  end if;

  update public.conversations
  set assigned_user_id = chosen_user_id, updated_at = now()
  where id = p_conversation_id and workspace_id = p_workspace_id
    and assigned_user_id is null;

  insert into public.notifications (
    workspace_id, user_id, kind, title, body, entity_type, entity_id,
    payload_json, dedupe_key
  ) values (
    p_workspace_id, chosen_user_id, 'ai.conversation_assigned', 'Conversation assigned to you',
    'A conversation needs your attention.', 'conversation', p_conversation_id,
    '{}'::jsonb, 'ai-conversation-assigned:' || p_conversation_id::text
  ) on conflict (
    workspace_id,
    coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    dedupe_key
  ) do nothing;

  return jsonb_build_object(
    'status', 'assigned',
    'assignee_user_id', chosen_user_id
  );
end;
$$;

create function public.assign_unassigned_conversation(
  p_workspace_id uuid,
  p_conversation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = pg_catalog, public, private
as $$ select private.assign_unassigned_conversation($1, $2); $$;

revoke all on function private.assign_unassigned_conversation(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.assign_unassigned_conversation(uuid, uuid)
  to service_role;
revoke all on function public.assign_unassigned_conversation(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.assign_unassigned_conversation(uuid, uuid)
  to service_role;

create function private.validate_conversation_assignee()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.assigned_user_id is not null and not exists (
    select 1 from public.workspace_members as wm
    where wm.workspace_id = new.workspace_id
      and wm.user_id = new.assigned_user_id
      and wm.role <> 'viewer'
  ) then
    raise exception 'conversation_assignee_must_be_workspace_member'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger conversations_validate_assignee
before insert or update of workspace_id, assigned_user_id
on public.conversations
for each row execute function private.validate_conversation_assignee();

create function private.clear_open_conversations_for_unavailable_assignee()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  update public.conversations
  set assigned_user_id = null, updated_at = now()
  where workspace_id = old.workspace_id
    and assigned_user_id = old.user_id
    and status = 'open';
  return old;
end;
$$;

create trigger workspace_members_clear_open_assignments_on_delete
after delete on public.workspace_members
for each row execute function private.clear_open_conversations_for_unavailable_assignee();

create trigger workspace_members_clear_open_assignments_on_viewer
after update of role on public.workspace_members
for each row
when (old.role is distinct from new.role and new.role = 'viewer')
execute function private.clear_open_conversations_for_unavailable_assignee();
