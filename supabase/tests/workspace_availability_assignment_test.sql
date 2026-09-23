begin;
select plan(14);

set local request.jwt.claims = '{"role":"service_role"}';

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner@availability.test', '', now(), '{}', '{}', now(), now()),
  ('a1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'agent-a@availability.test', '', now(), '{}', '{}', now(), now()),
  ('a1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'agent-b@availability.test', '', now(), '{}', '{}', now(), now()),
  ('a1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'agent-away@availability.test', '', now(), '{}', '{}', now(), now()),
  ('a1000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'viewer@availability.test', '', now(), '{}', '{}', now(), now()),
  ('b1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'other@availability.test', '', now(), '{}', '{}', now(), now());

insert into public.workspaces (id, name, slug, issue_prefix) values
  ('a2000000-0000-4000-8000-000000000001', 'Availability A', 'availability-a', 'AVA'),
  ('b2000000-0000-4000-8000-000000000001', 'Availability B', 'availability-b', 'AVB');

insert into public.workspace_members (workspace_id, user_id, role, is_active, created_at) values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'owner', true, '2026-01-01T00:00:00Z'),
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'agent', true, '2026-01-01T00:00:00Z'),
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003', 'agent', true, '2026-01-03T00:00:00Z'),
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000005', 'viewer', true, '2026-01-05T00:00:00Z'),
  ('b2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'agent', false, '2026-01-01T00:00:00Z'),
  ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'agent', true, '2026-01-02T00:00:00Z');

insert into public.workspace_members (workspace_id, user_id, role, created_at) values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000004', 'agent', '2026-01-04T00:00:00Z');

insert into public.channel_connections (id, workspace_id, name, provider_instance_name) values
  ('a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'A', 'availability-a'),
  ('b3000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'B', 'availability-b');
insert into public.contacts (id, workspace_id, channel_connection_id, phone_number, display_name) values
  ('a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', '551100000001', 'A'),
  ('b4000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', '551100000002', 'B');
insert into public.conversations (id, workspace_id, channel_connection_id, contact_id, assigned_user_id) values
  ('a5000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001'),
  ('a5000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002'),
  ('a5000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', null),
  ('a5000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', null),
  ('a5000000-0000-4000-8000-000000000005', 'a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', null),
  ('b5000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', null);

select is(
  (select is_active from public.workspace_members where workspace_id = 'a2000000-0000-4000-8000-000000000001' and user_id = 'a1000000-0000-4000-8000-000000000001'),
  true,
  'a member can be Active in one workspace'
);
select is(
  (select is_active from public.workspace_members where workspace_id = 'b2000000-0000-4000-8000-000000000001' and user_id = 'a1000000-0000-4000-8000-000000000001'),
  false,
  'availability is independent for each workspace membership'
);
select is(
  (select is_active from public.workspace_members where user_id = 'a1000000-0000-4000-8000-000000000004'),
  false,
  'new members default to Away'
);

select is(
  public.assign_unassigned_conversation('a2000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000003')->>'assignee_user_id',
  'a1000000-0000-4000-8000-000000000003',
  'assigns the eligible member with the lowest open-conversation load'
);
select is(
  public.assign_unassigned_conversation('a2000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000002')->>'status',
  'already_assigned',
  'preserves a pre-existing manual assignment'
);
select is(
  public.assign_unassigned_conversation('a2000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000004')->>'assignee_user_id',
  'a1000000-0000-4000-8000-000000000001',
  'breaks equal-load ties by workspace entry and member ID'
);
select is(
  public.assign_unassigned_conversation('a2000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000001')->>'status',
  'conversation_not_found',
  'refuses to route a conversation from another workspace'
);

update public.workspace_members set is_active = false
where workspace_id = 'a2000000-0000-4000-8000-000000000001' and user_id in (
  'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000003'
);
select is(
  public.assign_unassigned_conversation('a2000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000005')->>'status',
  'no_active_member',
  'leaves a chat in the queue when no member is active'
);
select is(
  public.assign_unassigned_conversation('a2000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000005')->>'status',
  'no_active_member',
  'safely retries the same pending conversation'
);
select is(
  (select count(*)::integer from public.notifications where workspace_id = 'a2000000-0000-4000-8000-000000000001' and kind = 'ai.assignment_waiting'),
  1,
  'deduplicates the no-active-member workspace alert'
);
select is(
  (select count(*)::integer from public.notifications where workspace_id = 'a2000000-0000-4000-8000-000000000001' and user_id = 'a1000000-0000-4000-8000-000000000003' and kind = 'ai.conversation_assigned'),
  1,
  'notifies the selected assignee'
);

select throws_ok(
  $$update public.conversations set assigned_user_id = 'a1000000-0000-4000-8000-000000000005' where id = 'a5000000-0000-4000-8000-000000000005'$$,
  '23514',
  'conversation_assignee_must_be_workspace_member',
  'database rejects a viewer as conversation assignee'
);

update public.workspace_members set role = 'viewer'
where workspace_id = 'a2000000-0000-4000-8000-000000000001' and user_id = 'a1000000-0000-4000-8000-000000000003';
select is(
  (select assigned_user_id from public.conversations where id = 'a5000000-0000-4000-8000-000000000003'),
  null::uuid,
  'changing an assignee to viewer returns their open conversations to the queue'
);

delete from public.workspace_members
where workspace_id = 'a2000000-0000-4000-8000-000000000001' and user_id = 'a1000000-0000-4000-8000-000000000002';
select is(
  (select assigned_user_id from public.conversations where id = 'a5000000-0000-4000-8000-000000000002'),
  null::uuid,
  'removing a member returns their open conversations to the queue'
);

select * from finish();
rollback;
