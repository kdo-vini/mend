-- Project keys preserve existing finance.project links; names can change safely.
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  key text not null check(length(trim(key)) between 1 and 200),
  name text not null check(length(trim(name)) between 1 and 200),
  description text not null default '' check(length(description)<=2000),
  status text not null default 'active' check(status in ('active','archived')),
  version integer not null default 1 check(version>0),
  unique(workspace_id,key)
);
alter table public.projects enable row level security;
revoke all on public.projects from public,anon,authenticated;
grant select,insert,update on public.projects to authenticated;
create policy projects_read on public.projects for select to authenticated
  using(private.workspace_member_role(workspace_id) is not null);
create policy projects_insert on public.projects for insert to authenticated
  with check(private.workspace_member_role(workspace_id) in ('owner','admin') or private.finance_allowed(workspace_id));
create policy projects_update on public.projects for update to authenticated
  using(private.workspace_member_role(workspace_id) in ('owner','admin') or private.finance_allowed(workspace_id))
  with check(private.workspace_member_role(workspace_id) in ('owner','admin') or private.finance_allowed(workspace_id));

insert into public.projects(workspace_id,key,name)
select workspace_id,'Zelo','Zelo' from public.internal_workspace;
insert into public.projects(workspace_id,key,name)
select workspace_id,project,project from (
  select workspace_id,project from public.finance_entries where length(trim(project))>0
  union select workspace_id,project from public.finance_templates where length(trim(project))>0
) existing on conflict(workspace_id,key) do nothing;

create function private.project_guard() returns trigger language plpgsql
set search_path=pg_catalog,public,private as $$
begin
  if TG_OP='UPDATE' and (new.id<>old.id or new.workspace_id<>old.workspace_id or new.key<>old.key or new.version<>old.version+1) then
    raise exception 'project_conflict' using errcode='40001';
  end if;
  if TG_OP='INSERT' and new.version<>1 then raise exception 'project_conflict' using errcode='40001'; end if;
  return new;
end $$;
revoke all on function private.project_guard() from public,anon,authenticated;
create trigger project_guard before insert or update on public.projects for each row execute function private.project_guard();

create function public.project_save(p_record jsonb,p_expected_version integer default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,private as $$
declare w uuid; existing public.projects; saved public.projects;
begin
  select workspace_id into w from public.internal_workspace;
  if not coalesce(private.workspace_member_role(w) in ('owner','admin') or private.finance_allowed(w),false) then
    raise exception 'project_forbidden' using errcode='42501';
  end if;
  select * into existing from public.projects where id=(p_record->>'id')::uuid and workspace_id=w for update;
  if p_expected_version is null then
    if existing.id is not null then raise exception 'project_conflict' using errcode='40001'; end if;
    insert into public.projects(id,workspace_id,key,name,description,status)
    values((p_record->>'id')::uuid,w,p_record->>'key',p_record->>'name',p_record->>'description',p_record->>'status') returning * into saved;
  else
    if existing.id is null or existing.version<>p_expected_version or existing.key<>p_record->>'key' then
      raise exception 'project_conflict' using errcode='40001';
    end if;
    update public.projects set name=p_record->>'name',description=p_record->>'description',status=p_record->>'status',version=version+1
    where id=existing.id and workspace_id=w returning * into saved;
  end if;
  return to_jsonb(saved)-'workspace_id';
end $$;
revoke all on function public.project_save(jsonb,integer) from public,anon;
grant execute on function public.project_save(jsonb,integer) to authenticated;

create function public.finance_project_summary(p_period date,p_project text) returns jsonb language plpgsql stable security invoker
set search_path=pg_catalog,public,private as $$
declare w uuid; result jsonb;
begin
  select workspace_id into w from public.internal_workspace;
  if not coalesce(private.finance_allowed(w),false) then raise exception 'finance_forbidden' using errcode='42501'; end if;
  if extract(day from p_period)<>1 then raise exception 'finance_invalid_period' using errcode='22023'; end if;
  select jsonb_build_object(
    'income',coalesce(sum(amount_cents) filter(where kind='income'),0),
    'expenses',coalesce(sum(amount_cents) filter(where kind='expense'),0),
    'estimated_count',count(*) filter(where kind<>'transfer' and estimated),
    'unknown_count',count(*) filter(where kind<>'transfer' and amount_cents is null)
  ) into result from public.finance_entries where workspace_id=w and period=p_period and project=p_project and not cancelled;
  return result || (select jsonb_build_object(
    'received',coalesce(sum(s.amount_cents) filter(where e.kind='income'),0),
    'paid',coalesce(sum(s.amount_cents) filter(where e.kind='expense'),0),
    'reference_pending',count(*) filter(where not exists(select 1 from public.finance_references r where r.workspace_id=w and r.settlement_id=s.id and r.external_id is not null))
  ) from public.finance_settlements s join public.finance_entries e on e.workspace_id=s.workspace_id and e.id=s.entry_id
    where s.workspace_id=w and s.paid_on>=p_period and s.paid_on<(p_period+interval '1 month') and not s.cancelled and not e.cancelled and e.kind<>'transfer' and e.project=p_project)
    || jsonb_build_object('review',(select to_jsonb(r) from public.finance_reviews r where workspace_id=w and period=p_period));
end $$;
revoke all on function public.finance_project_summary(date,text) from public,anon;
grant execute on function public.finance_project_summary(date,text) to authenticated;

create or replace function private.finance_guard() returns trigger language plpgsql
set search_path=pg_catalog,public,private as $$
begin
  if TG_OP='UPDATE' then
    if new.id<>old.id or new.workspace_id<>old.workspace_id or new.version<>old.version+1 then
      raise exception 'finance_conflict' using errcode='40001';
    end if;
  elsif new.version<>1 then
    raise exception 'finance_conflict' using errcode='40001';
  end if;
  if TG_TABLE_NAME='finance_settlements' then
    -- An existing payment can still be cancelled after its parent is cancelled.
    -- No new payment or change to amount/date/source is allowed through this path.
    if TG_OP='UPDATE' then
      if new.cancelled and new.entry_id=old.entry_id and new.paid_on=old.paid_on
        and new.amount_cents=old.amount_cents and new.source=old.source then return new; end if;
    end if;
    if not exists(select 1 from public.finance_entries where workspace_id=new.workspace_id and id=new.entry_id and not cancelled)
    then raise exception 'finance_entry_unavailable' using errcode='23514'; end if;
  end if;
  if TG_TABLE_NAME='finance_references' then
    if new.settlement_id is not null and not exists(select 1 from public.finance_settlements where workspace_id=new.workspace_id and id=new.settlement_id and entry_id=new.entry_id)
    then raise exception 'finance_reference_mismatch' using errcode='23514'; end if;
  end if;
  return new;
end $$;
