alter table public.knowledge_chunks
  add column embedding_model text;

create index knowledge_chunks_embedding_reuse_idx
  on public.knowledge_chunks(workspace_id, content_hash, embedding_model)
  where embedding is not null and embedding_model is not null;
