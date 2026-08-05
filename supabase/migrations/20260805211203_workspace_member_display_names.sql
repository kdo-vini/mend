alter table public.workspace_members
  add column if not exists display_name text;

update public.workspace_members as wm
set display_name = coalesce(
  nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
  nullif(split_part(u.email, '@', 1), '')
)
from auth.users as u
where u.id = wm.user_id
  and wm.display_name is null;

create or replace function public.update_my_workspace_member_display_name(
  p_workspace_id uuid,
  p_display_name text
)
returns public.workspace_members
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  member public.workspace_members;
  normalized_name text := nullif(btrim(p_display_name), '');
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if normalized_name is null or length(normalized_name) > 120 then
    raise exception 'invalid_display_name';
  end if;
  update public.workspace_members
  set display_name = normalized_name
  where workspace_id = p_workspace_id
    and user_id = auth.uid()
  returning * into member;
  if member.id is null then
    raise exception 'workspace_member_not_found';
  end if;
  return member;
end;
$$;

revoke all on function public.update_my_workspace_member_display_name(uuid, text)
  from public, anon;
grant execute on function public.update_my_workspace_member_display_name(uuid, text)
  to authenticated;
