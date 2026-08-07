-- Agent runtime v1: GitHub is the source of truth and Dokploy owns execution.
-- This migration intentionally removes the old public vocabulary and local
-- checkout configuration. There are no compatibility aliases.

alter table public.coding_runs rename to agent_runs;
alter table public.coding_run_events rename to agent_run_events;
alter table public.agent_run_events rename column coding_run_id to agent_run_id;

alter table public.bug_cases rename column investigation_run_id to investigation_agent_run_id;
alter table public.bug_cases rename column fix_run_id to fix_agent_run_id;

alter table public.repositories drop column local_path;

alter table public.repositories
  drop constraint if exists repositories_agent_provider_check,
  drop constraint if exists repositories_execution_plane_check;

update public.repositories
set agent_provider = case agent_provider
  when 'codex' then 'openai'
  when 'claude' then 'anthropic'
  when 'gemini' then 'google'
  else agent_provider
end,
execution_plane = case execution_plane
  when 'local_cli' then 'dokploy'
  else execution_plane
end;

alter table public.repositories
  alter column agent_provider set default 'openai',
  alter column execution_plane set default 'dokploy',
  drop constraint if exists repositories_agent_provider_check,
  add constraint repositories_agent_provider_check
    check (agent_provider in ('openai', 'anthropic', 'google', 'verboo')),
  drop constraint if exists repositories_execution_plane_check,
  add constraint repositories_execution_plane_check
    check (execution_plane in ('dokploy', 'github_actions'));

alter table public.bug_cases
  drop constraint if exists bug_cases_investigation_run_id_fkey,
  drop constraint if exists bug_cases_fix_run_id_fkey,
  add constraint bug_cases_investigation_agent_run_id_fkey
    foreign key (investigation_agent_run_id) references public.agent_runs(id) on delete set null,
  add constraint bug_cases_fix_agent_run_id_fkey
    foreign key (fix_agent_run_id) references public.agent_runs(id) on delete set null;

alter table public.agent_run_events
  drop constraint if exists coding_run_events_coding_run_id_fkey,
  add constraint agent_run_events_agent_run_id_fkey
    foreign key (agent_run_id) references public.agent_runs(id) on delete cascade;

alter table public.agent_runs
  drop constraint if exists coding_runs_agent_provider_check;

alter index if exists coding_runs_active_issue_mode_idx
  rename to agent_runs_active_issue_mode_idx;

alter table public.workspaces
  alter column ai_policy_json set default '{"allowedIntegrations":["knowledge","agent","mcp"]}'::jsonb;
update public.workspaces
set ai_policy_json = replace(ai_policy_json::text, '"codex"', '"agent"')::jsonb
where ai_policy_json::text like '%"codex"%';

drop policy if exists "members can access coding runs" on public.agent_runs;
drop policy if exists "members can access coding events" on public.agent_run_events;
create policy "members can access agent runs" on public.agent_runs
  for all to authenticated using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy "members can access agent events" on public.agent_run_events
  for all to authenticated using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- Credentials are service-role only. The browser receives provider/task
-- metadata but never the encrypted payload or decrypted key.
create table public.workspace_agent_credentials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task text not null check (task in ('support', 'agent')),
  provider text not null check (provider in ('openai', 'anthropic', 'google', 'verboo')),
  encrypted_api_key text not null,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, task, provider)
);
alter table public.workspace_agent_credentials enable row level security;
revoke all on public.workspace_agent_credentials from anon, authenticated;
grant all on public.workspace_agent_credentials to service_role;
create index workspace_agent_credentials_workspace_idx
  on public.workspace_agent_credentials (workspace_id, task);

-- Keep the durable loop function aligned with the renamed run references.
drop function if exists public.advance_bug_case(
  uuid, uuid, text, text, text, text, jsonb, text, text, text, uuid, uuid,
  text, integer, text, text, text, text, text
);

create or replace function public.advance_bug_case(
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
  p_investigation_agent_run_id uuid default null,
  p_fix_agent_run_id uuid default null,
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
  current_case public.bug_cases;
  inserted_event_id uuid;
  stage_order constant text[] := array[
    'signal', 'suspicion', 'evidence', 'investigation', 'verdict',
    'decision', 'fix', 'verification', 'approval', 'pull_request', 'merge',
    'deploy', 'health_check', 'customer_response', 'completed', 'failed'
  ];
  current_position integer;
  next_position integer;
begin
  if p_stage <> all(stage_order) then
    raise exception 'bug_case_invalid_stage';
  end if;

  select * into current_case
  from public.bug_cases
  where id = p_bug_case_id and workspace_id = p_workspace_id
  for update;
  if current_case.id is null then
    raise exception 'bug_case_not_found';
  end if;

  if exists (
    select 1 from public.bug_case_events
    where bug_case_id = p_bug_case_id and idempotency_key = left(p_idempotency_key, 300)
  ) then
    return current_case;
  end if;

  current_position := array_position(stage_order, current_case.stage);
  next_position := array_position(stage_order, p_stage);
  if current_case.stage = 'completed' then
    raise exception 'bug_case_terminal';
  elsif p_stage = 'failed' then
    null;
  elsif p_stage = 'completed' then
    if current_case.stage <> 'customer_response' then
      raise exception 'bug_case_invalid_transition:%->%', current_case.stage, p_stage;
    end if;
  elsif p_stage = 'customer_response' and current_case.stage = 'decision' then
    if coalesce(p_decision, current_case.decision) not in ('notify', 'dismiss') then
      raise exception 'bug_case_invalid_transition:%->%', current_case.stage, p_stage;
    end if;
  elsif current_case.stage = 'failed' and p_stage in ('investigation', 'fix') then
    null;
  elsif p_stage = 'deploy' and current_case.stage = 'pull_request' then
    null;
  elsif p_stage <> current_case.stage and next_position <> current_position + 1 then
    raise exception 'bug_case_invalid_transition:%->%', current_case.stage, p_stage;
  end if;

  insert into public.bug_case_events (
    workspace_id, bug_case_id, stage, event_type, message, metadata_json, idempotency_key
  ) values (
    p_workspace_id, p_bug_case_id, p_stage, left(p_event_type, 120),
    left(p_message, 2000), coalesce(p_metadata, '{}'::jsonb), left(p_idempotency_key, 300)
  ) on conflict (bug_case_id, idempotency_key) do nothing
  returning id into inserted_event_id;

  if inserted_event_id is null then
    return current_case;
  end if;

  update public.bug_cases
  set stage = p_stage,
      status = coalesce(p_status, status),
      verdict = coalesce(p_verdict, verdict),
      decision = coalesce(p_decision, decision),
      investigation_agent_run_id = coalesce(p_investigation_agent_run_id, investigation_agent_run_id),
      fix_agent_run_id = coalesce(p_fix_agent_run_id, fix_agent_run_id),
      pr_url = coalesce(nullif(p_pr_url, ''), pr_url),
      pr_number = coalesce(p_pr_number, pr_number),
      merge_sha = coalesce(nullif(p_merge_sha, ''), merge_sha),
      deployment_url = coalesce(nullif(p_deployment_url, ''), deployment_url),
      health_status = coalesce(p_health_status, health_status),
      customer_response_status = coalesce(p_customer_response_status, customer_response_status),
      last_error = case
        when current_case.stage = 'failed' and p_stage in ('investigation', 'fix') then null
        else coalesce(nullif(left(p_last_error, 2000), ''), last_error)
      end,
      completed_at = case when coalesce(p_status, status) = 'completed' then coalesce(completed_at, now()) else completed_at end,
      updated_at = now()
  where id = p_bug_case_id and workspace_id = p_workspace_id
  returning * into current_case;

  return current_case;
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

do $$
declare
  table_name text;
begin
  foreach table_name in array array['agent_runs', 'agent_run_events'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end
$$;
