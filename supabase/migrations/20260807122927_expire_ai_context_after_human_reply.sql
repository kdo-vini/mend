-- A human reply supersedes every active AI draft and the triage copy shown in
-- the inbox. Audit rows and the durable triage checkpoint remain available.
create or replace function private.pause_conversation_for_human(
  p_workspace_id uuid,
  p_conversation_id uuid,
  p_message_id uuid default null,
  p_actor_user_id uuid default null,
  p_reason text default 'human_message'
)
returns public.conversation_ai_state
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  state_row public.conversation_ai_state;
  reason text := case
    when p_reason in ('human_message', 'customer_requested_human', 'unsafe_intent', 'low_confidence', 'manual_pause')
      then p_reason
    else 'human_message'
  end;
begin
  insert into public.conversation_ai_state (
    workspace_id, conversation_id, automation_state, human_takeover_at,
    human_takeover_by, human_takeover_reason, last_human_message_id,
    last_decision, last_decision_reason, last_decision_at,
    needs_human, needs_human_reason, updated_at
  ) values (
    p_workspace_id, p_conversation_id, 'human_paused', now(), p_actor_user_id,
    reason, p_message_id, 'human_paused',
    'Human takeover paused AI automation.', now(), true,
    'Human takeover paused AI automation.', now()
  )
  on conflict (conversation_id) do update set
    automation_state = 'human_paused',
    human_takeover_at = coalesce(public.conversation_ai_state.human_takeover_at, now()),
    human_takeover_by = coalesce(p_actor_user_id, public.conversation_ai_state.human_takeover_by),
    human_takeover_reason = coalesce(reason, public.conversation_ai_state.human_takeover_reason),
    last_human_message_id = coalesce(p_message_id, public.conversation_ai_state.last_human_message_id),
    last_decision = 'human_paused',
    last_decision_reason = 'Human takeover paused AI automation.',
    last_decision_at = now(),
    latest_intent = case when p_message_id is null then public.conversation_ai_state.latest_intent end,
    latest_confidence = case when p_message_id is null then public.conversation_ai_state.latest_confidence end,
    current_summary = case when p_message_id is null then public.conversation_ai_state.current_summary end,
    needs_human = true,
    needs_human_reason = 'Human takeover paused AI automation.',
    updated_at = now()
  returning * into state_row;

  update public.ai_drafts
  set status = 'expired', updated_at = now()
  where workspace_id = p_workspace_id
    and conversation_id = p_conversation_id
    and status in ('pending_review', 'auto_eligible');

  return state_row;
end;
$$;

update public.ai_drafts as draft
set status = 'expired', updated_at = now()
where draft.status in ('pending_review', 'auto_eligible')
  and exists (
    select 1
    from public.conversation_ai_state as state
    where state.workspace_id = draft.workspace_id
      and state.conversation_id = draft.conversation_id
      and state.automation_state = 'human_paused'
  );

update public.conversation_ai_state
set latest_intent = null,
    latest_confidence = null,
    current_summary = null,
    updated_at = now()
where automation_state = 'human_paused'
  and last_human_message_id is not null;
