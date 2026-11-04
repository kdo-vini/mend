-- Inbox latency: cheap read policies and a private per-workspace broadcast.
--
-- 1. The read policies called public.is_workspace_member(workspace_id) per
--    row. It wraps public.workspace_member_role -> private.workspace_member_role
--    (all with SET search_path, so none inline): three calls and a membership
--    lookup for every row scanned. The thread list (100 conversations with an
--    embedded latest message) averaged ~800 ms on ~3.6k messages. The new
--    helper returns the caller's workspace ids once per statement (initPlan)
--    and the policies compare against that array. Same rule: a member of the
--    internal workspace, any role.
--
-- 2. postgres_changes made Realtime poll the WAL (realtime.list_changes) about
--    ten times a second while any tab was open and check RLS per event. It
--    was the most expensive statement in the database. Writes to the live
--    workspace tables now broadcast a small id-only payload to the private
--    topic `workspace:<id>`; only members of that workspace may join it. The
--    browser re-reads what changed through the normal RLS-protected API, so no
--    message text ever travels in the broadcast.
--
-- 3. Tables no browser subscribes to leave the postgres_changes publication.

create or replace function private.member_workspace_ids(
  allowed_roles text[] default null
)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(wm.workspace_id), '{}'::uuid[])
  from public.workspace_members wm
  join public.internal_workspace iw on iw.workspace_id = wm.workspace_id
  where wm.user_id = (select auth.uid())
    and (allowed_roles is null or wm.role = any (allowed_roles));
$$;

revoke all on function private.member_workspace_ids(text[]) from public, anon;
grant execute on function private.member_workspace_ids(text[])
  to authenticated, service_role;

-- Read policies of the tables the app loads in bulk. `(select ...)` makes the
-- membership lookup an initPlan evaluated once per statement.
alter policy "workspace members can read messages" on public.messages
  using (workspace_id = any ((select private.member_workspace_ids())::uuid[]));
alter policy "workspace members can read conversations" on public.conversations
  using (workspace_id = any ((select private.member_workspace_ids())::uuid[]));
alter policy "workspace members can read contacts" on public.contacts
  using (workspace_id = any ((select private.member_workspace_ids())::uuid[]));
alter policy "workspace members can read ai state" on public.conversation_ai_state
  using (workspace_id = any ((select private.member_workspace_ids())::uuid[]));
alter policy "workspace members can read ai drafts" on public.ai_drafts
  using (workspace_id = any ((select private.member_workspace_ids())::uuid[]));
alter policy "workspace members can read issues" on public.issues
  using (workspace_id = any ((select private.member_workspace_ids())::uuid[]));
alter policy "workspace members can read knowledge" on public.knowledge_articles
  using (workspace_id = any ((select private.member_workspace_ids())::uuid[]));
alter policy "members can read agent runs" on public.agent_runs
  using (workspace_id = any ((select private.member_workspace_ids())::uuid[]));
alter policy "members can read agent events" on public.agent_run_events
  using (workspace_id = any ((select private.member_workspace_ids())::uuid[]));
alter policy "workspace members can read bug cases" on public.bug_cases
  using (workspace_id = any ((select private.member_workspace_ids())::uuid[]));
alter policy "workspace members can read bug case events" on public.bug_case_events
  using (workspace_id = any ((select private.member_workspace_ids())::uuid[]));
alter policy "workspace members can read timeline events" on public.timeline_events
  using (workspace_id = any ((select private.member_workspace_ids())::uuid[]));
alter policy "workspace members can read issue comments" on public.issue_comments
  using (workspace_id = any ((select private.member_workspace_ids())::uuid[]));
alter policy "workspace members can read labels" on public.labels
  using (workspace_id = any ((select private.member_workspace_ids())::uuid[]));
alter policy "workspace members can read channels" on public.channel_connections
  using (workspace_id = any ((select private.member_workspace_ids())::uuid[]));
alter policy "workspace members can read media assets" on public.media_assets
  using (workspace_id = any ((select private.member_workspace_ids())::uuid[]));
alter policy "workspace members can read repositories" on public.repositories
  using (workspace_id = any ((select private.member_workspace_ids())::uuid[]));
alter policy "workspace members can read notifications" on public.notifications
  using (
    workspace_id = any ((select private.member_workspace_ids())::uuid[])
    and (user_id is null or user_id = (select auth.uid()))
  );

-- Broadcast: only ids and the few fields the board applies in place. Never
-- message text, contact data or credentials.
create or replace function private.broadcast_workspace_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  workspace text;
  record jsonb;
begin
  if tg_op = 'UPDATE' and new is not distinct from old then
    return null;
  end if;
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  workspace := row_data ->> 'workspace_id';
  if workspace is null then
    return null;
  end if;
  select coalesce(jsonb_object_agg(field.key, field.value), '{}'::jsonb)
    into record
  from jsonb_each(row_data) as field
  where field.key = any (array[
      'id', 'workspace_id', 'conversation_id', 'contact_id', 'user_id',
      'issue_id', 'status', 'kanban_position', 'due_on', 'completed_at'
    ])
    and field.value <> 'null'::jsonb;
  begin
    perform realtime.send(
      jsonb_build_object('table', tg_table_name, 'op', tg_op, 'record', record),
      'change',
      'workspace:' || workspace,
      true
    );
  exception when others then
    -- A live hint must never fail the write that produced it; the browser's
    -- catch-up re-reads anything it missed.
    null;
  end;
  return null;
end;
$$;

revoke all on function private.broadcast_workspace_change() from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'conversations', 'messages', 'issues', 'agent_runs',
    'conversation_ai_state', 'ai_drafts', 'issue_comments', 'agent_run_events',
    'bug_cases', 'bug_case_events', 'knowledge_articles', 'repositories',
    'evidence', 'timeline_events', 'notifications', 'contacts',
    'issue_messages', 'personal_tasks', 'personal_events'
  ] loop
    execute format(
      'drop trigger if exists broadcast_workspace_change on public.%I', table_name
    );
    execute format(
      'create trigger broadcast_workspace_change
         after insert or update or delete on public.%I
         for each row execute function private.broadcast_workspace_change()',
      table_name
    );
  end loop;
end;
$$;

-- Only members of a workspace may join its private topic.
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists "workspace members receive workspace changes" on realtime.messages';
    execute $policy$
      create policy "workspace members receive workspace changes"
        on realtime.messages
        for select
        to authenticated
        using (
          realtime.messages.extension = 'broadcast'
          and (select realtime.topic()) = any (
            select 'workspace:' || member_workspace::text
            from unnest((select private.member_workspace_ids())) as member_workspace
          )
        )
    $policy$;
  end if;
end;
$$;

-- No browser subscribes to these; keep them out of the WAL Realtime decodes.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'channel_connections', 'webhook_events', 'ai_outbound_messages',
    'media_assets', 'media_batches', 'media_variants', 'workspaces',
    'workspace_members', 'labels', 'issue_labels'
  ] loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', table_name);
    end if;
  end loop;
end;
$$;
