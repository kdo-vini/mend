-- Security hardening for the live MVP.
--
-- Keep client-facing RPC names stable, but move privileged implementations
-- out of the exposed public schema. Jobs remain service-role-only, and every
-- completion/failure operation is conditional on the current lease owner.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- Public RPCs used by the browser are invoker wrappers. The implementations
-- retain SECURITY DEFINER only in the non-exposed schema and validate auth/RBAC
-- inside the function bodies that already existed before this migration.
alter function public.create_workspace(text, text, text, text, text) set schema private;
alter function public.add_workspace_member(uuid, uuid, text) set schema private;
alter function public.update_workspace_member_role(uuid, uuid, text) set schema private;
alter function public.remove_workspace_member(uuid, uuid) set schema private;
alter function public.claim_next_job(text, integer) set schema private;
alter function public.audit_workspace_change() set schema private;

revoke all on function private.create_workspace(text, text, text, text, text) from public, anon;
revoke all on function private.add_workspace_member(uuid, uuid, text) from public, anon;
revoke all on function private.update_workspace_member_role(uuid, uuid, text) from public, anon;
revoke all on function private.remove_workspace_member(uuid, uuid) from public, anon;
revoke all on function private.claim_next_job(text, integer) from public, anon, authenticated;
revoke all on function private.audit_workspace_change() from public, anon, authenticated, service_role;
grant execute on function private.create_workspace(text, text, text, text, text) to authenticated, service_role;
grant execute on function private.add_workspace_member(uuid, uuid, text) to authenticated, service_role;
grant execute on function private.update_workspace_member_role(uuid, uuid, text) to authenticated, service_role;
grant execute on function private.remove_workspace_member(uuid, uuid) to authenticated, service_role;
grant execute on function private.claim_next_job(text, integer) to service_role;

create function public.create_workspace(
  p_name text,
  p_slug text,
  p_issue_prefix text default 'MEND',
  p_timezone text default 'America/Sao_Paulo',
  p_default_language text default 'en'
)
returns public.workspaces
language sql
volatile
security invoker
set search_path = pg_catalog, public, private
as $$ select private.create_workspace($1, $2, $3, $4, $5); $$;

create function public.add_workspace_member(
  p_workspace_id uuid,
  p_user_id uuid,
  p_role text default 'agent'
)
returns public.workspace_members
language sql
volatile
security invoker
set search_path = pg_catalog, public, private
as $$ select private.add_workspace_member($1, $2, $3); $$;

create function public.update_workspace_member_role(
  p_workspace_id uuid,
  p_user_id uuid,
  p_role text
)
returns public.workspace_members
language sql
volatile
security invoker
set search_path = pg_catalog, public, private
as $$ select private.update_workspace_member_role($1, $2, $3); $$;

create function public.remove_workspace_member(
  p_workspace_id uuid,
  p_user_id uuid
)
returns boolean
language sql
volatile
security invoker
set search_path = pg_catalog, public, private
as $$ select private.remove_workspace_member($1, $2); $$;

revoke all on function public.create_workspace(text, text, text, text, text) from public, anon;
revoke all on function public.add_workspace_member(uuid, uuid, text) from public, anon;
revoke all on function public.update_workspace_member_role(uuid, uuid, text) from public, anon;
revoke all on function public.remove_workspace_member(uuid, uuid) from public, anon;
grant execute on function public.create_workspace(text, text, text, text, text) to authenticated, service_role;
grant execute on function public.add_workspace_member(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.update_workspace_member_role(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.remove_workspace_member(uuid, uuid) to authenticated, service_role;

-- claim_next_job keeps its existing public RPC contract for the server, but
-- the public function is now an invoker wrapper with service-role-only ACL.
create function public.claim_next_job(worker_id text, lease_seconds integer default 300)
returns setof public.jobs
language sql
volatile
security invoker
set search_path = pg_catalog, public, private
as $$ select * from private.claim_next_job($1, $2); $$;

revoke all on function public.claim_next_job(text, integer) from public, anon, authenticated;
grant execute on function public.claim_next_job(text, integer) to service_role;

-- Keep the implementation's lease claim safe even when called directly by
-- service_role. Empty worker identifiers would make ownership unverifiable.
create or replace function private.claim_next_job(worker_id text, lease_seconds integer default 300)
returns setof public.jobs
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  if nullif(btrim(worker_id), '') is null then
    raise exception 'worker_id_required';
  end if;

  return query
  with candidate as (
    select id
    from public.jobs
    where (
      (status = 'queued' and available_at <= now())
      or (status = 'running' and locked_at < now() - make_interval(secs => greatest(lease_seconds, 30)))
    )
    order by available_at asc, created_at asc
    for update skip locked
    limit 1
  )
  update public.jobs as jobs
  set status = 'running',
      attempts = jobs.attempts + 1,
      locked_at = now(),
      locked_by = worker_id,
      updated_at = now()
  from candidate
  where jobs.id = candidate.id
  returning jobs.*;
end;
$$;

-- Atomic lease-owner operations. These are intentionally service-role-only;
-- the existing TypeScript adapter also filters by locked_by and treats a zero
-- row result as a lost lease.
create function private.complete_job(
  p_job_id uuid,
  p_worker_id text,
  p_completed_at timestamptz default now()
)
returns public.jobs
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  completed public.jobs;
begin
  if p_job_id is null or nullif(btrim(p_worker_id), '') is null then
    raise exception 'job_lease_owner_required';
  end if;

  update public.jobs
  set status = 'completed',
      locked_at = null,
      locked_by = null,
      updated_at = coalesce(p_completed_at, now())
  where id = p_job_id
    and status = 'running'
    and locked_by = p_worker_id
  returning * into completed;

  if not found then
    raise exception 'job_lease_lost' using errcode = '55000';
  end if;
  return completed;
end;
$$;

create function private.fail_job(
  p_job_id uuid,
  p_worker_id text,
  p_error text,
  p_failed_at timestamptz default now()
)
returns public.jobs
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  current_job public.jobs;
  updated_job public.jobs;
  next_status text;
  next_available_at timestamptz;
  backoff_seconds integer;
  failed_at timestamptz := coalesce(p_failed_at, now());
begin
  if p_job_id is null or nullif(btrim(p_worker_id), '') is null then
    raise exception 'job_lease_owner_required';
  end if;

  select * into current_job
  from public.jobs
  where id = p_job_id
    and status = 'running'
    and locked_by = p_worker_id
  for update;

  if not found then
    raise exception 'job_lease_lost' using errcode = '55000';
  end if;

  if current_job.attempts >= coalesce(current_job.max_attempts, 5) then
    next_status := 'dead';
    next_available_at := current_job.available_at;
  else
    next_status := 'queued';
    backoff_seconds := case
      when current_job.attempts <= 1 then 1
      when current_job.attempts = 2 then 2
      when current_job.attempts = 3 then 4
      when current_job.attempts = 4 then 8
      when current_job.attempts = 5 then 16
      when current_job.attempts = 6 then 32
      else 60
    end;
    next_available_at := failed_at + make_interval(secs => backoff_seconds);
  end if;

  update public.jobs
  set status = next_status,
      available_at = next_available_at,
      locked_at = null,
      locked_by = null,
      last_error = left(coalesce(nullif(p_error, ''), 'job_failed'), 2000),
      updated_at = failed_at
  where id = p_job_id
    and status = 'running'
    and locked_by = p_worker_id
  returning * into updated_job;

  if not found then
    raise exception 'job_lease_lost' using errcode = '55000';
  end if;
  return updated_job;
end;
$$;

revoke all on function private.complete_job(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function private.fail_job(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function private.complete_job(uuid, text, timestamptz) to service_role;
grant execute on function private.fail_job(uuid, text, text, timestamptz) to service_role;

create function public.complete_job(
  p_job_id uuid,
  p_worker_id text,
  p_completed_at timestamptz default now()
)
returns public.jobs
language sql
volatile
security invoker
set search_path = pg_catalog, public, private
as $$ select private.complete_job($1, $2, $3); $$;

create function public.fail_job(
  p_job_id uuid,
  p_worker_id text,
  p_error text,
  p_failed_at timestamptz default now()
)
returns public.jobs
language sql
volatile
security invoker
set search_path = pg_catalog, public, private
as $$ select private.fail_job($1, $2, $3, $4); $$;

revoke all on function public.complete_job(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.fail_job(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.complete_job(uuid, text, timestamptz) to service_role;
grant execute on function public.fail_job(uuid, text, text, timestamptz) to service_role;

-- Jobs are not a client-facing table. Keep the RLS object documented for the
-- advisor while denying all browser roles at both ACL and policy layers.
revoke all on table public.jobs from public, anon, authenticated;
grant select, insert, update, delete on table public.jobs to service_role;
drop policy if exists "members can access jobs" on public.jobs;
create policy "service role manages jobs"
  on public.jobs for all to service_role
  using (true)
  with check (true);

-- Split mutation policies from read policies. FOR ALL was causing a second
-- permissive SELECT policy on every workspace table and was unnecessary.
drop policy if exists "workspace managers can write channels" on public.channel_connections;
drop policy if exists "workspace agents can write contacts" on public.contacts;
drop policy if exists "workspace agents can write conversations" on public.conversations;
drop policy if exists "workspace agents can write messages" on public.messages;
drop policy if exists "workspace agents can write ai state" on public.conversation_ai_state;
drop policy if exists "workspace agents can write issues" on public.issues;
drop policy if exists "workspace agents can write labels" on public.labels;
drop policy if exists "workspace agents can write issue labels" on public.issue_labels;
drop policy if exists "workspace agents can write issue comments" on public.issue_comments;
drop policy if exists "workspace managers can write repositories" on public.repositories;
drop policy if exists "workspace agents can write coding runs" on public.coding_runs;
drop policy if exists "workspace agents can write coding events" on public.coding_run_events;
drop policy if exists "workspace agents can write knowledge" on public.knowledge_articles;

create policy "workspace managers can insert channels" on public.channel_connections
  for insert to authenticated with check (public.workspace_can(workspace_id, array['owner', 'admin']));
create policy "workspace managers can update channels" on public.channel_connections
  for update to authenticated using (public.workspace_can(workspace_id, array['owner', 'admin']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin']));
create policy "workspace managers can delete channels" on public.channel_connections
  for delete to authenticated using (public.workspace_can(workspace_id, array['owner', 'admin']));

create policy "workspace agents can insert contacts" on public.contacts
  for insert to authenticated with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));
create policy "workspace agents can update contacts" on public.contacts
  for update to authenticated using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));
create policy "workspace agents can delete contacts" on public.contacts
  for delete to authenticated using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));

create policy "workspace agents can insert conversations" on public.conversations
  for insert to authenticated with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));
create policy "workspace agents can update conversations" on public.conversations
  for update to authenticated using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));
create policy "workspace agents can delete conversations" on public.conversations
  for delete to authenticated using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));

create policy "workspace agents can insert messages" on public.messages
  for insert to authenticated with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));
create policy "workspace agents can update messages" on public.messages
  for update to authenticated using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));
create policy "workspace agents can delete messages" on public.messages
  for delete to authenticated using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));

create policy "workspace agents can insert ai state" on public.conversation_ai_state
  for insert to authenticated with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));
create policy "workspace agents can update ai state" on public.conversation_ai_state
  for update to authenticated using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));
create policy "workspace agents can delete ai state" on public.conversation_ai_state
  for delete to authenticated using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));

create policy "workspace agents can insert issues" on public.issues
  for insert to authenticated with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));
create policy "workspace agents can update issues" on public.issues
  for update to authenticated using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));
create policy "workspace agents can delete issues" on public.issues
  for delete to authenticated using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));

create policy "workspace agents can insert labels" on public.labels
  for insert to authenticated with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));
create policy "workspace agents can update labels" on public.labels
  for update to authenticated using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));
create policy "workspace agents can delete labels" on public.labels
  for delete to authenticated using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));

create policy "workspace agents can insert issue labels" on public.issue_labels
  for insert to authenticated with check (exists (select 1 from public.issues where id = issue_id and public.workspace_can(workspace_id, array['owner', 'admin', 'agent'])));
create policy "workspace agents can update issue labels" on public.issue_labels
  for update to authenticated
  using (exists (select 1 from public.issues where id = issue_id and public.workspace_can(workspace_id, array['owner', 'admin', 'agent'])))
  with check (exists (select 1 from public.issues where id = issue_id and public.workspace_can(workspace_id, array['owner', 'admin', 'agent'])));
create policy "workspace agents can delete issue labels" on public.issue_labels
  for delete to authenticated using (exists (select 1 from public.issues where id = issue_id and public.workspace_can(workspace_id, array['owner', 'admin', 'agent'])));

create policy "workspace agents can insert issue comments" on public.issue_comments
  for insert to authenticated with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));
create policy "workspace agents can update issue comments" on public.issue_comments
  for update to authenticated using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));
create policy "workspace agents can delete issue comments" on public.issue_comments
  for delete to authenticated using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));

create policy "workspace managers can insert repositories" on public.repositories
  for insert to authenticated with check (public.workspace_can(workspace_id, array['owner', 'admin']));
create policy "workspace managers can update repositories" on public.repositories
  for update to authenticated using (public.workspace_can(workspace_id, array['owner', 'admin']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin']));
create policy "workspace managers can delete repositories" on public.repositories
  for delete to authenticated using (public.workspace_can(workspace_id, array['owner', 'admin']));

create policy "workspace agents can insert coding runs" on public.coding_runs
  for insert to authenticated with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));
create policy "workspace agents can update coding runs" on public.coding_runs
  for update to authenticated using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));
create policy "workspace agents can delete coding runs" on public.coding_runs
  for delete to authenticated using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));

create policy "workspace agents can insert coding events" on public.coding_run_events
  for insert to authenticated with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));
create policy "workspace agents can update coding events" on public.coding_run_events
  for update to authenticated using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));
create policy "workspace agents can delete coding events" on public.coding_run_events
  for delete to authenticated using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));

create policy "workspace agents can insert knowledge" on public.knowledge_articles
  for insert to authenticated with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));
create policy "workspace agents can update knowledge" on public.knowledge_articles
  for update to authenticated using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));
create policy "workspace agents can delete knowledge" on public.knowledge_articles
  for delete to authenticated using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));

-- The operational join/evidence/timeline tables follow the same read/write
-- split. Notifications are server-created and client-readable only.
drop policy if exists "members can access issue messages" on public.issue_messages;
drop policy if exists "members can access evidence" on public.evidence;
drop policy if exists "members can access timeline events" on public.timeline_events;
drop policy if exists "members can access notifications" on public.notifications;

create policy "workspace members can read issue messages" on public.issue_messages
  for select to authenticated using (
    public.is_workspace_member(workspace_id)
    and exists (select 1 from public.issues i where i.id = issue_messages.issue_id and i.workspace_id = issue_messages.workspace_id)
    and exists (select 1 from public.messages m where m.id = issue_messages.message_id and m.workspace_id = issue_messages.workspace_id)
  );
create policy "workspace agents can write issue messages" on public.issue_messages
  for insert to authenticated with check (
    public.workspace_can(workspace_id, array['owner', 'admin', 'agent'])
    and exists (select 1 from public.issues i where i.id = issue_messages.issue_id and i.workspace_id = issue_messages.workspace_id)
    and exists (select 1 from public.messages m where m.id = issue_messages.message_id and m.workspace_id = issue_messages.workspace_id)
  );
create policy "workspace agents can delete issue messages" on public.issue_messages
  for delete to authenticated using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));

create policy "workspace members can read evidence" on public.evidence
  for select to authenticated using (
    public.is_workspace_member(workspace_id)
    and exists (select 1 from public.issues i where i.id = evidence.issue_id and i.workspace_id = evidence.workspace_id)
    and (message_id is null or exists (select 1 from public.messages m where m.id = evidence.message_id and m.workspace_id = evidence.workspace_id))
  );
create policy "workspace agents can write evidence" on public.evidence
  for insert to authenticated with check (
    public.workspace_can(workspace_id, array['owner', 'admin', 'agent'])
    and exists (select 1 from public.issues i where i.id = evidence.issue_id and i.workspace_id = evidence.workspace_id)
    and (message_id is null or exists (select 1 from public.messages m where m.id = evidence.message_id and m.workspace_id = evidence.workspace_id))
  );
create policy "workspace agents can update evidence" on public.evidence
  for update to authenticated using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));
create policy "workspace agents can delete evidence" on public.evidence
  for delete to authenticated using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));

create policy "workspace members can read timeline events" on public.timeline_events
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "workspace agents can insert timeline events" on public.timeline_events
  for insert to authenticated with check (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));
create policy "workspace agents can delete timeline events" on public.timeline_events
  for delete to authenticated using (public.workspace_can(workspace_id, array['owner', 'admin', 'agent']));

create policy "workspace members can read notifications" on public.notifications
  for select to authenticated using (
    public.is_workspace_member(workspace_id)
    and (user_id is null or user_id = (select auth.uid()))
  );

-- Storage paths must start with a canonical UUID and private-media is never
-- reachable by anonymous database roles.
revoke all on table storage.objects from public, anon;
grant select, insert, update, delete on table storage.objects to authenticated, service_role;
drop policy if exists "workspace agents can write private media" on storage.objects;

create policy "workspace agents can insert private media" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'private-media'
    and name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
    and public.workspace_can((split_part(name, '/', 1))::uuid, array['owner', 'admin', 'agent'])
  );
create policy "workspace agents can update private media" on storage.objects
  for update to authenticated using (
    bucket_id = 'private-media'
    and name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
    and public.workspace_can((split_part(name, '/', 1))::uuid, array['owner', 'admin', 'agent'])
  ) with check (
    bucket_id = 'private-media'
    and name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
    and public.workspace_can((split_part(name, '/', 1))::uuid, array['owner', 'admin', 'agent'])
  );
create policy "workspace agents can delete private media" on storage.objects
  for delete to authenticated using (
    bucket_id = 'private-media'
    and name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
    and public.workspace_can((split_part(name, '/', 1))::uuid, array['owner', 'admin', 'agent'])
  );
drop policy if exists "workspace members can read private media" on storage.objects;
create policy "workspace members can read private media" on storage.objects
  for select to authenticated using (
    bucket_id = 'private-media'
    and name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
    and public.is_workspace_member((split_part(name, '/', 1))::uuid)
  );

-- Keep Realtime idempotent and include the tables used by Inbox, Issues,
-- Knowledge labels, Codex events, notifications and WhatsApp connection
-- state. RLS remains the access boundary for every published table.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'workspaces',
    'workspace_members',
    'channel_connections',
    'contacts',
    'conversations',
    'messages',
    'conversation_ai_state',
    'issues',
    'labels',
    'issue_labels',
    'issue_comments',
    'repositories',
    'coding_runs',
    'coding_run_events',
    'knowledge_articles',
    'issue_messages',
    'evidence',
    'timeline_events',
    'notifications'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end
$$;
