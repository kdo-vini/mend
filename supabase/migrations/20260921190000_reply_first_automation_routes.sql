-- Reply-first automation: reopen intents stuck on human escalation so the AI
-- can answer greetings and how-to by default. Incident stays escalated.
-- Founders can still block any intent manually in Settings → Automation.
update public.workspaces
set
  ai_policy_json = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  coalesce(ai_policy_json, '{}'::jsonb),
                  '{automation_routes,social}',
                  '"safe_auto_reply"'::jsonb,
                  true
                ),
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
          '{automation_routes,billing}',
          '"knowledge_auto_reply"'::jsonb,
          true
        ),
        '{automation_routes,feature}',
        '"safe_auto_reply"'::jsonb,
        true
      ),
      '{automation_routes,other}',
      '"safe_auto_reply"'::jsonb,
      true
    ),
    '{automation_fallback_route}',
    '"safe_auto_reply"'::jsonb,
    true
  ),
  updated_at = timezone('utc', now())
where true;
