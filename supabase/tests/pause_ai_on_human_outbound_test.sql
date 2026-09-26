begin;
select plan(4);

set local request.jwt.claims = '{"role":"service_role"}';

insert into public.workspaces (id, name, slug, issue_prefix)
values ('a1111111-1111-1111-1111-111111111111', 'Pause human outbound', 'pause-human-outbound', 'PHO');

insert into public.channel_connections (
  id, workspace_id, name, provider_instance_name
) values (
  'a2222222-2222-2222-2222-222222222222',
  'a1111111-1111-1111-1111-111111111111',
  'WhatsApp',
  'pause-human-outbound'
);

insert into public.contacts (
  id, workspace_id, channel_connection_id, provider_contact_id, phone_number, display_name
) values (
  'a3333333-3333-3333-3333-333333333333',
  'a1111111-1111-1111-1111-111111111111',
  'a2222222-2222-2222-2222-222222222222',
  '5511888888888@s.whatsapp.net',
  '5511888888888',
  'Customer'
);

insert into public.conversations (
  id, workspace_id, channel_connection_id, contact_id, ai_mode, unread_count
) values (
  'a4444444-4444-4444-4444-444444444444',
  'a1111111-1111-1111-1111-111111111111',
  'a2222222-2222-2222-2222-222222222222',
  'a3333333-3333-3333-3333-333333333333',
  'safe_auto',
  0
),
(
  'a4444444-4444-4444-4444-444444444445',
  'a1111111-1111-1111-1111-111111111111',
  'a2222222-2222-2222-2222-222222222222',
  'a3333333-3333-3333-3333-333333333333',
  'safe_auto',
  0
),
(
  'a4444444-4444-4444-4444-444444444446',
  'a1111111-1111-1111-1111-111111111111',
  'a2222222-2222-2222-2222-222222222222',
  'a3333333-3333-3333-3333-333333333333',
  'safe_auto',
  0
);

insert into public.conversation_ai_state (workspace_id, conversation_id, automation_state)
values
  ('a1111111-1111-1111-1111-111111111111', 'a4444444-4444-4444-4444-444444444444', 'ai_active'),
  ('a1111111-1111-1111-1111-111111111111', 'a4444444-4444-4444-4444-444444444445', 'ai_active'),
  ('a1111111-1111-1111-1111-111111111111', 'a4444444-4444-4444-4444-444444444446', 'ai_active');

-- Human reply from WhatsApp (fromMe echo) must pause AI.
insert into public.messages (
  id, workspace_id, conversation_id, channel_connection_id,
  provider_message_id, direction, sender_type, message_type, text, ai_generated
) values (
  'a5555555-5555-5555-5555-555555555555',
  'a1111111-1111-1111-1111-111111111111',
  'a4444444-4444-4444-4444-444444444444',
  'a2222222-2222-2222-2222-222222222222',
  'wa-human-fromme', 'outbound', 'system', 'text', 'Resposta humana no WhatsApp', false
);

select is(
  (select automation_state from public.conversation_ai_state where conversation_id = 'a4444444-4444-4444-4444-444444444444'),
  'human_paused',
  'whatsapp fromMe human outbound pauses AI'
);

select is(
  (select human_takeover_reason from public.conversation_ai_state where conversation_id = 'a4444444-4444-4444-4444-444444444444'),
  'human_message',
  'whatsapp human outbound records human_message reason'
);

-- Human reply from Mend UI must still pause AI.
insert into public.messages (
  id, workspace_id, conversation_id, channel_connection_id,
  provider_message_id, direction, sender_type, message_type, text, ai_generated
) values (
  'a5555555-5555-5555-5555-555555555556',
  'a1111111-1111-1111-1111-111111111111',
  'a4444444-4444-4444-4444-444444444445',
  'a2222222-2222-2222-2222-222222222222',
  'app-human', 'outbound', 'user', 'text', 'Resposta humana no Mend', false
);

select is(
  (select automation_state from public.conversation_ai_state where conversation_id = 'a4444444-4444-4444-4444-444444444445'),
  'human_paused',
  'app human outbound pauses AI'
);

-- AI outbound must not pause the conversation.
insert into public.messages (
  id, workspace_id, conversation_id, channel_connection_id,
  provider_message_id, direction, sender_type, message_type, text, ai_generated
) values (
  'a5555555-5555-5555-5555-555555555557',
  'a1111111-1111-1111-1111-111111111111',
  'a4444444-4444-4444-4444-444444444446',
  'a2222222-2222-2222-2222-222222222222',
  'ai-outbound', 'outbound', 'system', 'text', 'Resposta da IA', true
);

select is(
  (select automation_state from public.conversation_ai_state where conversation_id = 'a4444444-4444-4444-4444-444444444446'),
  'ai_active',
  'ai_generated outbound does not pause AI'
);

select * from finish();
rollback;
