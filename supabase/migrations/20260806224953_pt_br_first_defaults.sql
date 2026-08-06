-- PT-BR becomes Mend's product and operational default. This is intentionally
-- a one-time override; later user and workspace choices remain persistent.
alter table public.workspaces
  alter column default_language set default 'pt-BR';

update public.workspaces
set default_language = 'pt-BR'
where default_language is distinct from 'pt-BR';

alter table public.user_preferences
  alter column interface_language set default 'pt-BR';

insert into public.user_preferences (user_id, interface_language)
select id, 'pt-BR'
from auth.users
on conflict (user_id) do update
set interface_language = 'pt-BR',
    updated_at = now();

create or replace function private.create_workspace(
  p_name text,
  p_slug text,
  p_issue_prefix text default 'MEND',
  p_timezone text default 'America/Sao_Paulo',
  p_default_language text default 'pt-BR'
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
    when lower(btrim(coalesce(p_default_language, 'pt-BR'))) in ('en', 'en-us') then 'en-US'
    when lower(btrim(coalesce(p_default_language, 'pt-BR'))) in ('pt', 'pt-br') then 'pt-BR'
    else 'pt-BR'
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
  p_default_language text default 'pt-BR'
)
returns public.workspaces
language sql
volatile
security invoker
set search_path = pg_catalog, public, private
as $$ select private.create_workspace($1, $2, $3, $4, $5); $$;
