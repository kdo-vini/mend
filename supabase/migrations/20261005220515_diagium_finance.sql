-- No initial amounts or operators: activation is an explicit operator grant.
create table public.finance_access (
  workspace_id uuid not null references public.workspaces(id),
  user_id uuid not null references auth.users(id),
  primary key (workspace_id,user_id),
  foreign key (workspace_id,user_id) references public.workspace_members(workspace_id,user_id) on delete cascade
);
alter table public.finance_access enable row level security;
revoke all on public.finance_access from public,anon,authenticated;
grant select on public.finance_access to authenticated;
grant select,insert,delete on public.finance_access to service_role;
create policy finance_access_self on public.finance_access for select to authenticated using (user_id=(select auth.uid()));

create function private.finance_allowed(w uuid) returns boolean language sql stable security definer
set search_path=pg_catalog,public,private as $$
  select auth.uid() is not null and private.workspace_member_role(w) is not null
    and exists(select 1 from public.finance_access where workspace_id=w and user_id=auth.uid());
$$;
revoke all on function private.finance_allowed(uuid) from public,anon;
grant execute on function private.finance_allowed(uuid) to authenticated;

create table public.finance_templates (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id),
  description text not null check(length(trim(description)) between 1 and 200),
  category text not null check(length(trim(category)) between 1 and 100),
  source text not null check(length(trim(source)) between 1 and 200),
  amount_cents bigint check(amount_cents between 1 and 100000000000),
  estimated boolean not null default true,
  project text not null default '' check(length(project)<=200),
  allocation text not null default '' check(length(allocation)<=500),
  starts_on date not null check(extract(day from starts_on)=1),
  ends_on date check(extract(day from ends_on)=1 and ends_on>=starts_on),
  active boolean not null default true,
  version integer not null default 1,
  unique(workspace_id,id),
  check(source not ilike '%supabase%' or length(trim(project))>0)
);
create table public.finance_entries (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id),
  kind text not null check(kind in ('income','expense','transfer')),
  description text not null check(length(trim(description)) between 1 and 200),
  period date not null check(extract(day from period)=1),
  amount_cents bigint check(amount_cents between 1 and 100000000000),
  category text not null check(length(trim(category)) between 1 and 100),
  source text not null check(length(trim(source)) between 1 and 200),
  estimated boolean not null default false,
  project text not null default '' check(length(project)<=200),
  allocation text not null default '' check(length(allocation)<=500),
  template_id uuid,
  cancelled boolean not null default false,
  reason text not null default '' check(length(reason)<=500 and (not cancelled or length(trim(reason))>0)),
  version integer not null default 1,
  unique(workspace_id,id), unique(workspace_id,template_id,period),
  foreign key(workspace_id,template_id) references public.finance_templates(workspace_id,id),
  check(source not ilike '%supabase%' or length(trim(project))>0)
);
create index finance_entries_month on public.finance_entries(workspace_id,period,id);
create table public.finance_settlements (
  id uuid primary key,
  workspace_id uuid not null,
  entry_id uuid not null,
  paid_on date not null,
  amount_cents bigint not null check(amount_cents between 1 and 100000000000),
  source text not null check(length(trim(source)) between 1 and 200),
  cancelled boolean not null default false,
  reason text not null default '' check(length(reason)<=500 and (not cancelled or length(trim(reason))>0)),
  version integer not null default 1,
  unique(workspace_id,id),
  foreign key(workspace_id,entry_id) references public.finance_entries(workspace_id,id)
);
create index finance_settlements_month on public.finance_settlements(workspace_id,paid_on,id);
create table public.finance_references (
  id uuid primary key,
  workspace_id uuid not null,
  entry_id uuid not null,
  settlement_id uuid,
  source text not null check(length(trim(source)) between 1 and 200),
  external_id text check(length(trim(external_id)) between 1 and 200),
  note text not null default '' check(length(note)<=500),
  version integer not null default 1,
  unique(workspace_id,source,external_id),
  foreign key(workspace_id,entry_id) references public.finance_entries(workspace_id,id),
  foreign key(workspace_id,settlement_id) references public.finance_settlements(workspace_id,id)
);
create table public.finance_reviews (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id),
  period date not null check(extract(day from period)=1),
  sources_complete boolean not null default false,
  expenses_complete boolean not null default false,
  taxes_complete boolean not null default false,
  note text not null default '' check(length(note)<=500),
  version integer not null default 1,
  unique(workspace_id,period)
);
create table public.finance_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id),
  record_id uuid not null,
  entity text not null,
  actor_id uuid not null,
  happened_at timestamptz not null default now(),
  before_record jsonb,
  after_record jsonb not null
);
create index finance_events_record on public.finance_events(workspace_id,record_id,id desc);

-- Fixed relation list; all CRUD and summaries use caller RLS.
do $$ declare relation text; begin
  foreach relation in array array['finance_templates','finance_entries','finance_settlements','finance_references','finance_reviews','finance_events'] loop
    execute format('alter table public.%I enable row level security',relation);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',relation);
    execute format('grant select on public.%I to authenticated',relation);
    execute format('create policy finance_read on public.%I for select to authenticated using(private.finance_allowed(workspace_id))',relation);
    if relation <> 'finance_events' then
      execute format('grant insert,update on public.%I to authenticated',relation);
      execute format('create policy finance_write on public.%I for all to authenticated using(private.finance_allowed(workspace_id)) with check(private.finance_allowed(workspace_id))',relation);
    end if;
  end loop;
end $$;

create function private.finance_guard() returns trigger language plpgsql
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
    if not exists(select 1 from public.finance_entries where workspace_id=new.workspace_id and id=new.entry_id and not cancelled)
    then raise exception 'finance_entry_unavailable' using errcode='23514'; end if;
  end if;
  if TG_TABLE_NAME='finance_references' then
    if new.settlement_id is not null and not exists(select 1 from public.finance_settlements where workspace_id=new.workspace_id and id=new.settlement_id and entry_id=new.entry_id)
    then raise exception 'finance_reference_mismatch' using errcode='23514'; end if;
  end if;
  return new;
end $$;
create function private.finance_audit() returns trigger language plpgsql security definer
set search_path=pg_catalog,public,private as $$
begin
  if auth.uid() is null or not private.finance_allowed(new.workspace_id) then
    raise exception 'finance_forbidden' using errcode='42501';
  end if;
  insert into public.finance_events(workspace_id,record_id,entity,actor_id,before_record,after_record)
  values(new.workspace_id,new.id,TG_TABLE_NAME,auth.uid(),case when TG_OP='UPDATE' then to_jsonb(old) end,to_jsonb(new));
  return new;
end $$;
revoke all on function private.finance_guard() from public,anon,authenticated;
revoke all on function private.finance_audit() from public,anon,authenticated;
do $$ declare relation text; begin
  foreach relation in array array['finance_templates','finance_entries','finance_settlements','finance_references','finance_reviews'] loop
    execute format('create trigger finance_guard before insert or update on public.%I for each row execute function private.finance_guard()',relation);
    execute format('create trigger finance_audit after insert or update on public.%I for each row execute function private.finance_audit()',relation);
  end loop;
end $$;

-- Typed column allowlist, optimistic version check, atomic audit. No caller actor.
create function public.finance_save(p_entity text,p_record jsonb,p_expected_version integer default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,private as $$
declare w uuid; record_id uuid; result jsonb; relation text; columns text; existing jsonb;
begin
  select workspace_id into w from public.internal_workspace;
  if not coalesce(private.finance_allowed(w),false) then raise exception 'finance_forbidden' using errcode='42501'; end if;
  record_id := (p_record->>'id')::uuid;
  case p_entity
    when 'entries' then relation:='finance_entries'; columns:='kind,description,period,amount_cents,category,source,estimated,project,allocation,cancelled,reason';
    when 'settlements' then relation:='finance_settlements'; columns:='entry_id,paid_on,amount_cents,source,cancelled,reason';
    when 'templates' then relation:='finance_templates'; columns:='description,category,source,amount_cents,estimated,project,allocation,starts_on,ends_on,active';
    when 'references' then relation:='finance_references'; columns:='entry_id,settlement_id,source,external_id,note';
    when 'reviews' then relation:='finance_reviews'; columns:='period,sources_complete,expenses_complete,taxes_complete,note';
    else raise exception 'finance_invalid_entity' using errcode='22023';
  end case;
  execute format('select to_jsonb(t) from public.%I t where id=$1 and workspace_id=$2 for update',relation) into existing using record_id,w;
  if p_expected_version is null and existing is not null then
    -- A retry can only return the exact same submitted record.
    if exists(select 1 from jsonb_each(p_record) item where item.key not in ('id') and existing->item.key is distinct from item.value) then
      raise exception 'finance_conflict' using errcode='40001';
    end if;
    return existing;
  end if;
  if p_expected_version is not null and (existing is null or (existing->>'version')::int<>p_expected_version) then
    raise exception 'finance_conflict' using errcode='40001';
  end if;
  if existing is null then
    execute format('insert into public.%I(id,workspace_id,%s) select $1,$2,%s from jsonb_populate_record(null::public.%I,$3) returning to_jsonb(%I.*)',relation,columns,columns,relation,relation)
      into result using record_id,w,p_record;
  else
    execute format('update public.%I t set (%s,version)=(select %s,$4+1 from jsonb_populate_record(null::public.%I,$3)) where t.id=$1 and t.workspace_id=$2 returning to_jsonb(t.*)',relation,columns,columns,relation)
      into result using record_id,w,p_record,p_expected_version;
  end if;
  return result;
end $$;
revoke all on function public.finance_save(text,jsonb,integer) from public,anon;
grant execute on function public.finance_save(text,jsonb,integer) to authenticated;

create function public.finance_generate(p_period date) returns integer language plpgsql security invoker
set search_path=pg_catalog,public,private as $$
declare w uuid; generated integer;
begin
  select workspace_id into w from public.internal_workspace;
  if not coalesce(private.finance_allowed(w),false) then raise exception 'finance_forbidden' using errcode='42501'; end if;
  if extract(day from p_period)<>1 then raise exception 'finance_invalid_period' using errcode='22023'; end if;
  insert into public.finance_entries(id,workspace_id,kind,description,period,amount_cents,category,source,estimated,project,allocation,template_id)
  select gen_random_uuid(),w,'expense',description,p_period,amount_cents,category,source,estimated,project,allocation,id
  from public.finance_templates where workspace_id=w and active and starts_on<=p_period and (ends_on is null or ends_on>=p_period)
  on conflict(workspace_id,template_id,period) do nothing;
  get diagnostics generated=row_count;
  return generated;
end $$;
revoke all on function public.finance_generate(date) from public,anon;
grant execute on function public.finance_generate(date) to authenticated;

create function public.finance_summary(p_period date) returns jsonb language plpgsql stable security invoker
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
  ) into result from public.finance_entries where workspace_id=w and period=p_period and not cancelled;
  return result || (select jsonb_build_object(
    'received',coalesce(sum(s.amount_cents) filter(where e.kind='income'),0),
    'paid',coalesce(sum(s.amount_cents) filter(where e.kind='expense'),0),
    'reference_pending',count(*) filter(where not exists(select 1 from public.finance_references r where r.workspace_id=w and r.settlement_id=s.id and r.external_id is not null))
  ) from public.finance_settlements s join public.finance_entries e on e.workspace_id=s.workspace_id and e.id=s.entry_id
    where s.workspace_id=w and s.paid_on>=p_period and s.paid_on<(p_period+interval '1 month') and not s.cancelled and not e.cancelled and e.kind<>'transfer')
    || jsonb_build_object('review',(select to_jsonb(r) from public.finance_reviews r where workspace_id=w and period=p_period));
end $$;
revoke all on function public.finance_summary(date) from public,anon;
grant execute on function public.finance_summary(date) to authenticated;
