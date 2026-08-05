-- Google account metadata and calendar selections are workspace-scoped. OAuth
-- tokens live in a private table so authenticated browser clients cannot select
-- encrypted secrets through the public Data API.
create table public.google_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null default 'google' check (provider = 'google'),
  google_account_id text not null,
  account_email text,
  account_name text,
  status text not null default 'connected' check (status in ('connected', 'error', 'disconnected')),
  scopes_json jsonb not null default '[]'::jsonb,
  calendars_json jsonb not null default '[]'::jsonb,
  selected_calendar_ids_json jsonb not null default '[]'::jsonb,
  last_error text,
  last_synced_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, google_account_id)
);

create table public.google_connection_secrets (
  connection_id uuid primary key references public.google_connections(id) on delete cascade,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.google_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.google_connections enable row level security;
alter table public.google_connection_secrets enable row level security;
alter table public.google_oauth_states enable row level security;

create policy "workspace members can read Google connections"
  on public.google_connections
  for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy "workspace managers can write Google connections"
  on public.google_connections
  for all to authenticated
  using (public.workspace_can(workspace_id, array['owner', 'admin']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin']));
grant select, insert, update, delete on public.google_connections to authenticated;

-- Token and OAuth-state rows are backend-only. service_role bypasses RLS;
-- authenticated and anon receive no table privileges.
revoke all on public.google_connection_secrets from anon, authenticated;
revoke all on public.google_oauth_states from anon, authenticated;
grant all on public.google_connection_secrets to service_role;
grant all on public.google_oauth_states to service_role;

create index google_connections_workspace_id_idx
  on public.google_connections (workspace_id, updated_at desc);

alter table public.workspaces
  alter column ai_policy_json set default '{
    "allowed_channels": ["whatsapp", "web"],
    "allowed_integrations": ["knowledge", "codex"],
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
    "notify_on_human_escalation": true,
    "notify_on_bug": true,
    "bug_auto_reply_enabled": false,
    "bug_auto_fix_enabled": false,
    "bug_auto_deploy_enabled": false
  }'::jsonb;

update public.workspaces
set ai_policy_json = coalesce(ai_policy_json, '{}'::jsonb) || jsonb_build_object(
  'allowed_channels', coalesce(ai_policy_json -> 'allowed_channels', '["whatsapp", "web"]'::jsonb),
  'allowed_integrations', coalesce(ai_policy_json -> 'allowed_integrations', '["knowledge", "codex"]'::jsonb),
  'allowed_actions', coalesce(ai_policy_json -> 'allowed_actions', '["respond", "triage", "create_issue", "investigate", "propose_fix"]'::jsonb),
  'human_approval_actions', coalesce(ai_policy_json -> 'human_approval_actions', '["implement_fix", "publish", "deploy", "delete"]'::jsonb)
)
where ai_policy_json is not null;
