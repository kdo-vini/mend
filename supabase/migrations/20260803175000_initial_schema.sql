create extension if not exists pgcrypto;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  issue_prefix text not null default 'TEC' check (issue_prefix ~ '^[A-Z][A-Z0-9]{1,7}$'),
  next_issue_number integer not null default 1 check (next_issue_number > 0),
  timezone text not null default 'UTC',
  default_language text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'agent' check (role in ('owner', 'admin', 'agent', 'viewer')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table public.channel_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null default 'whatsmiau' check (provider = 'whatsmiau'),
  name text not null,
  provider_instance_name text not null,
  phone_number text,
  profile_name text,
  profile_picture_url text,
  status text not null default 'closed' check (status in ('open', 'closed', 'connecting', 'qr-code')),
  settings_json jsonb not null default '{}'::jsonb,
  connected_at timestamptz,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider_instance_name)
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  channel_connection_id uuid not null references public.channel_connections(id) on delete cascade,
  provider_contact_id text,
  phone_number text not null,
  display_name text not null,
  company_name text,
  profile_picture_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, phone_number)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  channel_connection_id uuid not null references public.channel_connections(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'snoozed', 'resolved')),
  attention_state text not null default 'needs_attention' check (attention_state in ('needs_attention', 'ai_handling', 'waiting_customer', 'none')),
  assigned_user_id uuid references auth.users(id) on delete set null,
  ai_mode text not null default 'draft' check (ai_mode in ('off', 'draft', 'safe_auto')),
  unread_count integer not null default 0 check (unread_count >= 0),
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  resolved_at timestamptz,
  snoozed_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  channel_connection_id uuid not null references public.channel_connections(id) on delete cascade,
  provider_message_id text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  sender_type text not null check (sender_type in ('contact', 'user', 'ai', 'system')),
  message_type text not null default 'text' check (message_type in ('text', 'image', 'video', 'audio', 'document', 'reaction')),
  text text,
  caption text,
  media_storage_path text,
  media_remote_url text,
  mime_type text,
  file_name text,
  file_size bigint,
  duration_seconds integer,
  quoted_message_id uuid references public.messages(id) on delete set null,
  provider_status text,
  is_deleted boolean not null default false,
  ai_generated boolean not null default false,
  sent_by_user_id uuid references auth.users(id) on delete set null,
  provider_timestamp timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_connection_id, provider_message_id)
);

create table public.conversation_ai_state (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null unique references public.conversations(id) on delete cascade,
  latest_intent text,
  latest_confidence numeric(4,3) check (latest_confidence between 0 and 1),
  current_summary text,
  sentiment text,
  needs_human boolean not null default false,
  needs_human_reason text,
  last_triaged_message_id uuid references public.messages(id) on delete set null,
  last_triaged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  number integer not null check (number > 0),
  identifier text not null,
  conversation_id uuid references public.conversations(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  source text not null default 'internal' check (source in ('conversation', 'internal', 'ai')),
  type text not null check (type in ('production_bug', 'bug', 'incident', 'feature', 'task', 'billing', 'commercial', 'question', 'other')),
  priority text not null default 'none' check (priority in ('urgent', 'high', 'medium', 'low', 'none')),
  status text not null default 'triage' check (status in ('triage', 'backlog', 'todo', 'in_progress', 'review', 'done', 'canceled')),
  title text not null,
  description text,
  ai_summary text,
  impact text,
  reproduction_steps_json jsonb not null default '[]'::jsonb,
  expected_behavior text,
  actual_behavior text,
  affected_product text,
  affected_environment text,
  confidence numeric(4,3) check (confidence between 0 and 1),
  created_by text not null default 'user',
  created_by_user_id uuid references auth.users(id) on delete set null,
  assigned_user_id uuid references auth.users(id) on delete set null,
  parent_issue_id uuid references public.issues(id) on delete set null,
  duplicate_of_issue_id uuid references public.issues(id) on delete set null,
  resolved_at timestamptz,
  customer_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, number),
  unique (workspace_id, identifier)
);

create table public.labels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  color text not null default '#6b7280',
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table public.issue_labels (
  issue_id uuid not null references public.issues(id) on delete cascade,
  label_id uuid not null references public.labels(id) on delete cascade,
  primary key (issue_id, label_id)
);

create table public.issue_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  issue_id uuid not null references public.issues(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  author_type text not null default 'user' check (author_type in ('user', 'ai', 'system')),
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.repositories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  local_path text not null,
  default_branch text not null default 'main',
  allowed_commands jsonb not null default '["install", "lint", "test", "build"]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coding_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  issue_id uuid not null references public.issues(id) on delete cascade,
  repository_id uuid references public.repositories(id) on delete set null,
  mode text not null check (mode in ('investigate', 'propose_fix', 'implement_fix')),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'canceled', 'approved', 'rejected')),
  progress integer not null default 0 check (progress between 0 and 100),
  branch_name text,
  commit_sha text,
  result_json jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coding_run_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  coding_run_id uuid not null references public.coding_runs(id) on delete cascade,
  event_type text not null,
  message text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  category text not null default 'Support',
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'dead')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
as $$ select exists (select 1 from public.workspace_members where workspace_id = target_workspace_id and user_id = (select auth.uid())); $$;

create or replace function public.claim_issue_number(target_workspace_id uuid)
returns text
language plpgsql
volatile
as $$
declare next_number integer; prefix text;
begin
  update public.workspaces set next_issue_number = next_issue_number + 1, updated_at = now() where id = target_workspace_id returning next_issue_number - 1, issue_prefix into next_number, prefix;
  if next_number is null then raise exception 'workspace_not_found'; end if;
  return prefix || '-' || next_number;
end;
$$;

do $$ declare table_name text; begin
  foreach table_name in array array['workspaces', 'workspace_members', 'channel_connections', 'contacts', 'conversations', 'messages', 'conversation_ai_state', 'issues', 'labels', 'issue_labels', 'issue_comments', 'repositories', 'coding_runs', 'coding_run_events', 'knowledge_articles', 'jobs', 'audit_log'] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

create policy "members can see workspaces" on public.workspaces for select to authenticated using (public.is_workspace_member(id));
create policy "members can see own membership" on public.workspace_members for select to authenticated using (user_id = (select auth.uid()));
create policy "members can access channels" on public.channel_connections for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members can access contacts" on public.contacts for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members can access conversations" on public.conversations for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members can access messages" on public.messages for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members can access ai state" on public.conversation_ai_state for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members can access issues" on public.issues for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members can access labels" on public.labels for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members can access issue labels" on public.issue_labels for all to authenticated using (exists (select 1 from public.issues where id = issue_id and public.is_workspace_member(workspace_id))) with check (exists (select 1 from public.issues where id = issue_id and public.is_workspace_member(workspace_id)));
create policy "members can access issue comments" on public.issue_comments for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members can access repositories" on public.repositories for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members can access coding runs" on public.coding_runs for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members can access coding events" on public.coding_run_events for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members can access knowledge" on public.knowledge_articles for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members can access jobs" on public.jobs for all to authenticated using (workspace_id is null or public.is_workspace_member(workspace_id)) with check (workspace_id is null or public.is_workspace_member(workspace_id));
create policy "members can access audit" on public.audit_log for select to authenticated using (workspace_id is null or public.is_workspace_member(workspace_id));

insert into storage.buckets (id, name, public) values ('private-media', 'private-media', false) on conflict (id) do nothing;
