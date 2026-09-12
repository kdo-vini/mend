drop index if exists public.knowledge_articles_source_path_uidx;

create unique index knowledge_articles_source_path_revision_uidx
  on public.knowledge_articles(source_id, source_path, source_revision)
  where managed_by_sync = true;

create index knowledge_articles_source_current_idx
  on public.knowledge_articles(workspace_id, source_id, source_revision)
  where managed_by_sync = true and status = 'published';

comment on index public.knowledge_articles_source_path_revision_uidx is
  'Keeps old active and new indexed revisions side by side until activation succeeds.';
