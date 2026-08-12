-- Architecture hardening: exact provider binding, tenant-safe relationships,
-- recoverable external effects, hybrid retrieval and measurable outcomes.

create unique index if not exists channel_connections_provider_instance_global_idx
  on public.channel_connections (provider, provider_instance_name);

create table if not exists public.webhook_quarantine_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('whatsmiau')),
  event_name text not null check (char_length(event_name) between 1 and 120),
  instance_digest text not null check (instance_digest ~ '^[a-f0-9]{64}$'),
  payload_digest text not null check (payload_digest ~ '^[a-f0-9]{64}$'),
  received_at timestamptz not null default now()
);

create index if not exists webhook_quarantine_events_received_idx
  on public.webhook_quarantine_events (received_at desc);

alter table public.webhook_quarantine_events enable row level security;
revoke all on public.webhook_quarantine_events from public, anon, authenticated;
grant select, insert, update, delete on public.webhook_quarantine_events to service_role;

-- Every tenant-owned relationship below is backed by the workspace key. The
-- legacy single-column foreign keys remain during rollout, while these
-- constraints make a cross-workspace graph impossible even for service_role.
create unique index if not exists channel_connections_id_workspace_uidx on public.channel_connections (id, workspace_id);
create unique index if not exists contacts_id_workspace_uidx on public.contacts (id, workspace_id);
create unique index if not exists conversations_id_workspace_uidx on public.conversations (id, workspace_id);
create unique index if not exists messages_id_workspace_uidx on public.messages (id, workspace_id);
create unique index if not exists issues_id_workspace_uidx on public.issues (id, workspace_id);
create unique index if not exists labels_id_workspace_uidx on public.labels (id, workspace_id);
create unique index if not exists repositories_id_workspace_uidx on public.repositories (id, workspace_id);
create unique index if not exists agent_runs_id_workspace_uidx on public.agent_runs (id, workspace_id);
create unique index if not exists bug_cases_id_workspace_uidx on public.bug_cases (id, workspace_id);
create unique index if not exists knowledge_articles_id_workspace_uidx on public.knowledge_articles (id, workspace_id);
create unique index if not exists jobs_id_workspace_uidx on public.jobs (id, workspace_id);
create unique index if not exists ai_drafts_id_workspace_uidx on public.ai_drafts (id, workspace_id);
create unique index if not exists media_batches_id_workspace_uidx on public.media_batches (id, workspace_id);
create unique index if not exists media_assets_id_workspace_uidx on public.media_assets (id, workspace_id);
create unique index if not exists mcp_connections_id_workspace_uidx on public.mcp_connections (id, workspace_id);
create unique index if not exists agent_connections_id_workspace_uidx on public.agent_connections (id, workspace_id);
create unique index if not exists agent_research_artifacts_id_workspace_uidx on public.agent_research_artifacts (id, workspace_id);

alter table public.issue_labels add column if not exists workspace_id uuid;
update public.issue_labels links set workspace_id = issue.workspace_id
from public.issues issue where issue.id = links.issue_id and links.workspace_id is null;
alter table public.issue_labels alter column workspace_id set not null;

alter table public.ai_draft_knowledge add column if not exists workspace_id uuid;
update public.ai_draft_knowledge links set workspace_id = draft.workspace_id
from public.ai_drafts draft where draft.id = links.draft_id and links.workspace_id is null;
alter table public.ai_draft_knowledge alter column workspace_id set not null;

alter table public.contacts add constraint contacts_channel_workspace_fkey foreign key (channel_connection_id, workspace_id) references public.channel_connections (id, workspace_id) on delete cascade not valid;
alter table public.conversations add constraint conversations_channel_workspace_fkey foreign key (channel_connection_id, workspace_id) references public.channel_connections (id, workspace_id) on delete cascade not valid;
alter table public.conversations add constraint conversations_contact_workspace_fkey foreign key (contact_id, workspace_id) references public.contacts (id, workspace_id) on delete cascade not valid;
alter table public.messages add constraint messages_conversation_workspace_fkey foreign key (conversation_id, workspace_id) references public.conversations (id, workspace_id) on delete cascade not valid;
alter table public.messages add constraint messages_channel_workspace_fkey foreign key (channel_connection_id, workspace_id) references public.channel_connections (id, workspace_id) on delete cascade not valid;
alter table public.messages add constraint messages_quoted_workspace_fkey foreign key (quoted_message_id, workspace_id) references public.messages (id, workspace_id) not valid;
alter table public.conversation_ai_state add constraint conversation_ai_state_conversation_workspace_fkey foreign key (conversation_id, workspace_id) references public.conversations (id, workspace_id) on delete cascade not valid;
alter table public.conversation_ai_state add constraint conversation_ai_state_triaged_message_workspace_fkey foreign key (last_triaged_message_id, workspace_id) references public.messages (id, workspace_id) not valid;
alter table public.issues add constraint issues_conversation_workspace_fkey foreign key (conversation_id, workspace_id) references public.conversations (id, workspace_id) not valid;
alter table public.issues add constraint issues_contact_workspace_fkey foreign key (contact_id, workspace_id) references public.contacts (id, workspace_id) not valid;
alter table public.issues add constraint issues_parent_workspace_fkey foreign key (parent_issue_id, workspace_id) references public.issues (id, workspace_id) not valid;
alter table public.issues add constraint issues_duplicate_workspace_fkey foreign key (duplicate_of_issue_id, workspace_id) references public.issues (id, workspace_id) not valid;
alter table public.issue_labels add constraint issue_labels_issue_workspace_fkey foreign key (issue_id, workspace_id) references public.issues (id, workspace_id) on delete cascade not valid;
alter table public.issue_labels add constraint issue_labels_label_workspace_fkey foreign key (label_id, workspace_id) references public.labels (id, workspace_id) on delete cascade not valid;
alter table public.issue_comments add constraint issue_comments_issue_workspace_fkey foreign key (issue_id, workspace_id) references public.issues (id, workspace_id) on delete cascade not valid;
alter table public.issue_messages add constraint issue_messages_issue_workspace_fkey foreign key (issue_id, workspace_id) references public.issues (id, workspace_id) on delete cascade not valid;
alter table public.issue_messages add constraint issue_messages_message_workspace_fkey foreign key (message_id, workspace_id) references public.messages (id, workspace_id) on delete cascade not valid;
alter table public.evidence add constraint evidence_issue_workspace_fkey foreign key (issue_id, workspace_id) references public.issues (id, workspace_id) on delete cascade not valid;
alter table public.evidence add constraint evidence_message_workspace_fkey foreign key (message_id, workspace_id) references public.messages (id, workspace_id) not valid;
alter table public.agent_runs add constraint agent_runs_issue_workspace_fkey foreign key (issue_id, workspace_id) references public.issues (id, workspace_id) on delete cascade not valid;
alter table public.agent_runs add constraint agent_runs_repository_workspace_fkey foreign key (repository_id, workspace_id) references public.repositories (id, workspace_id) not valid;
alter table public.agent_runs add constraint agent_runs_parent_workspace_fkey foreign key (parent_run_id, workspace_id) references public.agent_runs (id, workspace_id) not valid;
alter table public.agent_runs add constraint agent_runs_connection_workspace_fkey foreign key (connection_id, workspace_id) references public.agent_connections (id, workspace_id) not valid;
alter table public.agent_runs add constraint agent_runs_research_workspace_fkey foreign key (research_artifact_id, workspace_id) references public.agent_research_artifacts (id, workspace_id) not valid;
alter table public.agent_run_events add constraint agent_run_events_run_workspace_fkey foreign key (agent_run_id, workspace_id) references public.agent_runs (id, workspace_id) on delete cascade not valid;
alter table public.bug_cases add constraint bug_cases_issue_workspace_fkey foreign key (issue_id, workspace_id) references public.issues (id, workspace_id) on delete cascade not valid;
alter table public.bug_cases add constraint bug_cases_conversation_workspace_fkey foreign key (conversation_id, workspace_id) references public.conversations (id, workspace_id) not valid;
alter table public.bug_cases add constraint bug_cases_signal_workspace_fkey foreign key (signal_message_id, workspace_id) references public.messages (id, workspace_id) not valid;
alter table public.bug_cases add constraint bug_cases_duplicate_workspace_fkey foreign key (duplicate_of_issue_id, workspace_id) references public.issues (id, workspace_id) not valid;
alter table public.bug_cases add constraint bug_cases_investigation_run_workspace_fkey foreign key (investigation_agent_run_id, workspace_id) references public.agent_runs (id, workspace_id) not valid;
alter table public.bug_cases add constraint bug_cases_fix_run_workspace_fkey foreign key (fix_agent_run_id, workspace_id) references public.agent_runs (id, workspace_id) not valid;
alter table public.bug_case_events add constraint bug_case_events_case_workspace_fkey foreign key (bug_case_id, workspace_id) references public.bug_cases (id, workspace_id) on delete cascade not valid;
alter table public.ai_drafts add constraint ai_drafts_conversation_workspace_fkey foreign key (conversation_id, workspace_id) references public.conversations (id, workspace_id) on delete cascade not valid;
alter table public.ai_drafts add constraint ai_drafts_message_workspace_fkey foreign key (source_message_id, workspace_id) references public.messages (id, workspace_id) on delete cascade not valid;
alter table public.ai_draft_knowledge add constraint ai_draft_knowledge_draft_workspace_fkey foreign key (draft_id, workspace_id) references public.ai_drafts (id, workspace_id) on delete cascade not valid;
alter table public.ai_draft_knowledge add constraint ai_draft_knowledge_article_workspace_fkey foreign key (knowledge_article_id, workspace_id) references public.knowledge_articles (id, workspace_id) on delete cascade not valid;
alter table public.mcp_oauth_states add constraint mcp_oauth_states_connection_workspace_fkey foreign key (connection_id, workspace_id) references public.mcp_connections (id, workspace_id) on delete cascade not valid;
alter table public.mcp_tool_executions add constraint mcp_tool_executions_connection_workspace_fkey foreign key (connection_id, workspace_id) references public.mcp_connections (id, workspace_id) on delete cascade not valid;
alter table public.mcp_tool_executions add constraint mcp_tool_executions_message_workspace_fkey foreign key (source_message_id, workspace_id) references public.messages (id, workspace_id) on delete cascade not valid;
alter table public.media_batches add constraint media_batches_conversation_workspace_fkey foreign key (conversation_id, workspace_id) references public.conversations (id, workspace_id) on delete cascade not valid;
alter table public.media_assets add constraint media_assets_conversation_workspace_fkey foreign key (conversation_id, workspace_id) references public.conversations (id, workspace_id) on delete cascade not valid;
alter table public.media_assets add constraint media_assets_batch_workspace_fkey foreign key (batch_id, workspace_id) references public.media_batches (id, workspace_id) not valid;
alter table public.media_variants add constraint media_variants_asset_workspace_fkey foreign key (asset_id, workspace_id) references public.media_assets (id, workspace_id) on delete cascade not valid;
alter table public.media_send_requests add constraint media_send_conversation_workspace_fkey foreign key (conversation_id, workspace_id) references public.conversations (id, workspace_id) on delete cascade not valid;
alter table public.media_send_requests add constraint media_send_batch_workspace_fkey foreign key (batch_id, workspace_id) references public.media_batches (id, workspace_id) not valid;
alter table public.media_send_requests add constraint media_send_asset_workspace_fkey foreign key (asset_id, workspace_id) references public.media_assets (id, workspace_id) on delete cascade not valid;
alter table public.media_send_requests add constraint media_send_message_workspace_fkey foreign key (message_id, workspace_id) references public.messages (id, workspace_id) not valid;

do $$
declare constraint_row record;
begin
  for constraint_row in
    select conrelid::regclass as table_name, conname
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and conname like '%\_workspace\_fkey' escape '\'
      and not convalidated
  loop
    execute format('alter table %s validate constraint %I', constraint_row.table_name, constraint_row.conname);
  end loop;
end $$;

create extension if not exists vector with schema extensions;

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  article_id uuid not null,
  article_version text not null,
  chunk_index integer not null check (chunk_index >= 0),
  heading text not null default '',
  content text not null check (char_length(content) between 1 and 8000),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  embedding extensions.vector(1536),
  search_document tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(heading, '')), 'A') ||
    setweight(to_tsvector('simple', content), 'B')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (article_id, article_version, chunk_index),
  foreign key (article_id, workspace_id) references public.knowledge_articles (id, workspace_id) on delete cascade
);
create index knowledge_chunks_workspace_article_idx on public.knowledge_chunks (workspace_id, article_id, chunk_index);
create index knowledge_chunks_fts_idx on public.knowledge_chunks using gin (search_document);
alter table public.knowledge_chunks enable row level security;
create policy "members read published knowledge chunks" on public.knowledge_chunks for select to authenticated
  using (public.is_workspace_member(workspace_id) and exists (
    select 1 from public.knowledge_articles article
    where article.id = knowledge_chunks.article_id
      and article.workspace_id = knowledge_chunks.workspace_id
      and article.status = 'published'
  ));
revoke all on public.knowledge_chunks from public, anon;
grant select on public.knowledge_chunks to authenticated;
grant select, insert, update, delete on public.knowledge_chunks to service_role;

insert into public.knowledge_chunks (
  workspace_id, article_id, article_version, chunk_index, heading, content, content_hash
)
select article.workspace_id, article.id,
  encode(digest(article.id::text || E'\n' || article.title || E'\n' || article.body || E'\n' || article.updated_at::text, 'sha256'), 'hex'),
  part.index - 1, article.title,
  substr(article.body, ((part.index - 1) * 6000) + 1, 6000),
  encode(digest(substr(article.body, ((part.index - 1) * 6000) + 1, 6000), 'sha256'), 'hex')
from public.knowledge_articles article
cross join lateral generate_series(1, greatest(1, ceil(length(article.body) / 6000.0)::integer)) as part(index)
where article.status = 'published'
on conflict (article_id, article_version, chunk_index) do nothing;

create or replace function public.match_knowledge_chunks(
  p_workspace_id uuid,
  p_query text,
  p_query_embedding extensions.vector(1536) default null,
  p_limit integer default 8,
  p_min_score real default 0.08
) returns table (
  chunk_id uuid, article_id uuid, article_title text, heading text, content text,
  lexical_score real, semantic_score real, hybrid_score real, article_version text
) language sql stable security invoker set search_path = pg_catalog, public, extensions as $$
  with ranked as (
    select chunk.id as chunk_id, chunk.article_id, article.title as article_title,
      chunk.heading, chunk.content, chunk.article_version,
      ts_rank_cd(chunk.search_document, websearch_to_tsquery('simple', p_query))::real as lexical_score,
      case when p_query_embedding is null or chunk.embedding is null then 0::real
        else greatest(0, 1 - (chunk.embedding <=> p_query_embedding))::real end as semantic_score
    from public.knowledge_chunks chunk
    join public.knowledge_articles article
      on article.id = chunk.article_id and article.workspace_id = chunk.workspace_id
    where chunk.workspace_id = p_workspace_id and article.status = 'published'
  )
  select ranked.chunk_id, ranked.article_id, ranked.article_title, ranked.heading,
    ranked.content, ranked.lexical_score, ranked.semantic_score,
    (case when p_query_embedding is null then ranked.lexical_score
      else ranked.lexical_score * 0.45 + ranked.semantic_score * 0.55 end)::real as hybrid_score,
    ranked.article_version
  from ranked
  where greatest(ranked.lexical_score, ranked.semantic_score) >= p_min_score
  order by hybrid_score desc, ranked.article_id, ranked.chunk_id
  limit least(greatest(p_limit, 1), 20)
$$;
revoke all on function public.match_knowledge_chunks(uuid, text, extensions.vector, integer, real) from public, anon;
grant execute on function public.match_knowledge_chunks(uuid, text, extensions.vector, integer, real) to authenticated, service_role;

create table public.external_operations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('github_publish', 'github_merge', 'dokploy_deploy')),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 500),
  request_digest text not null check (request_digest ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'uncertain')),
  provider_reference text,
  result_json jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (workspace_id, kind, idempotency_key)
);
create index external_operations_reconcile_idx on public.external_operations (status, updated_at) where status in ('pending', 'uncertain');
alter table public.external_operations enable row level security;
revoke all on public.external_operations from public, anon, authenticated;
grant select, insert, update, delete on public.external_operations to service_role;

create table public.workflow_facts (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  workflow_id uuid not null,
  fact_type text not null check (fact_type in (
    'eligible', 'policy_required_touch', 'founder_intervention', 'escalated',
    'grounded_answer', 'ai_resolved', 'fix_verified', 'cost_recorded'
  )),
  value_boolean boolean,
  value_numeric numeric,
  metadata_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  idempotency_key text not null,
  unique (workspace_id, idempotency_key)
);
create index workflow_facts_summary_idx on public.workflow_facts (workspace_id, occurred_at, fact_type, workflow_id);
alter table public.workflow_facts enable row level security;
create policy "members read workflow facts" on public.workflow_facts for select to authenticated using (public.is_workspace_member(workspace_id));
revoke all on public.workflow_facts from public, anon;
grant select on public.workflow_facts to authenticated;
grant select, insert on public.workflow_facts to service_role;

create table public.runner_heartbeats (
  worker_id text primary key check (char_length(worker_id) between 1 and 240),
  last_seen_at timestamptz not null,
  current_job_type text,
  current_job_id uuid,
  metadata_json jsonb not null default '{}'::jsonb
);
create index runner_heartbeats_seen_idx on public.runner_heartbeats (last_seen_at desc);
alter table public.runner_heartbeats enable row level security;
revoke all on public.runner_heartbeats from public, anon, authenticated;
grant select, insert, update, delete on public.runner_heartbeats to service_role;
