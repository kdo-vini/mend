begin;
select plan(10);

set local request.jwt.claims = '{"role":"service_role"}';

insert into public.workspaces (id, name, slug, issue_prefix) values
  ('31000000-0000-4000-8000-000000000001', 'Knowledge A', 'knowledge-a', 'KNA'),
  ('32000000-0000-4000-8000-000000000002', 'Knowledge B', 'knowledge-b', 'KNB');

insert into public.repositories (id, workspace_id, name, local_path) values
  ('31100000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'pdv-web', '/tmp/pdv-web'),
  ('32200000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000002', 'chat-web', '/tmp/chat-web');

insert into public.support_products (id, workspace_id, product_key, name, aliases) values
  ('31200000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'zelopdv', 'ZeloPDV', array['pdv','caixa']),
  ('32300000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000002', 'zelochat', 'ZeloChat', array['chat']);

select throws_ok(
  $$insert into public.support_products (workspace_id, product_key, name)
    values ('31000000-0000-4000-8000-000000000001', 'zelopdv', 'Duplicate')$$,
  '23505', null, 'product key is unique within a workspace'
);

select lives_ok(
  $$insert into public.support_products (workspace_id, product_key, name)
    values ('32000000-0000-4000-8000-000000000002', 'zelopdv', 'Same key elsewhere')$$,
  'product key may repeat in another workspace'
);

select throws_ok(
  $$insert into public.support_product_repositories (workspace_id, product_id, repository_id)
    values ('31000000-0000-4000-8000-000000000001', '31200000-0000-4000-8000-000000000001', '32200000-0000-4000-8000-000000000002')$$,
  '23503', null, 'product cannot link to another workspace repository'
);

insert into public.knowledge_sources (id, workspace_id, repository_id, ref_name) values
  ('31300000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', '31100000-0000-4000-8000-000000000001', 'main');

select throws_ok(
  $$insert into public.knowledge_sources (workspace_id, repository_id, ref_name)
    values ('32000000-0000-4000-8000-000000000002', '31100000-0000-4000-8000-000000000001', 'main')$$,
  '23503', null, 'source cannot link to another workspace repository'
);

select throws_ok(
  $$update public.knowledge_sources set indexed_sha = 'not-a-sha'
    where id = '31300000-0000-4000-8000-000000000001'$$,
  '23514', null, 'source rejects malformed revisions'
);

insert into public.knowledge_articles (id, workspace_id, title, body, status) values
  ('31400000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'Caixa', 'Como abrir o caixa', 'published');

select throws_ok(
  $$insert into public.knowledge_article_products (workspace_id, article_id, product_id)
    values ('31000000-0000-4000-8000-000000000001', '31400000-0000-4000-8000-000000000001', '32300000-0000-4000-8000-000000000002')$$,
  '23503', null, 'article cannot map to another workspace product'
);

select throws_ok(
  $$insert into public.knowledge_articles (workspace_id, title, body, managed_by_sync)
    values ('31000000-0000-4000-8000-000000000001', 'Managed', 'Missing source metadata', true)$$,
  '23514', null, 'managed article requires source metadata'
);

select is(
  (select count(*)::integer from public.knowledge_article_products where article_id = '31400000-0000-4000-8000-000000000001'),
  0, 'article with no product mappings is shared'
);

insert into public.channel_connections (id, workspace_id, name, provider_instance_name) values
  ('31500000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'Knowledge channel', 'knowledge-channel-a');
insert into public.contacts (id, workspace_id, channel_connection_id, phone_number, display_name) values
  ('31600000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', '31500000-0000-4000-8000-000000000001', '551100009999', 'Knowledge contact');
insert into public.conversations (id, workspace_id, channel_connection_id, contact_id) values
  ('31700000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', '31500000-0000-4000-8000-000000000001', '31600000-0000-4000-8000-000000000001');

insert into public.conversation_product_context (workspace_id, conversation_id, product_id, is_primary, confidence, resolution_source) values
  ('31000000-0000-4000-8000-000000000001', '31700000-0000-4000-8000-000000000001', '31200000-0000-4000-8000-000000000001', true, 1, 'manual');

insert into public.support_products (id, workspace_id, product_key, name) values
  ('31800000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'zelomenu', 'ZeloMenu');

select throws_ok(
  $$insert into public.conversation_product_context (workspace_id, conversation_id, product_id, is_primary, confidence, resolution_source)
    values ('31000000-0000-4000-8000-000000000001', '31700000-0000-4000-8000-000000000001', '31800000-0000-4000-8000-000000000001', true, 0.9, 'alias')$$,
  '23505', null, 'conversation has at most one primary product'
);

select ok(
  has_table_privilege('authenticated', 'public.support_products', 'select'),
  'authenticated members receive product read privilege'
);

select ok(
  has_table_privilege('authenticated', 'public.knowledge_sync_runs', 'insert') = false,
  'authenticated users cannot write sync runs'
);

select * from finish();
rollback;
