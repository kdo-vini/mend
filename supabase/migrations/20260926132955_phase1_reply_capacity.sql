-- Phase 1 reply capacity for production.
-- 1) New conversations default to safe_auto so the AI can send when policy allows.
-- 2) Lower safe_auto_min_confidence floor to 0.65 (reply-first; escalate only when blocked).
-- 3) Prefer generic_reply when MCP fails instead of forcing review queues.
-- 4) Keep billing on human_escalation (payment / renewal / cancel only).

alter table public.conversations
  alter column ai_mode set default 'safe_auto';

update public.conversations as c
set
  ai_mode = 'safe_auto',
  updated_at = timezone('utc', now())
where c.ai_mode = 'draft'
  and coalesce(c.status, 'open') = 'open'
  and not exists (
    select 1
    from public.conversation_ai_state as s
    where s.conversation_id = c.id
      and s.automation_state = 'human_paused'
  );

update public.workspaces
set
  ai_policy_json = jsonb_set(
    jsonb_set(
      jsonb_set(
        coalesce(ai_policy_json, '{}'::jsonb),
        '{safe_auto_min_confidence}',
        '0.65'::jsonb,
        true
      ),
      '{mcp_failure_policy}',
      '"generic_reply"'::jsonb,
      true
    ),
    '{automation_routes,billing}',
    '"human_escalation"'::jsonb,
    true
  ),
  updated_at = timezone('utc', now())
where true;
