-- Workspace-owned AI routing. The worker remains generic; each company chooses
-- what happens for every triage intent.
alter table public.workspaces
  alter column ai_policy_json set default '{
    "draft_enabled": true,
    "safe_auto_enabled": true,
    "safe_auto_min_confidence": 0.85,
    "safe_auto_send_enabled": false,
    "require_published_knowledge": true,
    "automation_routes": {
      "question": "knowledge_auto_reply",
      "how_to": "knowledge_auto_reply",
      "status": "knowledge_auto_reply",
      "bug": "bug_triage",
      "incident": "human_escalation",
      "billing": "knowledge_auto_reply",
      "feature": "human_escalation",
      "other": "human_escalation"
    },
    "automation_fallback_route": "human_escalation",
    "notify_on_human_escalation": true,
    "notify_on_bug": true,
    "bug_auto_reply_enabled": false,
    "bug_auto_fix_enabled": false,
    "bug_auto_deploy_enabled": false
  }'::jsonb;

update public.workspaces
set ai_policy_json = ai_policy_json || jsonb_build_object(
  'automation_routes', coalesce(
    ai_policy_json -> 'automation_routes',
    '{
      "question": "knowledge_auto_reply",
      "how_to": "knowledge_auto_reply",
      "status": "knowledge_auto_reply",
      "bug": "bug_triage",
      "incident": "human_escalation",
      "billing": "knowledge_auto_reply",
      "feature": "human_escalation",
      "other": "human_escalation"
    }'::jsonb
  ),
  'automation_fallback_route', coalesce(
    ai_policy_json -> 'automation_fallback_route',
    '"human_escalation"'::jsonb
  ),
  'notify_on_human_escalation', coalesce(
    ai_policy_json -> 'notify_on_human_escalation',
    'true'::jsonb
  ),
  'notify_on_bug', coalesce(ai_policy_json -> 'notify_on_bug', 'true'::jsonb),
  'bug_auto_reply_enabled', coalesce(
    ai_policy_json -> 'bug_auto_reply_enabled',
    'false'::jsonb
  ),
  'bug_auto_fix_enabled', coalesce(
    ai_policy_json -> 'bug_auto_fix_enabled',
    'false'::jsonb
  ),
  'bug_auto_deploy_enabled', coalesce(
    ai_policy_json -> 'bug_auto_deploy_enabled',
    'false'::jsonb
  )
)
where ai_policy_json is not null;
