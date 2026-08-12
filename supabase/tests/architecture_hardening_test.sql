begin;
select plan(5);

set local request.jwt.claims = '{"role":"service_role"}';

insert into public.workspaces (id, name, slug, issue_prefix) values
  ('10000000-0000-4000-8000-000000000001', 'Tenant A', 'hardening-a', 'HAA'),
  ('20000000-0000-4000-8000-000000000002', 'Tenant B', 'hardening-b', 'HBB');

insert into public.channel_connections (id, workspace_id, name, provider_instance_name) values
  ('11000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'A', 'hardening-instance-a'),
  ('22000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'B', 'hardening-instance-b');

select throws_ok(
  $$insert into public.contacts (workspace_id, channel_connection_id, phone_number, display_name)
    values ('10000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000002', '551100000001', 'Cross tenant')$$,
  '23503', null, 'inbox graph rejects a channel from another workspace'
);

insert into public.contacts (id, workspace_id, channel_connection_id, phone_number, display_name) values
  ('12000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', '551100000002', 'Tenant A');
insert into public.conversations (id, workspace_id, channel_connection_id, contact_id) values
  ('13000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001');
insert into public.issues (id, workspace_id, number, identifier, source, type, title, created_by) values
  ('14000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 'HAA-1', 'internal', 'bug', 'Tenant A issue', 'user');

select throws_ok(
  $$insert into public.issue_comments (workspace_id, issue_id, body)
    values ('20000000-0000-4000-8000-000000000002', '14000000-0000-4000-8000-000000000001', 'Cross tenant')$$,
  '23503', null, 'issue graph rejects a parent from another workspace'
);

insert into public.agent_runs (id, workspace_id, issue_id, mode, status) values
  ('15000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '14000000-0000-4000-8000-000000000001', 'investigate', 'queued');

select throws_ok(
  $$insert into public.agent_run_events (workspace_id, agent_run_id, event_type, message)
    values ('20000000-0000-4000-8000-000000000002', '15000000-0000-4000-8000-000000000001', 'progress', 'Cross tenant')$$,
  '23503', null, 'agent graph rejects a run from another workspace'
);

select throws_ok(
  $$insert into public.channel_connections (workspace_id, name, provider_instance_name)
    values ('20000000-0000-4000-8000-000000000002', 'Duplicate', 'hardening-instance-a')$$,
  '23505', null, 'provider instance identity is globally unique'
);

select ok(
  has_table_privilege('authenticated', 'public.webhook_quarantine_events', 'select') = false,
  'quarantined webhook digests are hidden from browser roles'
);

select * from finish();
rollback;
