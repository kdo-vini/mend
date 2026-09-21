-- Keep how-to / question / status on published-knowledge auto-reply so the
-- Support AI can teach customers instead of escalating those intents by default.
update public.workspaces
set
  ai_policy_json = jsonb_set(
    jsonb_set(
      jsonb_set(
        coalesce(ai_policy_json, '{}'::jsonb),
        '{automation_routes,question}',
        '"knowledge_auto_reply"'::jsonb,
        true
      ),
      '{automation_routes,how_to}',
      '"knowledge_auto_reply"'::jsonb,
      true
    ),
    '{automation_routes,status}',
    '"knowledge_auto_reply"'::jsonb,
    true
  ),
  updated_at = timezone('utc', now())
where coalesce(ai_policy_json -> 'automation_routes' ->> 'how_to', '')
    is distinct from 'knowledge_auto_reply'
   or coalesce(ai_policy_json -> 'automation_routes' ->> 'question', '')
    is distinct from 'knowledge_auto_reply'
   or coalesce(ai_policy_json -> 'automation_routes' ->> 'status', '')
    is distinct from 'knowledge_auto_reply';
