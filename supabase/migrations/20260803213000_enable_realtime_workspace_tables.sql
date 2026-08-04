-- Keep the live workspace in sync without exposing tables outside Supabase RLS.
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
    'issue_comments',
    'coding_runs',
    'coding_run_events',
    'knowledge_articles',
    'repositories',
    'issue_messages',
    'evidence',
    'timeline_events',
    'notifications'
  ] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end
$$;
