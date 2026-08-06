-- Locale support is intentionally additive. Keep the legacy `en` workspace
-- value valid while old clients are still in circulation; application code
-- normalizes it to `en-US` on read and only writes canonical values.
update public.workspaces
set default_language = case
  when lower(btrim(default_language)) in ('en', 'en-us') then 'en-US'
  when lower(btrim(default_language)) in ('pt', 'pt-br') then 'pt-BR'
  else 'en-US'
end;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.workspaces'::regclass
      and conname = 'workspaces_default_language_check'
  ) then
    alter table public.workspaces
      add constraint workspaces_default_language_check
      check (default_language in ('en', 'en-US', 'pt-BR'));
  end if;
end
$$;

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  interface_language text not null default 'en-US'
    check (interface_language in ('en-US', 'pt-BR')),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

drop policy if exists "users can read own preferences" on public.user_preferences;
create policy "users can read own preferences"
  on public.user_preferences for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "users can create own preferences" on public.user_preferences;
create policy "users can create own preferences"
  on public.user_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "users can update own preferences" on public.user_preferences;
create policy "users can update own preferences"
  on public.user_preferences for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update on public.user_preferences to authenticated;
grant select, insert, update on public.user_preferences to service_role;

-- Existing users inherit the first workspace's operational language exactly
-- once. New accounts without a workspace are initialized by the client from
-- the explicit pre-auth choice or the en-US fallback.
insert into public.user_preferences (user_id, interface_language)
select distinct on (wm.user_id)
  wm.user_id,
  case
    when w.default_language = 'pt-BR' then 'pt-BR'
    else 'en-US'
  end
from public.workspace_members wm
join public.workspaces w on w.id = wm.workspace_id
order by wm.user_id, wm.created_at asc
on conflict (user_id) do nothing;

-- The Data API no longer exposes newly-created public tables by default.
grant usage on schema public to authenticated, service_role;

create or replace function private.create_workspace(
  p_name text,
  p_slug text,
  p_issue_prefix text default 'MEND',
  p_timezone text default 'America/Sao_Paulo',
  p_default_language text default 'en-US'
)
returns public.workspaces
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  actor uuid := (select auth.uid());
  workspace public.workspaces;
  normalized_name text := btrim(p_name);
  normalized_slug text := lower(btrim(p_slug));
  normalized_prefix text := upper(btrim(coalesce(nullif(p_issue_prefix, ''), 'MEND')));
  normalized_language text := case
    when lower(btrim(coalesce(p_default_language, 'en-US'))) in ('pt', 'pt-br') then 'pt-BR'
    else 'en-US'
  end;
begin
  if actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if normalized_name is null or length(normalized_name) not between 1 and 120 then
    raise exception 'invalid_workspace_name';
  end if;
  if normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(normalized_slug) > 64 then
    raise exception 'invalid_workspace_slug';
  end if;
  if normalized_prefix !~ '^[A-Z][A-Z0-9]{1,7}$' then
    raise exception 'invalid_issue_prefix';
  end if;

  insert into public.workspaces (name, slug, issue_prefix, timezone, default_language)
  values (
    normalized_name,
    normalized_slug,
    normalized_prefix,
    coalesce(nullif(btrim(p_timezone), ''), 'America/Sao_Paulo'),
    normalized_language
  )
  returning * into workspace;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (workspace.id, actor, 'owner');

  return workspace;
exception
  when unique_violation then
    raise exception 'workspace_slug_taken' using errcode = '23505';
end;
$$;

create or replace function public.create_workspace(
  p_name text,
  p_slug text,
  p_issue_prefix text default 'MEND',
  p_timezone text default 'America/Sao_Paulo',
  p_default_language text default 'en-US'
)
returns public.workspaces
language sql
volatile
security invoker
set search_path = pg_catalog, public, private
as $$ select private.create_workspace($1, $2, $3, $4, $5); $$;
