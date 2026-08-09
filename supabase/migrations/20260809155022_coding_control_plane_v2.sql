-- Coding Control Plane V2. The schema is additive so the legacy agent loop can
-- be disabled by feature flag without destructive rollback.

alter table public.agent_runs
  add column if not exists stage text,
  add column if not exists parent_run_id uuid,
  add column if not exists research_artifact_id uuid,
  add column if not exists requested_config_json jsonb not null default '{}'::jsonb,
  add column if not exists effective_config_json jsonb not null default '{}'::jsonb,
  add column if not exists connection_id uuid,
  add column if not exists provider text,
  add column if not exists requested_model text,
  add column if not exists real_model text not null default 'unknown_legacy',
  add column if not exists effort text,
  add column if not exists billing_method text,
  add column if not exists usage_json jsonb not null default '{}'::jsonb,
  add column if not exists cache_json jsonb not null default '{}'::jsonb,
  add column if not exists cost_amount_usd numeric,
  add column if not exists cost_status text,
  add column if not exists duration_ms integer,
  add column if not exists quota_json jsonb not null default '{}'::jsonb;

update public.agent_runs
set stage = case mode
  when 'implement_fix' then 'implement'
  when 'propose_fix' then 'research'
  else 'research'
end
where stage is null;

alter table public.agent_runs
  alter column stage set default 'research',
  alter column stage set not null;

alter table public.agent_runs
  drop constraint if exists agent_runs_stage_check,
  add constraint agent_runs_stage_check
    check (stage in ('research', 'implement', 'review', 'verify')),
  drop constraint if exists agent_runs_billing_method_check,
  add constraint agent_runs_billing_method_check
    check (billing_method is null or billing_method in ('api_key', 'subscription', 'included_in_subscription')),
  drop constraint if exists agent_runs_cost_status_check,
  add constraint agent_runs_cost_status_check
    check (cost_status is null or cost_status in ('reported', 'calculated', 'included_in_subscription', 'unknown')),
  add constraint agent_runs_parent_run_id_fkey
    foreign key (parent_run_id) references public.agent_runs(id) on delete set null;

create table public.agent_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete set null,
  label text not null check (char_length(btrim(label)) between 1 and 160),
  purpose text not null default 'coding' check (purpose in ('coding', 'support')),
  provider text not null check (provider in ('openai', 'anthropic', 'google', 'verboo')),
  auth_method text not null check (auth_method in ('api_key', 'subscription')),
  status text not null default 'pending' check (status in ('pending', 'connected', 'expired', 'revoked', 'error')),
  automation_consent boolean not null default false,
  consent_updated_at timestamptz,
  cli_version text,
  catalog_json jsonb,
  catalog_source text check (catalog_source is null or catalog_source in ('cli', 'api', 'runner')),
  catalog_expires_at timestamptz,
  last_validated_at timestamptz,
  quota_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agent_connection_secrets (
  connection_id uuid primary key references public.agent_connections(id) on delete cascade,
  encrypted_bundle text not null,
  updated_at timestamptz not null default now()
);

create table public.agent_connection_auth_jobs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references public.agent_connections(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('openai', 'anthropic', 'google', 'verboo')),
  auth_method text not null check (auth_method = 'subscription'),
  status text not null default 'pending' check (status in ('pending', 'awaiting_user', 'completed', 'failed', 'canceled', 'expired')),
  url text,
  code text,
  expires_at timestamptz not null,
  error_code text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agent_routing_policies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  repository_id uuid references public.repositories(id) on delete cascade,
  stage text not null check (stage in ('research', 'implement', 'review', 'verify')),
  connection_id uuid references public.agent_connections(id) on delete set null,
  model text,
  effort text,
  budget_json jsonb not null default '{}'::jsonb,
  fallback_enabled boolean not null default false,
  fallback_connection_ids_json jsonb not null default '[]'::jsonb check (jsonb_typeof(fallback_connection_ids_json) = 'array'),
  preset text not null default 'Custom' check (preset in ('Economy', 'Balanced', 'Quality', 'Custom')),
  snapshot_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agent_research_artifacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  case_id uuid not null references public.bug_cases(id) on delete cascade,
  issue_id uuid not null references public.issues(id) on delete cascade,
  ticket_revision text not null,
  base_sha text not null,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'current' check (status in ('current', 'stale')),
  artifact_json jsonb not null check (jsonb_typeof(artifact_json) = 'object'),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, case_id, ticket_revision, base_sha),
  unique (workspace_id, content_hash)
);

create table public.agent_run_attempts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  stage text not null check (stage in ('research', 'implement', 'review', 'verify')),
  connection_id uuid references public.agent_connections(id) on delete set null,
  provider text,
  requested_model text,
  real_model text,
  effort text,
  auth_method text check (auth_method is null or auth_method in ('api_key', 'subscription')),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'canceled')),
  input_tokens integer,
  output_tokens integer,
  cached_input_tokens integer,
  total_tokens integer,
  cache_json jsonb not null default '{}'::jsonb,
  quota_json jsonb not null default '{}'::jsonb,
  cost_amount_usd numeric,
  cost_status text check (cost_status is null or cost_status in ('reported', 'calculated', 'included_in_subscription', 'unknown')),
  duration_ms integer,
  error_category text,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, attempt_number)
);

alter table public.agent_runs
  add constraint agent_runs_connection_id_fkey
    foreign key (connection_id) references public.agent_connections(id) on delete set null,
  add constraint agent_runs_research_artifact_id_fkey
    foreign key (research_artifact_id) references public.agent_research_artifacts(id) on delete set null;

create unique index agent_routing_policies_scope_stage_idx
  on public.agent_routing_policies (workspace_id, coalesce(repository_id, '00000000-0000-0000-0000-000000000000'::uuid), stage);
create index agent_connections_workspace_idx
  on public.agent_connections (workspace_id, updated_at desc);
create index agent_connections_owner_idx
  on public.agent_connections (owner_user_id, updated_at desc);
create index agent_connection_auth_jobs_pending_idx
  on public.agent_connection_auth_jobs (user_id, status, expires_at);
create index agent_routing_policies_workspace_idx
  on public.agent_routing_policies (workspace_id, repository_id, stage);
create index agent_research_artifacts_lookup_idx
  on public.agent_research_artifacts (workspace_id, case_id, ticket_revision, base_sha);
create index agent_run_attempts_run_idx
  on public.agent_run_attempts (workspace_id, run_id, attempt_number);

alter table public.agent_connections enable row level security;
alter table public.agent_connection_secrets enable row level security;
alter table public.agent_connection_auth_jobs enable row level security;
alter table public.agent_routing_policies enable row level security;
alter table public.agent_research_artifacts enable row level security;
alter table public.agent_run_attempts enable row level security;

create policy "members can read coding connection metadata"
  on public.agent_connections for select to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and (owner_user_id = (select auth.uid()) or public.workspace_can(workspace_id, array['owner', 'admin']))
  );
create policy "members can create their own coding connections"
  on public.agent_connections for insert to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and (owner_user_id = (select auth.uid()) or public.workspace_can(workspace_id, array['owner', 'admin']))
  );
create policy "owners and admins can update coding connections"
  on public.agent_connections for update to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and (owner_user_id = (select auth.uid()) or public.workspace_can(workspace_id, array['owner', 'admin']))
  )
  with check (
    public.is_workspace_member(workspace_id)
    and (owner_user_id = (select auth.uid()) or public.workspace_can(workspace_id, array['owner', 'admin']))
  );
create policy "owners and admins can delete coding connections"
  on public.agent_connections for delete to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and (owner_user_id = (select auth.uid()) or public.workspace_can(workspace_id, array['owner', 'admin']))
  );

create policy "members can read coding routing policies"
  on public.agent_routing_policies for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy "workspace managers can write coding routing policies"
  on public.agent_routing_policies for all to authenticated
  using (public.workspace_can(workspace_id, array['owner', 'admin']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin']));

create policy "members can read research artifacts"
  on public.agent_research_artifacts for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy "members can read run attempts"
  on public.agent_run_attempts for select to authenticated
  using (public.is_workspace_member(workspace_id));

revoke all on public.agent_connection_secrets from public, anon, authenticated;
revoke all on public.agent_connection_auth_jobs from public, anon, authenticated;
revoke all on public.agent_run_attempts from public, anon, authenticated;
grant all on public.agent_connection_secrets to service_role;
grant all on public.agent_connection_auth_jobs to service_role;
grant all on public.agent_run_attempts to service_role;
grant select, insert, update, delete on public.agent_connections to authenticated;
grant select, insert, update, delete on public.agent_routing_policies to authenticated;
grant select on public.agent_research_artifacts to authenticated;
grant select on public.agent_run_attempts to authenticated;

-- Import the existing workspace-scoped API keys into owner-labelled
-- connections. The encrypted payload is copied without decrypting it.
insert into public.agent_connections (
  workspace_id, owner_user_id, label, purpose, provider, auth_method,
  status, metadata_json, created_at, updated_at
)
select
  legacy.workspace_id,
  (
    select wm.user_id
    from public.workspace_members wm
    where wm.workspace_id = legacy.workspace_id and wm.role = 'owner'
    order by wm.created_at asc
    limit 1
  ),
  initcap(legacy.task) || ' legacy API key',
  case when legacy.task = 'support' then 'support' else 'coding' end,
  legacy.provider,
  'api_key',
  'connected',
  jsonb_build_object('legacyCredential', true, 'legacyTask', legacy.task),
  legacy.created_at,
  legacy.updated_at
from public.workspace_agent_credentials legacy;

insert into public.agent_connection_secrets (connection_id, encrypted_bundle, updated_at)
select connection.id, legacy.encrypted_api_key, legacy.updated_at
from public.workspace_agent_credentials legacy
join public.agent_connections connection
  on connection.workspace_id = legacy.workspace_id
 and connection.provider = legacy.provider
 and connection.auth_method = 'api_key'
 and connection.label = initcap(legacy.task) || ' legacy API key'
on conflict (connection_id) do nothing;

update public.workspaces
set ai_policy_json = coalesce(ai_policy_json, '{}'::jsonb) || jsonb_build_object(
  'coding_routing_v2', coalesce(ai_policy_json -> 'coding_routing_v2', 'false'::jsonb),
  'coding_subscription_auth', coalesce(ai_policy_json -> 'coding_subscription_auth', 'false'::jsonb)
)
where ai_policy_json is not null;

-- New tables live in public but remain explicitly granted; this is separate
-- from RLS and protects projects that disabled automatic Data API exposure.
revoke all on public.agent_connections from anon;
revoke all on public.agent_routing_policies from anon;
revoke all on public.agent_research_artifacts from anon;
