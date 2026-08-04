-- Human takeover, message provenance and the guarded AI send ledger.
-- This migration keeps the existing ai_mode values for compatibility.

alter table public.conversation_ai_state
  add column if not exists automation_state text not null default 'ai_active'
    check (automation_state in ('ai_active', 'human_paused')),
  add column if not exists human_takeover_at timestamptz,
  add column if not exists human_takeover_by uuid references auth.users(id) on delete set null,
  add column if not exists human_takeover_reason text
    check (human_takeover_reason is null or human_takeover_reason in ('human_message', 'customer_requested_human', 'unsafe_intent', 'low_confidence', 'manual_pause')),
  add column if not exists last_human_message_id uuid references public.messages(id) on delete set null,
  add column if not exists paused_until timestamptz;

alter table public.messages
  add column if not exists origin text not null default 'whatsapp';

update public.messages
set origin = case
  when ai_generated then 'ai'
  when sender_type = 'user' then 'app'
  when sender_type = 'system' and direction = 'outbound' then 'whatsapp'
  when sender_type = 'system' then 'system'
  else 'whatsapp'
end
where origin = 'whatsapp';

alter table public.messages drop constraint if exists messages_origin_check;
alter table public.messages add constraint messages_origin_check
  check (origin in ('app', 'whatsapp', 'ai', 'system'));

create or replace function private.set_message_origin()
returns trigger
language plpgsql
as $$
begin
  new.origin := case
    when new.ai_generated then 'ai'
    when new.sender_type = 'user' then 'app'
    when new.sender_type = 'system' and new.direction = 'outbound' then 'whatsapp'
    when new.sender_type = 'system' then 'system'
    else 'whatsapp'
  end;
  return new;
end;
$$;

drop trigger if exists set_message_origin on public.messages;
create trigger set_message_origin
  before insert or update of ai_generated, sender_type on public.messages
  for each row execute function private.set_message_origin();

create index if not exists conversation_ai_state_automation_idx
  on public.conversation_ai_state (workspace_id, automation_state);

create table if not exists public.ai_outbound_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  source_message_id uuid not null references public.messages(id) on delete cascade,
  idempotency_key text not null,
  provider_message_id text,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  error_code text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key),
  unique (workspace_id, provider_message_id)
);

alter table public.ai_outbound_messages enable row level security;
revoke all on table public.ai_outbound_messages from public, anon;
grant select on table public.ai_outbound_messages to authenticated;
grant select, insert, update on table public.ai_outbound_messages to service_role;

drop policy if exists "workspace members can read ai outbound messages" on public.ai_outbound_messages;
create policy "workspace members can read ai outbound messages"
  on public.ai_outbound_messages for select to authenticated
  using (public.is_workspace_member(workspace_id));

create or replace function private.pause_conversation_for_human(
  p_workspace_id uuid,
  p_conversation_id uuid,
  p_message_id uuid default null,
  p_actor_user_id uuid default null,
  p_reason text default 'human_message'
)
returns public.conversation_ai_state
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  state_row public.conversation_ai_state;
  reason text := case when p_reason in ('human_message', 'customer_requested_human', 'unsafe_intent', 'low_confidence', 'manual_pause') then p_reason else 'human_message' end;
begin
  insert into public.conversation_ai_state (
    workspace_id, conversation_id, automation_state, human_takeover_at,
    human_takeover_by, human_takeover_reason, last_human_message_id,
    needs_human, needs_human_reason, updated_at
  ) values (
    p_workspace_id, p_conversation_id, 'human_paused', now(), p_actor_user_id,
    reason, p_message_id, true, 'Human takeover paused AI automation.', now()
  )
  on conflict (conversation_id) do update set
    automation_state = 'human_paused',
    human_takeover_at = coalesce(public.conversation_ai_state.human_takeover_at, now()),
    human_takeover_by = coalesce(p_actor_user_id, public.conversation_ai_state.human_takeover_by),
    human_takeover_reason = coalesce(reason, public.conversation_ai_state.human_takeover_reason),
    last_human_message_id = coalesce(p_message_id, public.conversation_ai_state.last_human_message_id),
    needs_human = true,
    needs_human_reason = 'Human takeover paused AI automation.',
    updated_at = now()
  returning * into state_row;
  return state_row;
end;
$$;

create or replace function public.pause_conversation_ai(
  p_workspace_id uuid,
  p_conversation_id uuid,
  p_reason text default 'manual_pause'
)
returns public.conversation_ai_state
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if auth.uid() is null and current_user <> 'service_role' then
    raise exception 'authentication_required';
  end if;
  if current_user <> 'service_role' and not public.is_workspace_member(p_workspace_id) then
    raise exception 'workspace_access_denied';
  end if;
  if not exists (
    select 1 from public.conversations
    where id = p_conversation_id and workspace_id = p_workspace_id
  ) then
    raise exception 'conversation_not_found';
  end if;
  return private.pause_conversation_for_human(p_workspace_id, p_conversation_id, null, auth.uid(), p_reason);
end;
$$;

create or replace function public.resume_conversation_ai(
  p_workspace_id uuid,
  p_conversation_id uuid
)
returns public.conversation_ai_state
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare state_row public.conversation_ai_state;
begin
  if auth.uid() is null and current_user <> 'service_role' then
    raise exception 'authentication_required';
  end if;
  if current_user <> 'service_role' and not public.is_workspace_member(p_workspace_id) then
    raise exception 'workspace_access_denied';
  end if;
  if not exists (
    select 1 from public.conversations
    where id = p_conversation_id and workspace_id = p_workspace_id
  ) then
    raise exception 'conversation_not_found';
  end if;
  update public.conversation_ai_state
  set automation_state = 'ai_active',
      human_takeover_at = null,
      human_takeover_by = null,
      human_takeover_reason = null,
      paused_until = null,
      needs_human = false,
      needs_human_reason = null,
      updated_at = now()
  where workspace_id = p_workspace_id and conversation_id = p_conversation_id
  returning * into state_row;
  if state_row.id is null then
    insert into public.conversation_ai_state (workspace_id, conversation_id, automation_state)
    values (p_workspace_id, p_conversation_id, 'ai_active')
    returning * into state_row;
  end if;
  insert into public.audit_log (workspace_id, actor_user_id, action, entity_type, entity_id, metadata_json)
  values (p_workspace_id, auth.uid(), 'ai.resumed', 'conversation', p_conversation_id, jsonb_build_object('automation_state', 'ai_active'));
  return state_row;
end;
$$;

revoke all on function public.pause_conversation_ai(uuid, uuid, text) from public, anon;
revoke all on function public.resume_conversation_ai(uuid, uuid) from public, anon;
grant execute on function public.pause_conversation_ai(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.resume_conversation_ai(uuid, uuid) to authenticated, service_role;

-- Claims an AI send idempotently and rechecks takeover state in the same
-- transaction immediately before the provider call.
create or replace function public.claim_ai_reply_send(
  p_workspace_id uuid,
  p_conversation_id uuid,
  p_source_message_id uuid,
  p_idempotency_key text
)
returns public.ai_outbound_messages
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  state_row public.conversation_ai_state;
  source_created_at timestamptz;
  send_row public.ai_outbound_messages;
begin
  select * into state_row from public.conversation_ai_state
  where workspace_id = p_workspace_id and conversation_id = p_conversation_id
  for update;
  if state_row.id is null or state_row.automation_state <> 'ai_active' then
    raise exception 'human_paused';
  end if;
  select created_at into source_created_at from public.messages
  where id = p_source_message_id and workspace_id = p_workspace_id and conversation_id = p_conversation_id;
  if source_created_at is null then raise exception 'source_message_not_found'; end if;
  if state_row.human_takeover_at is not null and state_row.human_takeover_at >= source_created_at then
    raise exception 'human_paused';
  end if;
  insert into public.ai_outbound_messages (workspace_id, conversation_id, source_message_id, idempotency_key)
  values (p_workspace_id, p_conversation_id, p_source_message_id, p_idempotency_key)
  on conflict (workspace_id, idempotency_key) do update set
    status = case when public.ai_outbound_messages.status = 'failed' then 'sending' else public.ai_outbound_messages.status end,
    error_code = case when public.ai_outbound_messages.status = 'failed' then null else public.ai_outbound_messages.error_code end,
    updated_at = now()
  returning * into send_row;
  if send_row.id is null then
    select * into send_row from public.ai_outbound_messages
    where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key;
  end if;
  return send_row;
end;
$$;

revoke all on function public.claim_ai_reply_send(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_ai_reply_send(uuid, uuid, uuid, text) to service_role;

create or replace function private.pause_after_human_message()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.direction = 'outbound' and not new.ai_generated then
    perform private.pause_conversation_for_human(
      new.workspace_id, new.conversation_id, new.id, new.sent_by_user_id, 'human_message'
    );
    insert into public.audit_log (workspace_id, actor_user_id, action, entity_type, entity_id, metadata_json)
    values (new.workspace_id, new.sent_by_user_id, 'ai.human_takeover', 'conversation', new.conversation_id,
      jsonb_build_object('message_id', new.id, 'origin', new.origin));
  end if;
  return new;
end;
$$;

revoke all on function private.pause_after_human_message() from public, anon, authenticated;
grant execute on function private.pause_after_human_message() to service_role;
drop trigger if exists pause_after_human_message on public.messages;
create trigger pause_after_human_message
  after insert on public.messages
  for each row execute function private.pause_after_human_message();

-- AI decisions are visible to workspace members through the existing audit log.
grant select on public.audit_log to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ai_outbound_messages'
  ) then
    alter publication supabase_realtime add table public.ai_outbound_messages;
  end if;
end
$$;
