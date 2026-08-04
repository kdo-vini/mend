-- Keep the RLS membership lookup outside the exposed public schema.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.workspace_member_role(target_workspace_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select wm.role
  from public.workspace_members as wm
  where wm.workspace_id = target_workspace_id
    and wm.user_id = (select auth.uid())
  limit 1;
$$;

revoke all on function private.workspace_member_role(uuid) from public, anon;
grant execute on function private.workspace_member_role(uuid) to authenticated;

create or replace function public.workspace_member_role(target_workspace_id uuid)
returns text
language sql
stable
security invoker
set search_path = pg_catalog, public, private
as $$
  select private.workspace_member_role(target_workspace_id);
$$;

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public, private
as $$
  select public.workspace_member_role(target_workspace_id) is not null;
$$;

create or replace function public.workspace_can(target_workspace_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public, private
as $$
  select coalesce(public.workspace_member_role(target_workspace_id) = any(allowed_roles), false);
$$;

revoke all on function public.workspace_member_role(uuid) from public, anon;
grant execute on function public.workspace_member_role(uuid) to authenticated;
revoke all on function public.is_workspace_member(uuid) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated;
revoke all on function public.workspace_can(uuid, text[]) from public, anon;
grant execute on function public.workspace_can(uuid, text[]) to authenticated;
