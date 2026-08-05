-- Shared issue ordering and personal planning data for the Kanban surface.

alter table public.issues
  add column if not exists due_on date,
  add column if not exists kanban_position numeric(20, 6);

with ranked as (
  select
    id,
    row_number() over (
      partition by workspace_id, status
      order by updated_at desc, created_at desc, id
    ) as rank
  from public.issues
)
update public.issues as issues
set kanban_position = ranked.rank * 1024
from ranked
where issues.id = ranked.id
  and issues.kanban_position is null;

alter table public.issues
  alter column kanban_position set default 1024,
  alter column kanban_position set not null;

create index if not exists issues_workspace_status_position_idx
  on public.issues (workspace_id, status, kanban_position, id);

create index if not exists issues_workspace_assignee_due_idx
  on public.issues (workspace_id, assigned_user_id, due_on, status);

create table if not exists public.personal_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 240),
  notes text,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  due_on date,
  kanban_position numeric(20, 6) not null default 1024,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.personal_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 240),
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);

create index if not exists personal_tasks_workspace_user_status_position_idx
  on public.personal_tasks (workspace_id, user_id, status, kanban_position, id);

create index if not exists personal_tasks_workspace_user_due_idx
  on public.personal_tasks (workspace_id, user_id, due_on, status);

create index if not exists personal_events_workspace_user_start_idx
  on public.personal_events (workspace_id, user_id, starts_at);

alter table public.personal_tasks enable row level security;
alter table public.personal_events enable row level security;

revoke all on table public.personal_tasks, public.personal_events from public, anon;
grant select, insert, update, delete on public.personal_tasks, public.personal_events to authenticated;
grant select, insert, update, delete on public.personal_tasks, public.personal_events to service_role;

create policy "members can read own personal tasks"
  on public.personal_tasks for select to authenticated
  using (public.is_workspace_member(workspace_id) and user_id = (select auth.uid()));

create policy "workspace agents can create own personal tasks"
  on public.personal_tasks for insert to authenticated
  with check (
    public.workspace_can(workspace_id, array['owner', 'admin', 'agent'])
    and user_id = (select auth.uid())
  );

create policy "workspace agents can update own personal tasks"
  on public.personal_tasks for update to authenticated
  using (
    public.workspace_can(workspace_id, array['owner', 'admin', 'agent'])
    and user_id = (select auth.uid())
  )
  with check (
    public.workspace_can(workspace_id, array['owner', 'admin', 'agent'])
    and user_id = (select auth.uid())
  );

create policy "workspace agents can delete own personal tasks"
  on public.personal_tasks for delete to authenticated
  using (
    public.workspace_can(workspace_id, array['owner', 'admin', 'agent'])
    and user_id = (select auth.uid())
  );

create policy "members can read own personal events"
  on public.personal_events for select to authenticated
  using (public.is_workspace_member(workspace_id) and user_id = (select auth.uid()));

create policy "workspace agents can create own personal events"
  on public.personal_events for insert to authenticated
  with check (
    public.workspace_can(workspace_id, array['owner', 'admin', 'agent'])
    and user_id = (select auth.uid())
  );

create policy "workspace agents can update own personal events"
  on public.personal_events for update to authenticated
  using (
    public.workspace_can(workspace_id, array['owner', 'admin', 'agent'])
    and user_id = (select auth.uid())
  )
  with check (
    public.workspace_can(workspace_id, array['owner', 'admin', 'agent'])
    and user_id = (select auth.uid())
  );

create policy "workspace agents can delete own personal events"
  on public.personal_events for delete to authenticated
  using (
    public.workspace_can(workspace_id, array['owner', 'admin', 'agent'])
    and user_id = (select auth.uid())
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'personal_tasks'
  ) then
    alter publication supabase_realtime add table public.personal_tasks;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'personal_events'
  ) then
    alter publication supabase_realtime add table public.personal_events;
  end if;
end
$$;
