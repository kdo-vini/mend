-- Inbox operational data. The base schema already owns contacts, conversations,
-- and messages; this migration adds the missing links and transaction boundaries.

alter table public.conversations
  add column if not exists last_read_at timestamptz;

alter table public.messages
  add column if not exists read_at timestamptz;

create unique index if not exists conversations_channel_contact_unique_idx
  on public.conversations (channel_connection_id, contact_id);

create index if not exists conversations_workspace_status_last_message_idx
  on public.conversations (workspace_id, status, last_message_at desc nulls last);

create index if not exists messages_workspace_conversation_created_idx
  on public.messages (workspace_id, conversation_id, created_at desc);

create table public.issue_messages (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  issue_id uuid not null references public.issues(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (issue_id, message_id)
);

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  issue_id uuid not null references public.issues(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  kind text not null check (kind in ('text', 'message', 'file', 'link')),
  label text not null check (char_length(label) between 1 and 240),
  body text,
  storage_path text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (kind <> 'message' or message_id is not null),
  check (kind <> 'file' or storage_path is not null),
  check (kind <> 'link' or body is not null)
);

create table public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null check (entity_type in ('contact', 'conversation', 'message', 'issue', 'evidence')),
  entity_id uuid not null,
  event_type text not null,
  actor_type text not null default 'system' check (actor_type in ('contact', 'user', 'ai', 'system')),
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  dedupe_key text,
  created_at timestamptz not null default now()
);

create unique index if not exists timeline_events_workspace_dedupe_idx
  on public.timeline_events (workspace_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists timeline_events_workspace_entity_created_idx
  on public.timeline_events (workspace_id, entity_type, entity_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  entity_type text,
  entity_id uuid,
  payload_json jsonb not null default '{}'::jsonb,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists notifications_workspace_recipient_dedupe_idx
  on public.notifications (workspace_id, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), dedupe_key)
  where dedupe_key is not null;

create index if not exists issue_messages_workspace_issue_idx
  on public.issue_messages (workspace_id, issue_id, created_at desc);

create index if not exists issue_messages_workspace_message_idx
  on public.issue_messages (workspace_id, message_id);

create index if not exists evidence_workspace_issue_created_idx
  on public.evidence (workspace_id, issue_id, created_at desc);

create index if not exists evidence_workspace_message_idx
  on public.evidence (workspace_id, message_id);

create index if not exists notifications_workspace_user_created_idx
  on public.notifications (workspace_id, user_id, created_at desc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array['issue_messages', 'evidence', 'timeline_events', 'notifications'] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

create policy "members can access issue messages"
  on public.issue_messages for all to authenticated
  using (
    public.is_workspace_member(issue_messages.workspace_id)
    and exists (
      select 1 from public.issues i
      where i.id = issue_messages.issue_id and i.workspace_id = issue_messages.workspace_id
    )
    and exists (
      select 1 from public.messages m
      where m.id = issue_messages.message_id and m.workspace_id = issue_messages.workspace_id
    )
  )
  with check (
    public.is_workspace_member(issue_messages.workspace_id)
    and exists (
      select 1 from public.issues i
      where i.id = issue_messages.issue_id and i.workspace_id = issue_messages.workspace_id
    )
    and exists (
      select 1 from public.messages m
      where m.id = issue_messages.message_id and m.workspace_id = issue_messages.workspace_id
    )
  );

create policy "members can access evidence"
  on public.evidence for all to authenticated
  using (
    public.is_workspace_member(evidence.workspace_id)
    and exists (
      select 1 from public.issues i
      where i.id = evidence.issue_id and i.workspace_id = evidence.workspace_id
    )
    and (
      evidence.message_id is null
      or exists (
        select 1 from public.messages m
        where m.id = evidence.message_id and m.workspace_id = evidence.workspace_id
      )
    )
  )
  with check (
    public.is_workspace_member(evidence.workspace_id)
    and exists (
      select 1 from public.issues i
      where i.id = evidence.issue_id and i.workspace_id = evidence.workspace_id
    )
    and (
      evidence.message_id is null
      or exists (
        select 1 from public.messages m
        where m.id = evidence.message_id and m.workspace_id = evidence.workspace_id
      )
    )
  );

create policy "members can access timeline events"
  on public.timeline_events for all to authenticated
  using (public.is_workspace_member(timeline_events.workspace_id))
  with check (public.is_workspace_member(timeline_events.workspace_id));

create policy "members can access notifications"
  on public.notifications for all to authenticated
  using (public.is_workspace_member(notifications.workspace_id) and (user_id is null or user_id = (select auth.uid())))
  with check (public.is_workspace_member(notifications.workspace_id) and (user_id is null or user_id = (select auth.uid())));

grant select, insert, update, delete on public.issue_messages, public.evidence, public.timeline_events, public.notifications to authenticated;
grant select, insert, update, delete on public.issue_messages, public.evidence, public.timeline_events, public.notifications to service_role;

-- A single idempotent transaction for a normalized provider message. The
-- service-role path is for webhook workers; authenticated callers still need
-- workspace membership. No raw provider payload is accepted or stored here.
create or replace function public.inbox_ingest_message(
  p_workspace_id uuid,
  p_channel_connection_id uuid,
  p_phone_number text,
  p_display_name text,
  p_provider_contact_id text,
  p_provider_message_id text,
  p_direction text,
  p_sender_type text,
  p_message_type text,
  p_text text default null,
  p_caption text default null,
  p_media_storage_path text default null,
  p_media_remote_url text default null,
  p_mime_type text default null,
  p_file_name text default null,
  p_file_size bigint default null,
  p_duration_seconds integer default null,
  p_quoted_provider_message_id text default null,
  p_provider_timestamp timestamptz default null,
  p_ai_generated boolean default false,
  p_sent_by_user_id uuid default null,
  p_actor_type text default 'system',
  p_actor_user_id uuid default null,
  p_timeline_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_contact_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_quoted_message_id uuid;
  v_assigned_user_id uuid;
  v_inserted boolean := false;
  v_unread_count integer := 0;
  v_now timestamptz := now();
begin
  if p_workspace_id is null or p_channel_connection_id is null then
    raise exception 'workspace_scope_required';
  end if;

  if current_user not in ('service_role', 'postgres') and not public.is_workspace_member(p_workspace_id) then
    raise exception 'workspace_access_denied';
  end if;

  if not exists (
    select 1 from public.channel_connections c
    where c.id = p_channel_connection_id and c.workspace_id = p_workspace_id
  ) then
    raise exception 'channel_connection_scope_violation';
  end if;

  if nullif(btrim(p_phone_number), '') is null or nullif(btrim(p_provider_message_id), '') is null then
    raise exception 'provider_identity_required';
  end if;

  insert into public.contacts (workspace_id, channel_connection_id, provider_contact_id, phone_number, display_name, updated_at)
  values (
    p_workspace_id,
    p_channel_connection_id,
    nullif(left(btrim(p_provider_contact_id), 240), ''),
    left(btrim(p_phone_number), 80),
    coalesce(nullif(left(btrim(p_display_name), 240), ''), 'WhatsApp contact'),
    v_now
  )
  on conflict (workspace_id, phone_number) do update
    set channel_connection_id = excluded.channel_connection_id,
        provider_contact_id = coalesce(excluded.provider_contact_id, contacts.provider_contact_id),
        display_name = case when excluded.display_name <> 'WhatsApp contact' then excluded.display_name else contacts.display_name end,
        updated_at = v_now
  returning id into v_contact_id;

  insert into public.conversations (workspace_id, channel_connection_id, contact_id, updated_at)
  values (p_workspace_id, p_channel_connection_id, v_contact_id, v_now)
  on conflict (channel_connection_id, contact_id) do update
    set updated_at = v_now
  returning id, assigned_user_id into v_conversation_id, v_assigned_user_id;

  if p_quoted_provider_message_id is not null then
    select m.id into v_quoted_message_id
    from public.messages m
    where m.workspace_id = p_workspace_id
      and m.channel_connection_id = p_channel_connection_id
      and m.provider_message_id = p_quoted_provider_message_id;
  end if;

  insert into public.messages (
    workspace_id, conversation_id, channel_connection_id, provider_message_id,
    direction, sender_type, message_type, text, caption, media_storage_path,
    media_remote_url, mime_type, file_name, file_size, duration_seconds,
    quoted_message_id, ai_generated, sent_by_user_id, provider_timestamp, created_at, updated_at
  )
  values (
    p_workspace_id, v_conversation_id, p_channel_connection_id, left(btrim(p_provider_message_id), 500),
    p_direction, p_sender_type, p_message_type, left(p_text, 20000), left(p_caption, 4000),
    left(p_media_storage_path, 1000), left(p_media_remote_url, 1000), left(p_mime_type, 160),
    left(p_file_name, 240), p_file_size, p_duration_seconds, v_quoted_message_id,
    coalesce(p_ai_generated, false), p_sent_by_user_id, p_provider_timestamp, coalesce(p_provider_timestamp, v_now), v_now
  )
  on conflict (channel_connection_id, provider_message_id) do nothing
  returning id into v_message_id;

  v_inserted := v_message_id is not null;

  if not v_inserted then
    select m.id, m.conversation_id, c.contact_id
      into v_message_id, v_conversation_id, v_contact_id
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.workspace_id = p_workspace_id
      and m.channel_connection_id = p_channel_connection_id
      and m.provider_message_id = left(btrim(p_provider_message_id), 500);
  elsif p_direction = 'inbound' then
    update public.conversations
    set status = case when status = 'resolved' then 'open' else status end,
        attention_state = 'needs_attention',
        unread_count = unread_count + 1,
        last_inbound_at = coalesce(p_provider_timestamp, v_now),
        last_message_at = coalesce(p_provider_timestamp, v_now),
        snoozed_until = null,
        resolved_at = null,
        updated_at = v_now
    where id = v_conversation_id and workspace_id = p_workspace_id
    returning unread_count, assigned_user_id into v_unread_count, v_assigned_user_id;
  else
    update public.conversations
    set last_outbound_at = coalesce(p_provider_timestamp, v_now),
        last_message_at = coalesce(p_provider_timestamp, v_now),
        updated_at = v_now
    where id = v_conversation_id and workspace_id = p_workspace_id
    returning unread_count, assigned_user_id into v_unread_count, v_assigned_user_id;
  end if;

  if v_inserted and p_timeline_key is not null then
    insert into public.timeline_events (workspace_id, entity_type, entity_id, event_type, actor_type, actor_user_id, metadata_json, dedupe_key)
    values (
      p_workspace_id, 'message', v_message_id,
      case when p_direction = 'inbound' then 'message.received' else 'message.sent' end,
      p_actor_type, p_actor_user_id, coalesce(p_metadata, '{}'::jsonb), left(p_timeline_key, 500)
    )
    on conflict (workspace_id, dedupe_key) do nothing;
  end if;

  if v_inserted and p_direction = 'inbound' and v_assigned_user_id is not null then
    insert into public.notifications (workspace_id, user_id, kind, title, body, entity_type, entity_id, payload_json, dedupe_key)
    values (
      p_workspace_id, v_assigned_user_id, 'conversation_message', 'New WhatsApp message',
      'A conversation assigned to you needs attention.', 'conversation', v_conversation_id,
      jsonb_build_object('message_id', v_message_id), 'message:' || v_message_id::text
    )
    on conflict (workspace_id, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), dedupe_key) do nothing;
  end if;

  if not v_inserted then
    select c.unread_count into v_unread_count
    from public.conversations c
    where c.id = v_conversation_id and c.workspace_id = p_workspace_id;
  end if;

  return jsonb_build_object(
    'inserted', v_inserted,
    'contact_id', v_contact_id,
    'conversation_id', v_conversation_id,
    'message_id', v_message_id,
    'unread_count', coalesce(v_unread_count, 0)
  );
end;
$$;

create or replace function public.inbox_set_conversation_state(
  p_workspace_id uuid,
  p_conversation_id uuid,
  p_action text,
  p_snoozed_until timestamptz default null,
  p_actor_user_id uuid default null,
  p_timeline_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_conversation public.conversations%rowtype;
begin
  if current_user not in ('service_role', 'postgres') and not public.is_workspace_member(p_workspace_id) then
    raise exception 'workspace_access_denied';
  end if;

  select * into v_conversation
  from public.conversations
  where id = p_conversation_id and workspace_id = p_workspace_id
  for update;
  if not found then raise exception 'conversation_not_found'; end if;

  if p_action = 'read' then
    update public.conversations
    set unread_count = 0, last_read_at = now(), attention_state = 'none', updated_at = now()
    where id = p_conversation_id and workspace_id = p_workspace_id;
    update public.messages set read_at = now()
    where conversation_id = p_conversation_id and workspace_id = p_workspace_id and direction = 'inbound' and read_at is null;
  elsif p_action = 'unread' then
    update public.conversations
    set unread_count = greatest(unread_count, 1), attention_state = 'needs_attention', status = case when status = 'resolved' then 'open' else status end, resolved_at = null, updated_at = now()
    where id = p_conversation_id and workspace_id = p_workspace_id;
  elsif p_action = 'snooze' then
    if p_snoozed_until is null or p_snoozed_until <= now() then raise exception 'snooze_until_must_be_future'; end if;
    update public.conversations
    set status = 'snoozed', snoozed_until = p_snoozed_until, attention_state = 'none', updated_at = now()
    where id = p_conversation_id and workspace_id = p_workspace_id;
  elsif p_action = 'resolve' then
    update public.conversations
    set status = 'resolved', resolved_at = now(), snoozed_until = null, unread_count = 0, attention_state = 'none', updated_at = now()
    where id = p_conversation_id and workspace_id = p_workspace_id;
  else
    raise exception 'unsupported_conversation_action';
  end if;

  if p_timeline_key is not null then
    insert into public.timeline_events (workspace_id, entity_type, entity_id, event_type, actor_type, actor_user_id, metadata_json, dedupe_key)
    values (p_workspace_id, 'conversation', p_conversation_id, 'conversation.' || p_action, 'user', p_actor_user_id, coalesce(p_metadata, '{}'::jsonb), left(p_timeline_key, 500))
    on conflict (workspace_id, dedupe_key) do nothing;
  end if;

  select * into v_conversation from public.conversations where id = p_conversation_id and workspace_id = p_workspace_id;
  return jsonb_build_object(
    'id', v_conversation.id,
    'workspace_id', v_conversation.workspace_id,
    'status', v_conversation.status,
    'attention_state', v_conversation.attention_state,
    'unread_count', v_conversation.unread_count,
    'last_read_at', v_conversation.last_read_at,
    'snoozed_until', v_conversation.snoozed_until,
    'resolved_at', v_conversation.resolved_at
  );
end;
$$;

create or replace function public.inbox_link_issue_message(
  p_workspace_id uuid,
  p_issue_id uuid,
  p_message_id uuid,
  p_actor_user_id uuid default null,
  p_timeline_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_inserted boolean := false;
begin
  if current_user not in ('service_role', 'postgres') and not public.is_workspace_member(p_workspace_id) then raise exception 'workspace_access_denied'; end if;
  if not exists (select 1 from public.issues where id = p_issue_id and workspace_id = p_workspace_id) then raise exception 'issue_scope_violation'; end if;
  if not exists (select 1 from public.messages where id = p_message_id and workspace_id = p_workspace_id) then raise exception 'message_scope_violation'; end if;
  insert into public.issue_messages (workspace_id, issue_id, message_id) values (p_workspace_id, p_issue_id, p_message_id) on conflict do nothing;
  v_inserted := found;
  if p_timeline_key is not null then
    insert into public.timeline_events (workspace_id, entity_type, entity_id, event_type, actor_type, actor_user_id, metadata_json, dedupe_key)
    values (p_workspace_id, 'issue', p_issue_id, 'issue.message_linked', 'user', p_actor_user_id, coalesce(p_metadata, '{}'::jsonb), left(p_timeline_key, 500))
    on conflict (workspace_id, dedupe_key) do nothing;
  end if;
  return jsonb_build_object('inserted', v_inserted, 'issue_id', p_issue_id, 'message_id', p_message_id);
end;
$$;

create or replace function public.inbox_create_evidence(
  p_workspace_id uuid,
  p_issue_id uuid,
  p_message_id uuid,
  p_kind text,
  p_label text,
  p_body text default null,
  p_storage_path text default null,
  p_mime_type text default null,
  p_size_bytes bigint default null,
  p_actor_user_id uuid default null,
  p_timeline_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_evidence_id uuid;
begin
  if current_user not in ('service_role', 'postgres') and not public.is_workspace_member(p_workspace_id) then raise exception 'workspace_access_denied'; end if;
  if not exists (select 1 from public.issues where id = p_issue_id and workspace_id = p_workspace_id) then raise exception 'issue_scope_violation'; end if;
  if p_message_id is not null and not exists (select 1 from public.messages where id = p_message_id and workspace_id = p_workspace_id) then raise exception 'message_scope_violation'; end if;
  if p_kind = 'message' and p_message_id is null then raise exception 'message_evidence_requires_message'; end if;
  if p_kind = 'file' and p_storage_path is null then raise exception 'file_evidence_requires_storage'; end if;
  if p_kind = 'link' and p_body is null then raise exception 'link_evidence_requires_body'; end if;

  insert into public.evidence (workspace_id, issue_id, message_id, kind, label, body, storage_path, mime_type, size_bytes, created_by_user_id)
  values (p_workspace_id, p_issue_id, p_message_id, p_kind, left(btrim(p_label), 240), left(p_body, 20000), left(p_storage_path, 1000), left(p_mime_type, 160), p_size_bytes, p_actor_user_id)
  returning id into v_evidence_id;

  if p_timeline_key is not null then
    insert into public.timeline_events (workspace_id, entity_type, entity_id, event_type, actor_type, actor_user_id, metadata_json, dedupe_key)
    values (p_workspace_id, 'evidence', v_evidence_id, 'evidence.created', 'user', p_actor_user_id, coalesce(p_metadata, '{}'::jsonb), left(p_timeline_key, 500))
    on conflict (workspace_id, dedupe_key) do nothing;
  end if;
  return jsonb_build_object('evidence_id', v_evidence_id, 'issue_id', p_issue_id, 'message_id', p_message_id);
end;
$$;

revoke all on function public.inbox_ingest_message(uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, bigint, integer, text, timestamptz, boolean, uuid, text, uuid, text, jsonb) from public, anon;
revoke all on function public.inbox_set_conversation_state(uuid, uuid, text, timestamptz, uuid, text, jsonb) from public, anon;
revoke all on function public.inbox_link_issue_message(uuid, uuid, uuid, uuid, text, jsonb) from public, anon;
revoke all on function public.inbox_create_evidence(uuid, uuid, uuid, text, text, text, text, text, bigint, uuid, text, jsonb) from public, anon;

grant execute on function public.inbox_ingest_message(uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, bigint, integer, text, timestamptz, boolean, uuid, text, uuid, text, jsonb) to authenticated, service_role;
grant execute on function public.inbox_set_conversation_state(uuid, uuid, text, timestamptz, uuid, text, jsonb) to authenticated, service_role;
grant execute on function public.inbox_link_issue_message(uuid, uuid, uuid, uuid, text, jsonb) to authenticated, service_role;
grant execute on function public.inbox_create_evidence(uuid, uuid, uuid, text, text, text, text, text, bigint, uuid, text, jsonb) to authenticated, service_role;
