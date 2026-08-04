-- Serialize one provider message identity and return existing rows before
-- creating/updating contacts. This keeps duplicate webhook deliveries from
-- leaving empty contacts or conversations behind.
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_channel_connection_id::text || ':' || left(btrim(p_provider_message_id), 500),
      0
    )
  );

  select m.id, m.conversation_id, c.contact_id, c.unread_count, c.assigned_user_id
  into v_message_id, v_conversation_id, v_contact_id, v_unread_count, v_assigned_user_id
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where m.workspace_id = p_workspace_id
    and m.channel_connection_id = p_channel_connection_id
    and m.provider_message_id = left(btrim(p_provider_message_id), 500);

  if found then
    return jsonb_build_object(
      'inserted', false,
      'contact_id', v_contact_id,
      'conversation_id', v_conversation_id,
      'message_id', v_message_id,
      'unread_count', coalesce(v_unread_count, 0)
    );
  end if;

  insert into public.contacts (
    workspace_id, channel_connection_id, provider_contact_id, phone_number, display_name, updated_at
  ) values (
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
      display_name = case
        when excluded.display_name <> 'WhatsApp contact' then excluded.display_name
        else contacts.display_name
      end,
      updated_at = v_now
  returning id into v_contact_id;

  insert into public.conversations (
    workspace_id, channel_connection_id, contact_id, updated_at
  ) values (
    p_workspace_id, p_channel_connection_id, v_contact_id, v_now
  )
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
    quoted_message_id, ai_generated, sent_by_user_id, provider_timestamp,
    created_at, updated_at
  ) values (
    p_workspace_id, v_conversation_id, p_channel_connection_id,
    left(btrim(p_provider_message_id), 500), p_direction, p_sender_type,
    p_message_type, left(p_text, 20000), left(p_caption, 4000),
    left(p_media_storage_path, 1000), left(p_media_remote_url, 1000),
    left(p_mime_type, 160), left(p_file_name, 240), p_file_size,
    p_duration_seconds, v_quoted_message_id, coalesce(p_ai_generated, false),
    p_sent_by_user_id, p_provider_timestamp,
    coalesce(p_provider_timestamp, v_now), v_now
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
    insert into public.timeline_events (
      workspace_id, entity_type, entity_id, event_type, actor_type,
      actor_user_id, metadata_json, dedupe_key
    ) values (
      p_workspace_id, 'message', v_message_id,
      case when p_direction = 'inbound' then 'message.received' else 'message.sent' end,
      p_actor_type, p_actor_user_id, coalesce(p_metadata, '{}'::jsonb),
      left(p_timeline_key, 500)
    )
    on conflict do nothing;
  end if;

  if v_inserted and p_direction = 'inbound' and v_assigned_user_id is not null then
    insert into public.notifications (
      workspace_id, user_id, kind, title, body, entity_type, entity_id,
      payload_json, dedupe_key
    ) values (
      p_workspace_id, v_assigned_user_id, 'conversation_message',
      'New WhatsApp message',
      'A conversation assigned to you needs attention.',
      'conversation', v_conversation_id,
      jsonb_build_object('message_id', v_message_id),
      'message:' || v_message_id::text
    )
    on conflict do nothing;
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

revoke all on function public.inbox_ingest_message(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text,
  text, text, text, bigint, integer, text, timestamptz, boolean, uuid, text,
  uuid, text, jsonb
) from public, anon;
grant execute on function public.inbox_ingest_message(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text,
  text, text, text, bigint, integer, text, timestamptz, boolean, uuid, text,
  uuid, text, jsonb
) to authenticated, service_role;
