set local maintenance_work_mem = '96MB';

create index if not exists knowledge_chunks_embedding_ivfflat_idx
  on public.knowledge_chunks using ivfflat (embedding extensions.vector_cosine_ops)
  with (lists = 10)
  where embedding is not null;
