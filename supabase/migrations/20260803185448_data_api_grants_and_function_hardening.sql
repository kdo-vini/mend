-- Keep the public Data API closed to anonymous callers and explicitly expose
-- only the authenticated workspace surface protected by the RLS policies.
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter function public.is_workspace_member(uuid)
  set search_path = pg_catalog, public;
alter function public.claim_issue_number(uuid)
  set search_path = pg_catalog, public;

create or replace function public.claim_issue_number(target_workspace_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  next_number integer;
  prefix text;
begin
  if not public.is_workspace_member(target_workspace_id) then
    raise exception 'workspace_access_denied';
  end if;

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

revoke execute on function public.is_workspace_member(uuid) from public;
revoke execute on function public.claim_issue_number(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.claim_issue_number(uuid) to authenticated;

create policy "workspace members can access private media"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'private-media'
    and case
      when name ~ '^[0-9a-fA-F-]{36}/' then
        public.is_workspace_member((split_part(name, '/', 1))::uuid)
      else false
    end
  )
  with check (
    bucket_id = 'private-media'
    and case
      when name ~ '^[0-9a-fA-F-]{36}/' then
        public.is_workspace_member((split_part(name, '/', 1))::uuid)
      else false
    end
  );
