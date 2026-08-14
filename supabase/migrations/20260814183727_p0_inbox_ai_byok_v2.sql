-- P0 Inbox AI is deliberately isolated from the coding subscription plane.
-- Secrets remain in agent_connection_secrets; this column contains model IDs only.
alter table public.agent_connections
  add column if not exists support_config_json jsonb not null default '{}'::jsonb;

alter table public.agent_connections
  drop constraint if exists agent_connections_support_config_json_check,
  add constraint agent_connections_support_config_json_check
    check (jsonb_typeof(support_config_json) = 'object');

-- Existing legacy/imported Support rows that cannot satisfy BYOK are no longer
-- eligible for runtime resolution. The owner must configure Support again.
update public.agent_connections
set
  status = 'revoked',
  automation_consent = false,
  metadata_json = coalesce(metadata_json, '{}'::jsonb) ||
    jsonb_build_object('p0InvalidatedAt', now(), 'p0InvalidatedReason', 'support_requires_openai_api_key'),
  updated_at = now()
where purpose = 'support'
  and (provider <> 'openai' or auth_method <> 'api_key')
  and status <> 'revoked';

alter table public.agent_connections
  drop constraint if exists agent_connections_support_auth_check,
  add constraint agent_connections_support_auth_check
    check (
      purpose <> 'support'
      or (provider = 'openai' and auth_method = 'api_key')
    );

create unique index if not exists agent_connections_one_active_support_idx
  on public.agent_connections (workspace_id)
  where purpose = 'support' and status = 'connected';

-- Runtime no longer reads or writes the pre-V2 credential store. This is the
-- intentional destructive step after the V2-only code has been deployed and
-- old workers have been drained.
drop table if exists public.workspace_agent_credentials;
