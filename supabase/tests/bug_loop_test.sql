begin;
select plan(8);

set local request.jwt.claims = '{"role":"service_role"}';

insert into public.workspaces (id, name, slug, issue_prefix)
values ('11111111-1111-1111-1111-111111111111', 'Bug loop test', 'bug-loop-test', 'BUG');

insert into public.channel_connections (
  id, workspace_id, name, provider_instance_name
) values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'WhatsApp',
  'bug-loop-test'
);

insert into public.contacts (
  id, workspace_id, channel_connection_id, provider_contact_id, phone_number, display_name
) values (
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '5511999999999@s.whatsapp.net',
  '5511999999999',
  'Customer'
);

insert into public.conversations (
  id, workspace_id, channel_connection_id, contact_id, ai_mode, unread_count
) values (
  '44444444-4444-4444-4444-444444444444',
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  'draft',
  2
);

insert into public.messages (
  id, workspace_id, conversation_id, channel_connection_id,
  provider_message_id, direction, sender_type, message_type, text, created_at
) values
  (
    '55555555-5555-5555-5555-555555555555',
    '11111111-1111-1111-1111-111111111111',
    '44444444-4444-4444-4444-444444444444',
    '22222222-2222-2222-2222-222222222222',
    'provider-old', 'inbound', 'contact', 'text', 'Older complaint', now() - interval '1 minute'
  ),
  (
    '66666666-6666-6666-6666-666666666666',
    '11111111-1111-1111-1111-111111111111',
    '44444444-4444-4444-4444-444444444444',
    '22222222-2222-2222-2222-222222222222',
    'provider-latest', 'inbound', 'contact', 'text', 'Latest complaint', now()
  );

insert into public.conversation_ai_state (
  workspace_id, conversation_id, automation_state
) values (
  '11111111-1111-1111-1111-111111111111',
  '44444444-4444-4444-4444-444444444444',
  'human_paused'
);

do $$
begin
  perform public.resume_conversation_ai(
    '11111111-1111-1111-1111-111111111111',
    '44444444-4444-4444-4444-444444444444'
  );
  perform public.resume_conversation_ai(
    '11111111-1111-1111-1111-111111111111',
    '44444444-4444-4444-4444-444444444444'
  );
end
$$;

select is(
  (select count(*)::integer from public.jobs where workspace_id = '11111111-1111-1111-1111-111111111111' and type = 'mend.process_inbound_message'),
  1,
  'repeated resume enqueues one active catch-up job'
);
select is(
  (select payload ->> 'stage' from public.jobs where workspace_id = '11111111-1111-1111-1111-111111111111' and type = 'mend.process_inbound_message'),
  'process_inbound_message',
  'catch-up payload uses the worker stage discriminator'
);
select is(
  (select payload #>> '{persisted,id}' from public.jobs where workspace_id = '11111111-1111-1111-1111-111111111111' and type = 'mend.process_inbound_message'),
  '66666666-6666-6666-6666-666666666666',
  'catch-up chooses the newest untriaged inbound message'
);
select is(
  (select payload #>> '{message,raw,source}' from public.jobs where workspace_id = '11111111-1111-1111-1111-111111111111' and type = 'mend.process_inbound_message'),
  'resume_catch_up',
  'catch-up payload is parseable as a normalized worker message'
);

insert into public.issues (
  id, workspace_id, number, identifier, conversation_id, contact_id,
  source, type, title, created_by
) values (
  '77777777-7777-7777-7777-777777777777',
  '11111111-1111-1111-1111-111111111111',
  1,
  'BUG-1',
  '44444444-4444-4444-4444-444444444444',
  '33333333-3333-3333-3333-333333333333',
  'ai',
  'bug',
  'Checkout fails',
  'ai'
);

insert into public.bug_cases (
  id, workspace_id, issue_id, conversation_id, signal_message_id
) values (
  '88888888-8888-8888-8888-888888888888',
  '11111111-1111-1111-1111-111111111111',
  '77777777-7777-7777-7777-777777777777',
  '44444444-4444-4444-4444-444444444444',
  '66666666-6666-6666-6666-666666666666'
);

do $$
begin
  perform public.advance_bug_case(
    p_workspace_id => '11111111-1111-1111-1111-111111111111',
    p_bug_case_id => '88888888-8888-8888-8888-888888888888',
    p_stage => 'suspicion',
    p_event_type => 'suspicion.scored',
    p_message => 'Suspicion scored',
    p_idempotency_key => 'same-transition'
  );
  perform public.advance_bug_case(
    p_workspace_id => '11111111-1111-1111-1111-111111111111',
    p_bug_case_id => '88888888-8888-8888-8888-888888888888',
    p_stage => 'failed',
    p_event_type => 'different.retry.payload',
    p_message => 'This retry must not overwrite state',
    p_idempotency_key => 'same-transition',
    p_status => 'failed'
  );
end
$$;

select is(
  (select count(*)::integer from public.bug_case_events where bug_case_id = '88888888-8888-8888-8888-888888888888'),
  1,
  'a repeated transition key appends one event'
);
select is(
  (select stage from public.bug_cases where id = '88888888-8888-8888-8888-888888888888'),
  'suspicion',
  'a repeated transition key cannot mutate the checkpoint'
);
select is(
  (select jsonb_typeof(evidence_json) from public.bug_cases where id = '88888888-8888-8888-8888-888888888888'),
  'array',
  'bug evidence uses the canonical list shape'
);

insert into public.repositories (
  workspace_id, name, local_path
) values (
  '11111111-1111-1111-1111-111111111111',
  'repo',
  '/tmp/repo'
);
select is(
  (select agent_provider || ':' || execution_plane from public.repositories where name = 'repo'),
  'codex:local_cli',
  'repository execution defaults remain backwards compatible'
);

select * from finish();
rollback;
