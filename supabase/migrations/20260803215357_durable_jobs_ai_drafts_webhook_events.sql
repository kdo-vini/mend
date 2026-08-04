-- Durable worker pipeline, reviewable AI drafts and redacted webhook delivery
-- metadata. The worker owns these records with service_role; browser roles
-- only receive the workspace-scoped read surface explicitly granted below.

alter table public.workspaces
  add column if not exists ai_policy_json jsonb not null default '{
    "draft_enabled": true,
    "safe_auto_enabled": true,
    "safe_auto_min_confidence": 0.85,
    "safe_auto_intents": ["question", "how_to", "status"],
    "safe_auto_send_enabled": false,
    "require_published_knowledge": false
  }'::jsonb;

alter table public.jobs
  add column if not exists lease_expires_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists dead_at timestamptz;

create index if not exists jobs_claimable_idx
  on public.jobs (status, available_at, created_at);

create table if not exists public.ai_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  source_message_id uuid not null references public.messages(id) on delete cascade,
  idempotency_key text not null,
  mode text not null check (mode in ('draft', 'safe_auto')),
  action text not null check (action in ('draft', 'auto_reply', 'blocked')),
  status text not null check (status in ('pending_review', 'auto_eligible', 'sent', 'rejected', 'expired')),
  body text not null check (char_length(body) between 1 and 12000),
  triage_json jsonb not null default '{}'::jsonb,
  policy_json jsonb not null default '{}'::jsonb,
  safety_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (workspace_id, idempotency_key)
);

create index if not exists ai_drafts_workspace_conversation_idx
  on public.ai_drafts (workspace_id, conversation_id, created_at desc);

create table if not exists public.ai_draft_knowledge (
  draft_id uuid not null references public.ai_drafts(id) on delete cascade,
  knowledge_article_id uuid not null references public.knowledge_articles(id) on delete cascade,
  rank integer not null default 0 check (rank >= 0),
  primary key (draft_id, knowledge_article_id)
);

create index if not exists ai_draft_knowledge_article_idx
  on public.ai_draft_knowledge (knowledge_article_id);

alter table public.ai_drafts enable row level security;
alter table public.ai_draft_knowledge enable row level security;
revoke all on table public.ai_drafts, public.ai_draft_knowledge from public, anon;
grant select on table public.ai_drafts, public.ai_draft_knowledge to authenticated;
grant select, insert, update, delete on table public.ai_drafts, public.ai_draft_knowledge to service_role;

drop policy if exists "workspace members can read ai drafts" on public.ai_drafts;
create policy "workspace members can read ai drafts"
  on public.ai_drafts for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can read ai draft knowledge" on public.ai_draft_knowledge;
create policy "workspace members can read ai draft knowledge"
  on public.ai_draft_knowledge for select to authenticated
  using (exists (
    select 1 from public.ai_drafts d
    where d.id = ai_draft_knowledge.draft_id
      and public.is_workspace_member(d.workspace_id)
  ));

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  provider text not null check (provider = 'whatsmiau'),
  event_name text not null,
  instance_name text not null,
  provider_message_id text not null,
  remote_jid_hash text,
  message_type text check (message_type in ('text', 'image', 'video', 'audio', 'document', 'reaction')),
  direction text check (direction in ('inbound', 'outbound')),
  payload_hash text not null,
  status text not null default 'received' check (status in ('received', 'queued', 'processed', 'retrying', 'dead', 'unmapped')),
  delivery_count integer not null default 1 check (delivery_count > 0),
  message_id uuid references public.messages(id) on delete set null,
  last_error text,
  received_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists webhook_events_dedupe_idx
  on public.webhook_events (
    provider,
    coalesce(workspace_id::text, ''),
    instance_name,
    provider_message_id
  );
create index if not exists webhook_events_workspace_received_idx
  on public.webhook_events (workspace_id, received_at desc);

alter table public.webhook_events enable row level security;
revoke all on table public.webhook_events from public, anon;
grant select on table public.webhook_events to authenticated;
grant select, insert, update, delete on table public.webhook_events to service_role;

drop policy if exists "workspace members can read webhook events" on public.webhook_events;
create policy "workspace members can read webhook events"
  on public.webhook_events for select to authenticated
  using (workspace_id is not null and public.is_workspace_member(workspace_id));

-- Capture only normalized identifiers and hashes. The raw provider object and
-- message content stay in the service-role-only jobs payload and are never
-- copied into this debugging surface.
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
    case when remote_jid is null then null else encode(digest(remote_jid, 'sha256'), 'hex') end,
    message_type,
    direction,
    encode(digest(safe_payload::text, 'sha256'), 'hex')
  )
  on conflict do update set
    delivery_count = public.webhook_events.delivery_count + 1,
    last_seen_at = now(),
    updated_at = now();

  return new;
end;
$$;

revoke all on function private.capture_whatsmiau_job_event() from public, anon, authenticated;
grant execute on function private.capture_whatsmiau_job_event() to service_role;
drop trigger if exists capture_whatsmiau_job_event on public.jobs;
create trigger capture_whatsmiau_job_event
  after insert on public.jobs
  for each row execute function private.capture_whatsmiau_job_event();

-- A stale final attempt must become a dead letter even when no worker comes
-- back to run it. Reclaimed leases get a durable expiry timestamp.
create or replace function private.claim_next_job(worker_id text, lease_seconds integer default 300)
returns setof public.jobs
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  if nullif(btrim(worker_id), '') is null then
    raise exception 'worker_id_required';
  end if;

  update public.jobs
  set status = 'dead',
      locked_at = null,
      locked_by = null,
      lease_expires_at = null,
      dead_at = coalesce(dead_at, now()),
      last_error = coalesce(last_error, 'job_lease_expired'),
      updated_at = now()
  where status = 'running'
    and coalesce(lease_expires_at, locked_at + make_interval(secs => greatest(lease_seconds, 30))) <= now()
    and attempts >= coalesce(max_attempts, 5);

  return query
  with candidate as (
    select id
    from public.jobs
    where (
      (status = 'queued' and available_at <= now())
      or (
        status = 'running'
        and coalesce(lease_expires_at, locked_at + make_interval(secs => greatest(lease_seconds, 30))) <= now()
        and attempts < coalesce(max_attempts, 5)
      )
    )
    order by available_at asc, created_at asc
    for update skip locked
    limit 1
  )
  update public.jobs as jobs
  set status = 'running',
      attempts = jobs.attempts + 1,
      locked_at = now(),
      locked_by = worker_id,
      lease_expires_at = now() + make_interval(secs => greatest(lease_seconds, 30)),
      dead_at = null,
      updated_at = now()
  from candidate
  where jobs.id = candidate.id
  returning jobs.*;
end;
$$;

create or replace function private.complete_job(
  p_job_id uuid,
  p_worker_id text,
  p_completed_at timestamptz default now()
)
returns public.jobs
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  completed public.jobs;
begin
  if p_job_id is null or nullif(btrim(p_worker_id), '') is null then
    raise exception 'job_lease_owner_required';
  end if;
  update public.jobs
  set status = 'completed',
      locked_at = null,
      locked_by = null,
      lease_expires_at = null,
      completed_at = coalesce(p_completed_at, now()),
      updated_at = coalesce(p_completed_at, now())
  where id = p_job_id and status = 'running' and locked_by = p_worker_id
  returning * into completed;
  if not found then
    raise exception 'job_lease_lost' using errcode = '55000';
  end if;
  return completed;
end;
$$;

create or replace function private.fail_job(
  p_job_id uuid,
  p_worker_id text,
  p_error text,
  p_failed_at timestamptz default now()
)
returns public.jobs
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  current_job public.jobs;
  updated_job public.jobs;
  next_status text;
  next_available_at timestamptz;
  backoff_seconds integer;
  failed_at timestamptz := coalesce(p_failed_at, now());
begin
  if p_job_id is null or nullif(btrim(p_worker_id), '') is null then
    raise exception 'job_lease_owner_required';
  end if;
  select * into current_job from public.jobs
  where id = p_job_id and status = 'running' and locked_by = p_worker_id
  for update;
  if not found then
    raise exception 'job_lease_lost' using errcode = '55000';
  end if;
  if current_job.attempts >= coalesce(current_job.max_attempts, 5) then
    next_status := 'dead';
    next_available_at := current_job.available_at;
  else
    next_status := 'queued';
    backoff_seconds := case
      when current_job.attempts <= 1 then 1
      when current_job.attempts = 2 then 2
      when current_job.attempts = 3 then 4
      when current_job.attempts = 4 then 8
      when current_job.attempts = 5 then 16
      when current_job.attempts = 6 then 32
      else 60
    end;
    next_available_at := failed_at + make_interval(secs => backoff_seconds);
  end if;
  update public.jobs
  set status = next_status,
      available_at = next_available_at,
      locked_at = null,
      locked_by = null,
      lease_expires_at = null,
      completed_at = null,
      dead_at = case when next_status = 'dead' then coalesce(dead_at, failed_at) else null end,
      last_error = left(coalesce(nullif(p_error, ''), 'job_failed'), 2000),
      updated_at = failed_at
  where id = p_job_id and status = 'running' and locked_by = p_worker_id
  returning * into updated_job;
  if not found then
    raise exception 'job_lease_lost' using errcode = '55000';
  end if;
  return updated_job;
end;
$$;

revoke all on function private.claim_next_job(text, integer) from public, anon, authenticated;
revoke all on function private.complete_job(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function private.fail_job(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function private.claim_next_job(text, integer) to service_role;
grant execute on function private.complete_job(uuid, text, timestamptz) to service_role;
grant execute on function private.fail_job(uuid, text, text, timestamptz) to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ai_drafts'
  ) then
    alter publication supabase_realtime add table public.ai_drafts;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'webhook_events'
  ) then
    alter publication supabase_realtime add table public.webhook_events;
  end if;
end
$$;
