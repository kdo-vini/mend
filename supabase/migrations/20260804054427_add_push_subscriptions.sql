create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id, endpoint)
);

create index push_subscriptions_workspace_user_idx
  on public.push_subscriptions (workspace_id, user_id);

alter table public.push_subscriptions enable row level security;

create policy "members can manage own push subscriptions"
  on public.push_subscriptions for all to authenticated
  using (
    public.is_workspace_member(push_subscriptions.workspace_id)
    and push_subscriptions.user_id = (select auth.uid())
  )
  with check (
    public.is_workspace_member(push_subscriptions.workspace_id)
    and push_subscriptions.user_id = (select auth.uid())
  );

grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.push_subscriptions to service_role;
