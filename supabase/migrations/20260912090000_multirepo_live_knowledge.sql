create table public.support_products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  product_key text not null check (product_key ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  aliases text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, product_key),
  unique (id, workspace_id)
);

create table public.support_product_repositories (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  product_id uuid not null,
  repository_id uuid not null,
  repository_role text not null default 'primary'
    check (repository_role in ('primary', 'frontend', 'backend', 'mobile', 'docs', 'shared')),
  knowledge_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_id, repository_id),
  foreign key (product_id, workspace_id)
    references public.support_products(id, workspace_id) on delete cascade,
  foreign key (repository_id, workspace_id)
    references public.repositories(id, workspace_id) on delete cascade
);

create index support_product_repositories_workspace_repository_idx
  on public.support_product_repositories(workspace_id, repository_id)
  where knowledge_enabled = true;

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  repository_id uuid not null,
  source_type text not null default 'github_repository'
    check (source_type = 'github_repository'),
  ref_name text not null check (char_length(btrim(ref_name)) between 1 and 255),
  include_patterns jsonb not null default '["README.md","docs/**/*.md","docs/**/*.mdx","openapi*.json","src/i18n/locales/**/*.json"]'::jsonb
    check (jsonb_typeof(include_patterns) = 'array'),
  exclude_patterns jsonb not null default '["**/.env*","**/node_modules/**","**/dist/**","**/build/**","**/coverage/**","**/*.pem","**/*.key","**/*.p12","**/*.sqlite","**/*.db","**/secrets/**"]'::jsonb
    check (jsonb_typeof(exclude_patterns) = 'array'),
  sync_mode text not null default 'event' check (sync_mode in ('event', 'manual', 'paused')),
  observed_sha text,
  indexed_sha text,
  active_sha text,
  active_sha_source text check (active_sha_source in ('manual', 'github_deployment', 'dokploy', 'follow_ref')),
  sync_state text not null default 'idle'
    check (sync_state in ('idle', 'queued', 'running', 'ready', 'stale', 'failed')),
  last_error_code text,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, repository_id),
  unique (id, workspace_id),
  foreign key (repository_id, workspace_id)
    references public.repositories(id, workspace_id) on delete cascade,
  check (observed_sha is null or observed_sha ~ '^[a-f0-9]{40,64}$'),
  check (indexed_sha is null or indexed_sha ~ '^[a-f0-9]{40,64}$'),
  check (active_sha is null or active_sha ~ '^[a-f0-9]{40,64}$')
);

create table public.knowledge_sync_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_id uuid not null,
  requested_sha text not null check (requested_sha ~ '^[a-f0-9]{40,64}$'),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'superseded')),
  files_scanned integer not null default 0 check (files_scanned >= 0),
  files_indexed integer not null default 0 check (files_indexed >= 0),
  files_skipped integer not null default 0 check (files_skipped >= 0),
  chunks_written integer not null default 0 check (chunks_written >= 0),
  chunks_reused integer not null default 0 check (chunks_reused >= 0),
  embedding_input_count integer not null default 0 check (embedding_input_count >= 0),
  error_code text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_id, requested_sha),
  foreign key (source_id, workspace_id)
    references public.knowledge_sources(id, workspace_id) on delete cascade
);

alter table public.knowledge_articles
  add column source_id uuid,
  add column source_path text,
  add column source_revision text,
  add column managed_by_sync boolean not null default false,
  add column trust_level text not null default 'reviewed'
    check (trust_level in ('reviewed', 'deterministic', 'generated')),
  add column audience text not null default 'customer'
    check (audience in ('customer', 'internal')),
  add column source_metadata_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_metadata_json) = 'object'),
  add constraint knowledge_articles_source_workspace_fkey
    foreign key (source_id, workspace_id)
    references public.knowledge_sources(id, workspace_id) on delete cascade,
  add constraint knowledge_articles_managed_source_check check (
    managed_by_sync = false or (
      source_id is not null and
      nullif(btrim(source_path), '') is not null and
      source_revision ~ '^[a-f0-9]{40,64}$'
    )
  );

create unique index knowledge_articles_source_path_uidx
  on public.knowledge_articles(source_id, source_path)
  where managed_by_sync = true;

create table public.knowledge_article_products (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  article_id uuid not null,
  product_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (article_id, product_id),
  foreign key (article_id, workspace_id)
    references public.knowledge_articles(id, workspace_id) on delete cascade,
  foreign key (product_id, workspace_id)
    references public.support_products(id, workspace_id) on delete cascade
);

create index knowledge_article_products_workspace_product_idx
  on public.knowledge_article_products(workspace_id, product_id);

create table public.conversation_product_context (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null,
  product_id uuid not null,
  is_primary boolean not null default false,
  confidence real not null check (confidence between 0 and 1),
  resolution_source text not null
    check (resolution_source in ('manual', 'explicit_name', 'alias', 'retrieval')),
  last_message_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (conversation_id, product_id),
  foreign key (conversation_id, workspace_id)
    references public.conversations(id, workspace_id) on delete cascade,
  foreign key (product_id, workspace_id)
    references public.support_products(id, workspace_id) on delete cascade,
  foreign key (last_message_id, workspace_id)
    references public.messages(id, workspace_id) on delete set null (last_message_id)
);

create unique index conversation_product_context_primary_uidx
  on public.conversation_product_context(conversation_id)
  where is_primary = true;

create unique index knowledge_chunks_id_workspace_uidx
  on public.knowledge_chunks(id, workspace_id);

create table public.ai_draft_evidence (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  draft_id uuid not null,
  evidence_key text not null check (evidence_key ~ '^[a-z][a-z0-9_-]{1,31}:[a-zA-Z0-9:_-]{1,180}$'),
  source_kind text not null check (source_kind in ('manual', 'repository', 'repository_research')),
  knowledge_article_id uuid,
  knowledge_chunk_id uuid,
  product_id uuid,
  article_version text,
  source_revision text,
  source_path text,
  retrieval_score real check (retrieval_score is null or retrieval_score between 0 and 1),
  evidence_json jsonb not null check (jsonb_typeof(evidence_json) = 'object'),
  created_at timestamptz not null default now(),
  primary key (draft_id, evidence_key),
  foreign key (draft_id, workspace_id)
    references public.ai_drafts(id, workspace_id) on delete cascade,
  foreign key (knowledge_article_id, workspace_id)
    references public.knowledge_articles(id, workspace_id),
  foreign key (knowledge_chunk_id, workspace_id)
    references public.knowledge_chunks(id, workspace_id),
  foreign key (product_id, workspace_id)
    references public.support_products(id, workspace_id),
  check (
    (source_kind in ('manual', 'repository') and knowledge_article_id is not null and knowledge_chunk_id is not null)
    or (source_kind = 'repository_research' and knowledge_article_id is null and knowledge_chunk_id is null)
  )
);

create index ai_draft_evidence_article_idx
  on public.ai_draft_evidence(knowledge_article_id)
  where knowledge_article_id is not null;
create index ai_draft_evidence_product_idx
  on public.ai_draft_evidence(workspace_id, product_id)
  where product_id is not null;

alter table public.support_products enable row level security;
alter table public.support_product_repositories enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_sync_runs enable row level security;
alter table public.knowledge_article_products enable row level security;
alter table public.conversation_product_context enable row level security;
alter table public.ai_draft_evidence enable row level security;

create policy "members read support products" on public.support_products
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "members read product repositories" on public.support_product_repositories
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "members read knowledge sources" on public.knowledge_sources
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "members read knowledge sync runs" on public.knowledge_sync_runs
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "members read article products" on public.knowledge_article_products
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "members read conversation product context" on public.conversation_product_context
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "members read draft evidence" on public.ai_draft_evidence
  for select to authenticated using (public.is_workspace_member(workspace_id));

revoke all on public.support_products, public.support_product_repositories,
  public.knowledge_sources, public.knowledge_sync_runs,
  public.knowledge_article_products, public.conversation_product_context,
  public.ai_draft_evidence from public, anon, authenticated;
grant select on public.support_products, public.support_product_repositories,
  public.knowledge_sources, public.knowledge_sync_runs,
  public.knowledge_article_products, public.conversation_product_context,
  public.ai_draft_evidence to authenticated;
grant select, insert, update, delete on public.support_products,
  public.support_product_repositories, public.knowledge_sources,
  public.knowledge_sync_runs, public.knowledge_article_products,
  public.conversation_product_context, public.ai_draft_evidence to service_role;

comment on table public.support_products is 'Workspace-owned support product catalog used to scope knowledge retrieval.';
comment on table public.knowledge_sources is 'Versioned repository knowledge source; indexed and active revisions are deliberately separate.';
comment on table public.ai_draft_evidence is 'Immutable evidence snapshots actually cited by a support draft.';
