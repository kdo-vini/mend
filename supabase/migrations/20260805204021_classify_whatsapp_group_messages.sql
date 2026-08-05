alter table public.messages
  add column if not exists participant_name text;

update public.contacts
set provider_contact_id = phone_number || '@g.us'
where workspace_id = '0de88c1f-bb26-4fbc-bc65-f01a434eadda'
  and phone_number = '120363426966918405'
  and provider_contact_id is null;

update public.messages as message
set participant_name = contact.display_name
from public.conversations as conversation
join public.contacts as contact
  on contact.id = conversation.contact_id
 and contact.workspace_id = conversation.workspace_id
where message.conversation_id = conversation.id
  and message.workspace_id = conversation.workspace_id
  and contact.provider_contact_id like '%@g.us'
  and message.sender_type = 'contact'
  and message.participant_name is null;

alter table public.workspaces
  alter column ai_policy_json set default '{
    "draft_enabled": true,
    "safe_auto_enabled": true,
    "safe_auto_min_confidence": 0.85,
    "safe_auto_intents": ["question", "how_to", "status", "social"],
    "safe_auto_send_enabled": false,
    "require_published_knowledge": true,
    "automation_routes": {
      "question": "knowledge_auto_reply",
      "how_to": "knowledge_auto_reply",
      "status": "knowledge_auto_reply",
      "bug": "bug_triage",
      "incident": "human_escalation",
      "billing": "draft_for_review",
      "feature": "draft_for_review",
      "social": "safe_auto_reply",
      "other": "draft_for_review"
    },
    "automation_fallback_route": "draft_for_review",
    "notify_on_human_escalation": true,
    "notify_on_bug": true,
    "bug_auto_reply_enabled": false,
    "bug_auto_fix_enabled": false,
    "bug_auto_deploy_enabled": false
  }'::jsonb;

update public.workspaces
set ai_policy_json = coalesce(ai_policy_json, '{}'::jsonb) || jsonb_build_object(
      'safe_auto_send_enabled', true,
      'safe_auto_intents', '["question", "how_to", "status", "social"]'::jsonb,
      'automation_routes', coalesce(ai_policy_json -> 'automation_routes', '{}'::jsonb)
        || '{"social": "safe_auto_reply"}'::jsonb
    ),
    updated_at = now()
where id = '0de88c1f-bb26-4fbc-bc65-f01a434eadda';

update public.conversations
set ai_mode = 'safe_auto',
    updated_at = now()
where id = 'de373656-d81b-4830-92dc-515080ed5ded'
  and workspace_id = '0de88c1f-bb26-4fbc-bc65-f01a434eadda';
