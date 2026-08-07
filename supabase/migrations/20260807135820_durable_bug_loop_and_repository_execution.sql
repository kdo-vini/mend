-- Durable complaint-to-fix state plus the minimum repository execution
-- settings required to dispatch a coding agent without provider-specific
-- columns elsewhere in the product.

alter table public.repositories
  add column if not exists agent_provider text not null default 'codex',
  add column if not exists execution_plane text not null default 'local_cli',
  add column if not exists github_owner text,
  add column if not exists github_repo text,
  add column if not exists github_installation_id text;

alter table public.repositories
  drop constraint if exists repositories_agent_provider_check,
  add constraint repositories_agent_provider_check
    check (agent_provider in ('codex', 'claude', 'gemini', 'verboo', 'custom')),
  drop constraint if exists repositories_execution_plane_check,
  add constraint repositories_execution_plane_check
    check (execution_plane in ('local_cli', 'github_actions')),
  drop constraint if exists repositories_github_coordinates_check,
  add constraint repositories_github_coordinates_check
    check (
      (github_owner is null and github_repo is null)
      or (nullif(btrim(github_owner), '') is not null and nullif(btrim(github_repo), '') is not null)
    );

create table public.github_setup_states (
  state_hash text primary key check (char_length(state_hash) between 32 and 256),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  repository_id uuid references public.repositories(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (consumed_at is null or consumed_at >= created_at)
);

create index github_setup_states_expires_idx
  on public.github_setup_states (expires_at)
  where consumed_at is null;

alter table public.github_setup_states enable row level security;
revoke all on table public.github_setup_states from public, anon, authenticated;
grant select, insert, update, delete on table public.github_setup_states to service_role;

create table public.bug_cases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  issue_id uuid not null unique references public.issues(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  signal_message_id uuid references public.messages(id) on delete set null,
  duplicate_of_issue_id uuid references public.issues(id) on delete set null,
  fingerprint text,
  stage text not null default 'signal' check (stage in (
    'signal', 'suspicion', 'evidence', 'investigation', 'verdict', 'decision',
    'fix', 'verification', 'pull_request', 'approval', 'merge', 'deploy',
    'health_check', 'customer_response', 'completed', 'failed'
  )),
  status text not null default 'active' check (status in (
    'active', 'awaiting_human', 'completed', 'failed', 'canceled'
  )),
  suspicion_score numeric(4,3) check (suspicion_score between 0 and 1),
  evidence_json jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence_json) = 'array'),
  verdict text not null default 'pending' check (verdict in (
    'pending', 'confirmed', 'not_reproduced', 'not_a_bug', 'duplicate', 'needs_human'
  )),
  decision text not null default 'pending' check (decision in (
    'pending', 'notify', 'autofix', 'manual_fix', 'dismiss'
  )),
  investigation_run_id uuid references public.coding_runs(id) on delete set null,
  fix_run_id uuid references public.coding_runs(id) on delete set null,
  pr_url text,
  pr_number integer check (pr_number is null or pr_number > 0),
  merge_sha text,
  deployment_url text,
  health_status text not null default 'pending' check (health_status in (
    'pending', 'healthy', 'unhealthy'
  )),
  customer_response_status text not null default 'pending' check (customer_response_status in (
    'pending', 'drafted', 'sent', 'skipped'
  )),
  last_error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bug_case_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  bug_case_id uuid not null references public.bug_cases(id) on delete cascade,
  stage text not null check (stage in (
    'signal', 'suspicion', 'evidence', 'investigation', 'verdict', 'decision',
    'fix', 'verification', 'pull_request', 'approval', 'merge', 'deploy',
    'health_check', 'customer_response', 'completed', 'failed'
  )),
  event_type text not null check (char_length(event_type) between 1 and 120),
  message text not null check (char_length(message) between 1 and 2000),
  metadata_json jsonb not null default '{}'::jsonb,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 300),
  created_at timestamptz not null default now(),
  unique (bug_case_id, idempotency_key)
);

create index bug_cases_workspace_updated_idx
  on public.bug_cases (workspace_id, updated_at desc);
create index bug_cases_issue_idx on public.bug_cases (issue_id);
create index bug_cases_conversation_idx on public.bug_cases (conversation_id);
create unique index bug_cases_active_fingerprint_idx
  on public.bug_cases (workspace_id, fingerprint)
  where fingerprint is not null and status in ('active', 'awaiting_human');
create index bug_case_events_case_created_idx
  on public.bug_case_events (bug_case_id, created_at);

alter table public.bug_cases enable row level security;
alter table public.bug_case_events enable row level security;

revoke all on table public.bug_cases from public, anon;
revoke all on table public.bug_case_events from public, anon;
grant select on table public.bug_cases to authenticated;
grant select, insert, update, delete on table public.bug_cases to service_role;
grant select on table public.bug_case_events to authenticated;
grant select, insert, update, delete on table public.bug_case_events to service_role;

create policy "workspace members can read bug cases" on public.bug_cases
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "workspace members can read bug case events" on public.bug_case_events
  for select to authenticated using (public.is_workspace_member(workspace_id));

-- One transaction advances the checkpoint and appends its idempotent event.
-- Only the service-role worker calls this RPC; browser roles use product APIs.
create function public.advance_bug_case(
  p_workspace_id uuid,
  p_bug_case_id uuid,
  p_stage text,
  p_event_type text,
  p_message text,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb,
  p_status text default null,
  p_verdict text default null,
  p_decision text default null,
  p_investigation_run_id uuid default null,
  p_fix_run_id uuid default null,
  p_pr_url text default null,
  p_pr_number integer default null,
  p_merge_sha text default null,
  p_deployment_url text default null,
  p_health_status text default null,
  p_customer_response_status text default null,
  p_last_error text default null
)
returns public.bug_cases
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  updated_case public.bug_cases;
  inserted_event_id uuid;
begin
  insert into public.bug_case_events (
    workspace_id, bug_case_id, stage, event_type, message, metadata_json, idempotency_key
  ) values (
    p_workspace_id, p_bug_case_id, p_stage, left(p_event_type, 120),
    left(p_message, 2000), coalesce(p_metadata, '{}'::jsonb), left(p_idempotency_key, 300)
  ) on conflict (bug_case_id, idempotency_key) do nothing
  returning id into inserted_event_id;

  if inserted_event_id is null then
    select * into updated_case
    from public.bug_cases
    where id = p_bug_case_id and workspace_id = p_workspace_id;
    if updated_case.id is null then
      raise exception 'bug_case_not_found';
    end if;
    return updated_case;
  end if;

  update public.bug_cases
  set stage = p_stage,
      status = coalesce(p_status, status),
      verdict = coalesce(p_verdict, verdict),
      decision = coalesce(p_decision, decision),
      investigation_run_id = coalesce(p_investigation_run_id, investigation_run_id),
      fix_run_id = coalesce(p_fix_run_id, fix_run_id),
      pr_url = coalesce(nullif(p_pr_url, ''), pr_url),
      pr_number = coalesce(p_pr_number, pr_number),
      merge_sha = coalesce(nullif(p_merge_sha, ''), merge_sha),
      deployment_url = coalesce(nullif(p_deployment_url, ''), deployment_url),
      health_status = coalesce(p_health_status, health_status),
      customer_response_status = coalesce(p_customer_response_status, customer_response_status),
      last_error = coalesce(nullif(left(p_last_error, 2000), ''), last_error),
      completed_at = case when coalesce(p_status, status) = 'completed' then coalesce(completed_at, now()) else completed_at end,
      updated_at = now()
  where id = p_bug_case_id and workspace_id = p_workspace_id
  returning * into updated_case;

  if updated_case.id is null then
    raise exception 'bug_case_not_found';
  end if;
  return updated_case;
end;
$$;

revoke all on function public.advance_bug_case(
  uuid, uuid, text, text, text, text, jsonb, text, text, text, uuid, uuid,
  text, integer, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.advance_bug_case(
  uuid, uuid, text, text, text, text, jsonb, text, text, text, uuid, uuid,
  text, integer, text, text, text, text, text
) to service_role;

-- Resuming AI also restores the newest inbound message that arrived while a
-- human pause was active. The active-job unique index makes repeated resumes
-- idempotent while the catch-up is queued or running.
create function private.resume_conversation_ai(
  p_workspace_id uuid,
  p_conversation_id uuid
)
returns public.conversation_ai_state
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  state_row public.conversation_ai_state;
  checkpoint_created_at timestamptz;
  inbound record;
  catch_up_job_id uuid := gen_random_uuid();
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null and coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception 'authentication_required';
  end if;
  if caller_id is not null and not public.is_workspace_member(p_workspace_id) then
    raise exception 'workspace_access_denied';
  end if;
  if not exists (
    select 1 from public.conversations
    where id = p_conversation_id and workspace_id = p_workspace_id
  ) then
    raise exception 'conversation_not_found';
  end if;

  insert into public.conversation_ai_state (
    workspace_id, conversation_id, automation_state, last_decision_at, updated_at
  ) values (
    p_workspace_id, p_conversation_id, 'ai_active', now(), now()
  )
  on conflict (conversation_id) do update set
    automation_state = 'ai_active',
    human_takeover_at = null,
    human_takeover_by = null,
    human_takeover_reason = null,
    last_decision = null,
    last_decision_reason = null,
    last_decision_at = now(),
    paused_until = null,
    needs_human = false,
    needs_human_reason = null,
    updated_at = now()
  returning * into state_row;

  select created_at into checkpoint_created_at
  from public.messages
  where id = state_row.last_triaged_message_id;

  select
    message.*,
    conversation.channel_connection_id,
    conversation.contact_id,
    conversation.unread_count,
    channel.provider_instance_name,
    contact.phone_number,
    contact.provider_contact_id,
    contact.display_name
  into inbound
  from public.messages message
  join public.conversations conversation
    on conversation.id = message.conversation_id
    and conversation.workspace_id = message.workspace_id
  join public.channel_connections channel
    on channel.id = conversation.channel_connection_id
    and channel.workspace_id = message.workspace_id
  join public.contacts contact
    on contact.id = conversation.contact_id
    and contact.workspace_id = message.workspace_id
  where message.workspace_id = p_workspace_id
    and message.conversation_id = p_conversation_id
    and message.direction = 'inbound'
    and not message.is_deleted
    and (
      state_row.last_triaged_message_id is null
      or (message.created_at, message.id) > (checkpoint_created_at, state_row.last_triaged_message_id)
    )
  order by message.created_at desc, message.id desc
  limit 1;

  if inbound.id is not null then
    insert into public.jobs (
      id, workspace_id, type, payload, status, attempts, max_attempts,
      available_at, dedupe_key, created_at, updated_at
    ) values (
      catch_up_job_id,
      p_workspace_id,
      'mend.process_inbound_message',
      jsonb_build_object(
        'stage', 'process_inbound_message',
        'ingestionJobId', catch_up_job_id,
        'binding', jsonb_build_object(
          'channelConnectionId', inbound.channel_connection_id,
          'instanceName', inbound.provider_instance_name,
          'workspaceId', p_workspace_id
        ),
        'idempotencyKey', 'whatsapp:' || inbound.channel_connection_id || ':' || inbound.id,
        'message', jsonb_strip_nulls(jsonb_build_object(
          'instanceName', inbound.provider_instance_name,
          'providerMessageId', inbound.provider_message_id,
          'remoteJid', coalesce(inbound.provider_contact_id, inbound.phone_number),
          'phoneNumber', inbound.phone_number,
          'direction', 'inbound',
          'messageType', inbound.message_type,
          'text', inbound.text,
          'caption', inbound.caption,
          'mediaUrl', inbound.media_remote_url,
          'mimeType', inbound.mime_type,
          'fileName', inbound.file_name,
          'fileSize', inbound.file_size,
          'durationSeconds', inbound.duration_seconds,
          'providerTimestamp', inbound.provider_timestamp,
          'contactName', inbound.display_name,
          'chatType', case when coalesce(inbound.provider_contact_id, '') like '%@g.us' then 'group' else 'direct' end,
          'raw', jsonb_build_object('source', 'resume_catch_up')
        )),
        'persisted', jsonb_strip_nulls(jsonb_build_object(
          'id', inbound.id,
          'workspaceId', p_workspace_id,
          'conversationId', p_conversation_id,
          'contactId', inbound.contact_id,
          'providerMessageId', inbound.provider_message_id,
          'direction', 'inbound',
          'messageType', inbound.message_type,
          'unreadCount', inbound.unread_count,
          'inserted', false,
          'mediaStoragePath', inbound.media_storage_path,
          'providerStatus', inbound.provider_status,
          'isDeleted', inbound.is_deleted
        ))
      ),
      'queued', 0, 5, now(),
      'mend:process-inbound:' || inbound.channel_connection_id || ':' || inbound.id,
      now(), now()
    ) on conflict do nothing;
  end if;

  insert into public.audit_log (
    workspace_id, actor_user_id, action, entity_type, entity_id, metadata_json
  ) values (
    p_workspace_id, caller_id, 'ai.resumed', 'conversation', p_conversation_id,
    jsonb_build_object(
      'automation_state', 'ai_active',
      'catch_up_message_id', inbound.id,
      'catch_up_enqueued', inbound.id is not null
    )
  );
  return state_row;
end;
$$;

revoke all on function private.resume_conversation_ai(uuid, uuid) from public, anon;
grant execute on function private.resume_conversation_ai(uuid, uuid) to authenticated, service_role;

create or replace function public.resume_conversation_ai(
  p_workspace_id uuid,
  p_conversation_id uuid
)
returns public.conversation_ai_state
language sql
volatile
security invoker
set search_path = pg_catalog, public, private
as $$ select private.resume_conversation_ai($1, $2); $$;

revoke all on function public.resume_conversation_ai(uuid, uuid) from public, anon;
grant execute on function public.resume_conversation_ai(uuid, uuid) to authenticated, service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['bug_cases', 'bug_case_events'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end
$$;
