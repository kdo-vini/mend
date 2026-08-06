-- Membership creation is invitation-only. Keep the old RPC name available so
-- deployed clients fail with a useful, explicit error instead of inserting a
-- user directly into a workspace.
create or replace function private.add_workspace_member(
  p_workspace_id uuid,
  p_user_id uuid,
  p_role text default 'agent'
)
returns public.workspace_members
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  raise exception 'workspace_invitation_required' using errcode = '42501';
end;
$$;

revoke all on function private.add_workspace_member(uuid, uuid, text)
  from public, anon;
grant execute on function private.add_workspace_member(uuid, uuid, text)
  to authenticated, service_role;
