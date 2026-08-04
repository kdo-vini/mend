-- Keep new workspaces useful without making every unknown customer message a
-- human escalation. Auto-send remains opt-in and published knowledge remains
-- the default safety boundary for knowledge-backed replies.
alter table public.workspaces
  alter column ai_policy_json set default '{
    "draft_enabled": true,
    "safe_auto_enabled": true,
    "safe_auto_min_confidence": 0.85,
    "safe_auto_intents": ["question", "how_to", "status"],
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
set ai_policy_json = '{
  "draft_enabled": true,
  "safe_auto_enabled": true,
  "safe_auto_min_confidence": 0.85,
  "safe_auto_intents": ["question", "how_to", "status"],
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
    "other": "draft_for_review"
  },
  "automation_fallback_route": "draft_for_review",
  "notify_on_human_escalation": true,
  "notify_on_bug": true,
  "bug_auto_reply_enabled": false,
  "bug_auto_fix_enabled": false,
  "bug_auto_deploy_enabled": false
}'::jsonb,
    updated_at = now()
where slug = 'techne';

update public.workspaces
set ai_policy_json = ai_policy_json || jsonb_build_object(
  'safe_auto_intents', coalesce(
    ai_policy_json -> 'safe_auto_intents',
    '["question", "how_to", "status"]'::jsonb
  )
)
where ai_policy_json is not null
  and not (ai_policy_json ? 'safe_auto_intents');
