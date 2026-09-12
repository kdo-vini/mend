drop index if exists public.knowledge_articles_source_path_uidx;

alter table public.knowledge_articles
  add constraint knowledge_articles_source_path_unique
  unique (source_id, source_path);
