create or replace function public.match_product_knowledge_chunks(
  p_workspace_id uuid,
  p_product_ids uuid[],
  p_query text,
  p_query_embedding extensions.vector(1536) default null,
  p_limit integer default 12,
  p_min_score real default 0.08
) returns table (
  chunk_id uuid,
  article_id uuid,
  article_title text,
  heading text,
  content text,
  lexical_score real,
  semantic_score real,
  hybrid_score real,
  article_version text,
  product_ids uuid[],
  source_id uuid,
  source_path text,
  source_revision text,
  source_kind text,
  trust_level text,
  audience text,
  repository_id uuid
) language sql stable security invoker set search_path = pg_catalog, public, extensions as $$
  with eligible as (
    select
      chunk.id as chunk_id,
      chunk.article_id,
      article.title as article_title,
      chunk.heading,
      chunk.content,
      chunk.article_version,
      article.source_id,
      article.source_path,
      article.source_revision,
      case when article.managed_by_sync then 'repository' else 'manual' end as source_kind,
      article.trust_level,
      article.audience,
      source.repository_id,
      coalesce(array_agg(distinct article_product.product_id)
        filter (where article_product.product_id is not null), '{}'::uuid[]) as product_ids,
      ts_rank_cd(chunk.search_document, websearch_to_tsquery('simple', p_query))::real as lexical_score,
      case when p_query_embedding is null or chunk.embedding is null then 0::real
        else greatest(0, 1 - (chunk.embedding <=> p_query_embedding))::real end as semantic_score
    from public.knowledge_chunks chunk
    join public.knowledge_articles article
      on article.id = chunk.article_id and article.workspace_id = chunk.workspace_id
    left join public.knowledge_article_products article_product
      on article_product.article_id = article.id and article_product.workspace_id = article.workspace_id
    left join public.knowledge_sources source
      on source.id = article.source_id and source.workspace_id = article.workspace_id
    where chunk.workspace_id = p_workspace_id
      and article.status = 'published'
      and article.audience = 'customer'
      and article.trust_level <> 'generated'
      and (
        (
          article.managed_by_sync = false
          and (
            not exists (
              select 1 from public.knowledge_article_products mapped
              where mapped.workspace_id = article.workspace_id and mapped.article_id = article.id
            )
            or article_product.product_id = any(coalesce(p_product_ids, '{}'::uuid[]))
          )
        )
        or (
          article.managed_by_sync = true
          and source.active_sha = article.source_revision
          and source.indexed_sha = source.active_sha
          and source.sync_state = 'ready'
          and exists (
            select 1 from public.support_product_repositories mapped_repo
            where mapped_repo.workspace_id = article.workspace_id
              and mapped_repo.repository_id = source.repository_id
              and mapped_repo.knowledge_enabled = true
              and mapped_repo.product_id = any(coalesce(p_product_ids, '{}'::uuid[]))
          )
        )
      )
    group by chunk.id, article.id, source.id
  ), ranked as (
    select eligible.*,
      (case when p_query_embedding is null then eligible.lexical_score
        else eligible.lexical_score * 0.45 + eligible.semantic_score * 0.55 end)::real as hybrid_score
    from eligible
  )
  select ranked.chunk_id, ranked.article_id, ranked.article_title, ranked.heading,
    ranked.content, ranked.lexical_score, ranked.semantic_score, ranked.hybrid_score,
    ranked.article_version, ranked.product_ids, ranked.source_id, ranked.source_path,
    ranked.source_revision, ranked.source_kind, ranked.trust_level, ranked.audience,
    ranked.repository_id
  from ranked
  where greatest(ranked.lexical_score, ranked.semantic_score) >= p_min_score
  order by ranked.hybrid_score desc, ranked.repository_id nulls first,
    ranked.article_id, ranked.chunk_id
  limit least(greatest(p_limit, 1), 20)
$$;

revoke all on function public.match_product_knowledge_chunks(uuid, uuid[], text, extensions.vector, integer, real) from public, anon;
grant execute on function public.match_product_knowledge_chunks(uuid, uuid[], text, extensions.vector, integer, real) to authenticated, service_role;
