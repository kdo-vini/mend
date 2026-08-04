-- The API authenticates and resolves workspace membership before calling this
-- backend-only allocator. Its previous body still called an authenticated-only
-- membership helper, making the service_role-only RPC impossible to execute.
create or replace function public.claim_issue_number(target_workspace_id uuid)
returns text
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  next_number integer;
  prefix text;
begin
  update public.workspaces
  set next_issue_number = next_issue_number + 1,
      updated_at = now()
  where id = target_workspace_id
  returning next_issue_number - 1, issue_prefix
  into next_number, prefix;

  if next_number is null then
    raise exception 'workspace_not_found';
  end if;

  return prefix || '-' || next_number;
end;
$$;

revoke execute on function public.claim_issue_number(uuid) from public, anon, authenticated;
grant execute on function public.claim_issue_number(uuid) to service_role;
