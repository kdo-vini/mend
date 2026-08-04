-- Keep the membership lookup private and expose only the policy-safe wrappers.
create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.workspace_member_role(target_workspace_id) is not null;
$$;

create or replace function public.workspace_can(target_workspace_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(public.workspace_member_role(target_workspace_id) = any(allowed_roles), false);
$$;

revoke all on function public.workspace_member_role(uuid) from public, anon, authenticated;
revoke all on function public.is_workspace_member(uuid) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated;
revoke all on function public.workspace_can(uuid, text[]) from public, anon;
grant execute on function public.workspace_can(uuid, text[]) to authenticated;
