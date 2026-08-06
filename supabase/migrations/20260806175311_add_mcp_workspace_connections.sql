-- Workspace-scoped remote MCP connections. Public rows contain only metadata;
-- credentials, OAuth state and write idempotency records stay backend-only.
create table public.mcp_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text not null default '',
  server_url text not null check (char_length(server_url) between 1 and 2_000),
  auth_mode text not null default 'none' check (auth_mode in ('none', 'headers', 'oauth')),
  status text not null default 'pending' check (status in ('pending', 'connected', 'error', 'disconnected')),
  tools_json jsonb not null default '[]'::jsonb,
  allowed_tool_names_json jsonb not null default '[]'::jsonb,
  write_modes_json jsonb not null default '[]'::jsonb,
  oauth_metadata_json jsonb not null default '{}'::jsonb,
  last_error text,
  last_tested_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table public.mcp_connection_secrets (
  connection_id uuid primary key references public.mcp_connections(id) on delete cascade,
  headers_encrypted text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  client_id_encrypted text,
  client_secret_encrypted text,
  token_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.mcp_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  connection_id uuid not null references public.mcp_connections(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  verifier_encrypted text not null,
  issuer text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.mcp_tool_executions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid not null references public.mcp_connections(id) on delete cascade,
  source_message_id uuid not null references public.messages(id) on delete cascade,
  idempotency_key text not null,
  tool_name text not null,
  arguments_hmac text not null,
  mode text not null check (mode in ('draft', 'safe_auto')),
  status text not null default 'approval_pending' check (status in ('approval_pending', 'approved', 'completed', 'uncertain', 'failed')),
  openai_response_id text,
  approval_request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key, connection_id, tool_name, arguments_hmac)
);

alter table public.mcp_connections enable row level security;
alter table public.mcp_connection_secrets enable row level security;
alter table public.mcp_oauth_states enable row level security;
alter table public.mcp_tool_executions enable row level security;

create policy "workspace members can read MCP connections"
  on public.mcp_connections for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy "workspace managers can insert MCP connections"
  on public.mcp_connections for insert to authenticated
  with check (public.workspace_can(workspace_id, array['owner', 'admin']));
create policy "workspace managers can update MCP connections"
  on public.mcp_connections for update to authenticated
  using (public.workspace_can(workspace_id, array['owner', 'admin']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin']));
create policy "workspace managers can delete MCP connections"
  on public.mcp_connections for delete to authenticated
  using (public.workspace_can(workspace_id, array['owner', 'admin']));
grant select, insert, update, delete on public.mcp_connections to authenticated;

-- Credentials, OAuth state and execution records are never exposed through the
-- browser Data API. The worker uses service_role for these tables.
revoke all on public.mcp_connection_secrets from anon, authenticated;
revoke all on public.mcp_oauth_states from anon, authenticated;
revoke all on public.mcp_tool_executions from anon, authenticated;
grant all on public.mcp_connection_secrets to service_role;
grant all on public.mcp_oauth_states to service_role;
grant all on public.mcp_tool_executions to service_role;

create index mcp_connections_workspace_updated_idx
  on public.mcp_connections (workspace_id, updated_at desc);
create index mcp_oauth_states_expiry_idx
  on public.mcp_oauth_states (expires_at);
create index mcp_tool_executions_source_idx
  on public.mcp_tool_executions (workspace_id, source_message_id);

alter table public.workspaces
  alter column ai_policy_json set default (
    '{
      "allowed_channels": ["whatsapp", "web"],
      "allowed_integrations": ["knowledge", "codex", "mcp"],
      "allowed_actions": ["respond", "triage", "create_issue", "investigate", "propose_fix"],
      "human_approval_actions": ["implement_fix", "publish", "deploy", "delete"],
      "draft_enabled": true,
      "safe_auto_enabled": true,
      "safe_auto_min_confidence": 0.85,
      "safe_auto_intents": ["question", "how_to", "status", "social"],
      "safe_auto_send_enabled": false,
      "require_published_knowledge": true,
      "automation_routes": {},
      "automation_fallback_route": "draft_for_review",
      "mcp_failure_policy": "review",
      "notify_on_human_escalation": true,
      "notify_on_bug": true,
      "bug_auto_reply_enabled": false,
      "bug_auto_fix_enabled": false,
      "bug_auto_deploy_enabled": false
    }'::jsonb
  );

update public.workspaces
set ai_policy_json = coalesce(ai_policy_json, '{}'::jsonb) || jsonb_build_object(
  'allowed_integrations', (
    select jsonb_agg(distinct value)
    from jsonb_array_elements_text(
      coalesce(ai_policy_json -> 'allowed_integrations', '["knowledge", "codex"]'::jsonb) || '["mcp"]'::jsonb
    ) as values(value)
  ),
  'mcp_failure_policy', coalesce(ai_policy_json -> 'mcp_failure_policy', '"review"'::jsonb)
)
where ai_policy_json is not null;
