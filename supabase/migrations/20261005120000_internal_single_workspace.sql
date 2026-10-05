-- Single workspace is a product boundary, not a removal of authorization.
-- Deliberately leave the singleton unconfigured: selecting the existing bridge
-- UUID is an explicit activation step, never an arbitrary migration default.
create table public.internal_workspace (
  singleton boolean primary key default true check (singleton),
  workspace_id uuid not null unique references public.workspaces(id),
  configured_at timestamptz not null default now()
);
alter table public.internal_workspace enable row level security;
revoke all on public.internal_workspace from public, anon, authenticated;
grant select on public.internal_workspace to authenticated;
grant select, insert, update on public.internal_workspace to service_role;

-- The singleton UUID is not a secret. Membership is checked separately before
-- any application data is returned. This avoids recursion in membership RLS.
create policy "authenticated can resolve internal workspace"
  on public.internal_workspace for select to authenticated using (true);

create or replace function private.workspace_member_role(target_workspace_id uuid)
returns text language sql stable security definer
set search_path = pg_catalog, public, private
as $$
  select wm.role
  from public.workspace_members wm
  join public.internal_workspace iw on iw.workspace_id = wm.workspace_id
  where wm.workspace_id = target_workspace_id and wm.user_id = (select auth.uid())
  limit 1;
$$;
revoke all on function private.workspace_member_role(uuid) from public, anon;
grant execute on function private.workspace_member_role(uuid) to authenticated, service_role;

-- Close both exposed and private entry points. No workspace is dropped.
create or replace function public.create_workspace(
  p_name text, p_slug text, p_issue_prefix text default 'MEND',
  p_timezone text default 'America/Sao_Paulo', p_default_language text default 'pt-BR'
)
returns public.workspaces language plpgsql security invoker
set search_path = pg_catalog, public
as $$ begin raise exception 'workspace_creation_disabled' using errcode = '42501'; end; $$;

create or replace function private.create_workspace(
  p_name text, p_slug text, p_issue_prefix text default 'MEND',
  p_timezone text default 'America/Sao_Paulo', p_default_language text default 'pt-BR'
)
returns public.workspaces language plpgsql security invoker
set search_path = pg_catalog, public
as $$ begin raise exception 'workspace_creation_disabled' using errcode = '42501'; end; $$;

revoke all on function public.create_workspace(text,text,text,text,text) from public, anon, authenticated;
revoke all on function private.create_workspace(text,text,text,text,text) from public, anon, authenticated;
revoke insert on public.workspaces from authenticated;

-- Defense in depth for direct writes (including a future privileged adapter).
create function private.reject_workspace_creation() returns trigger
language plpgsql set search_path = pg_catalog
as $$ begin raise exception 'workspace_creation_disabled' using errcode = '42501'; end; $$;
create trigger internal_workspace_no_provisioning before insert on public.workspaces
for each row execute function private.reject_workspace_creation();

-- Invitations cannot turn a legacy workspace into a second active space.
create function private.enforce_internal_workspace_invitation() returns trigger
language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if not exists(select 1 from public.internal_workspace where workspace_id = new.workspace_id)
  then raise exception 'workspace_not_found' using errcode = '42501'; end if;
  return new;
end; $$;
create trigger internal_workspace_invitation_scope before insert or update on public.workspace_invitations
for each row execute function private.enforce_internal_workspace_invitation();
create trigger internal_workspace_membership_scope before insert or update on public.workspace_members
for each row execute function private.enforce_internal_workspace_invitation();

revoke all on function private.reject_workspace_creation() from public, anon, authenticated;
revoke all on function private.enforce_internal_workspace_invitation() from public, anon, authenticated;
