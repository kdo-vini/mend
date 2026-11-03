-- Agent keys: machine credentials for external AI agents (agentes.chat bots
-- such as Maria or Rafa) that call Mend through its MCP server. Each key
-- carries the scopes an admin granted; the server only exposes the tools
-- those scopes allow. Only the SHA-256 hash is stored; the plain key is shown
-- once at creation.
create table public.agent_api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  label text not null check(length(trim(label)) between 1 and 120),
  token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] not null check(cardinality(scopes) between 1 and 32),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index agent_api_keys_workspace on public.agent_api_keys(workspace_id, created_at desc);
alter table public.agent_api_keys enable row level security;
revoke all on public.agent_api_keys from public, anon, authenticated;
grant select(id, workspace_id, label, scopes, created_by, created_at, last_used_at, revoked_at)
  on public.agent_api_keys to authenticated;
grant insert(workspace_id, label, token_hash, scopes, created_by)
  on public.agent_api_keys to authenticated;
grant update(revoked_at) on public.agent_api_keys to authenticated;
grant select, update(last_used_at) on public.agent_api_keys to service_role;
create policy agent_api_keys_read on public.agent_api_keys for select to authenticated
  using(private.workspace_member_role(workspace_id) in ('owner','admin'));
create policy agent_api_keys_insert on public.agent_api_keys for insert to authenticated
  with check(
    created_by = (select auth.uid())
    and private.workspace_member_role(workspace_id) in ('owner','admin')
  );
create policy agent_api_keys_revoke on public.agent_api_keys for update to authenticated
  using(private.workspace_member_role(workspace_id) in ('owner','admin') and revoked_at is null)
  with check(private.workspace_member_role(workspace_id) in ('owner','admin') and revoked_at is not null);
