alter table public.knowledge_articles
  drop constraint if exists knowledge_articles_source_path_unique;

drop index if exists public.knowledge_articles_source_path_revision_uidx;

alter table public.knowledge_articles
  add constraint knowledge_articles_source_path_revision_unique
  unique (source_id, source_path, source_revision);
