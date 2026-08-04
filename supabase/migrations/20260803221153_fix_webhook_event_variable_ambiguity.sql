create or replace function private.capture_whatsmiau_job_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_incoming jsonb;
  v_safe_payload jsonb;
  v_instance_name text;
  v_provider_message_id text;
  v_remote_jid text;
  v_message_type text;
  v_direction text;
  v_event_name text;
begin
  if new.type <> 'whatsmiau.message.received' then
    return new;
  end if;

  v_incoming := case
    when jsonb_typeof(new.payload -> 'message') = 'object' then new.payload -> 'message'
    else '{}'::jsonb
  end;
  v_instance_name := nullif(left(v_incoming ->> 'instanceName', 240), '');
  v_provider_message_id := nullif(left(v_incoming ->> 'providerMessageId', 240), '');
  if v_instance_name is null or v_provider_message_id is null then
    return new;
  end if;

  v_remote_jid := nullif(v_incoming ->> 'remoteJid', '');
  v_message_type := case when v_incoming ->> 'messageType' in ('text', 'image', 'video', 'audio', 'document', 'reaction')
    then v_incoming ->> 'messageType' else null end;
  v_direction := case when v_incoming ->> 'direction' in ('inbound', 'outbound')
    then v_incoming ->> 'direction' else null end;
  v_event_name := coalesce(nullif(left(new.payload ->> 'event', 120), ''), 'messages.upsert');
  v_safe_payload := jsonb_build_object('event', v_event_name, 'message', v_incoming - 'raw');

  insert into public.webhook_events (
    workspace_id, job_id, provider, event_name, instance_name,
    provider_message_id, remote_jid_hash, message_type, direction,
    payload_hash
  ) values (
    new.workspace_id,
    new.id,
    'whatsmiau',
    v_event_name,
    v_instance_name,
    v_provider_message_id,
    case when v_remote_jid is null then null else encode(extensions.digest(v_remote_jid, 'sha256'), 'hex') end,
    v_message_type,
    v_direction,
    encode(extensions.digest(v_safe_payload::text, 'sha256'), 'hex')
  )
  on conflict (provider, (coalesce(workspace_id::text, '')), instance_name, provider_message_id)
  do update set
    delivery_count = public.webhook_events.delivery_count + 1,
    last_seen_at = now(),
    updated_at = now();

  return new;
end;
$$;

revoke all on function private.capture_whatsmiau_job_event() from public, anon, authenticated;
grant execute on function private.capture_whatsmiau_job_event() to service_role;
