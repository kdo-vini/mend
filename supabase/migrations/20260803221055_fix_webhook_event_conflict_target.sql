create or replace function private.capture_whatsmiau_job_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  incoming jsonb;
  safe_payload jsonb;
  instance_name text;
  provider_message_id text;
  remote_jid text;
  message_type text;
  direction text;
  event_name text;
begin
  if new.type <> 'whatsmiau.message.received' then
    return new;
  end if;

  incoming := case
    when jsonb_typeof(new.payload -> 'message') = 'object' then new.payload -> 'message'
    else '{}'::jsonb
  end;
  instance_name := nullif(left(incoming ->> 'instanceName', 240), '');
  provider_message_id := nullif(left(incoming ->> 'providerMessageId', 240), '');
  if instance_name is null or provider_message_id is null then
    return new;
  end if;

  remote_jid := nullif(incoming ->> 'remoteJid', '');
  message_type := case when incoming ->> 'messageType' in ('text', 'image', 'video', 'audio', 'document', 'reaction')
    then incoming ->> 'messageType' else null end;
  direction := case when incoming ->> 'direction' in ('inbound', 'outbound')
    then incoming ->> 'direction' else null end;
  event_name := coalesce(nullif(left(new.payload ->> 'event', 120), ''), 'messages.upsert');
  safe_payload := jsonb_build_object('event', event_name, 'message', incoming - 'raw');

  insert into public.webhook_events (
    workspace_id, job_id, provider, event_name, instance_name,
    provider_message_id, remote_jid_hash, message_type, direction,
    payload_hash
  ) values (
    new.workspace_id,
    new.id,
    'whatsmiau',
    event_name,
    instance_name,
    provider_message_id,
    case when remote_jid is null then null else encode(extensions.digest(remote_jid, 'sha256'), 'hex') end,
    message_type,
    direction,
    encode(extensions.digest(safe_payload::text, 'sha256'), 'hex')
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
