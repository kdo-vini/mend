-- Persist the outcome of the latest automation run so the inbox can explain
-- whether AI drafted, replied, was blocked, or yielded to a human.
alter table public.conversation_ai_state
  add column if not exists last_decision text,
  add column if not exists last_decision_reason text,
  add column if not exists last_decision_at timestamptz;

alter table public.conversation_ai_state
  drop constraint if exists conversation_ai_state_last_decision_check;

alter table public.conversation_ai_state
  add constraint conversation_ai_state_last_decision_check
  check (last_decision in ('draft', 'auto_reply', 'blocked', 'human_paused'));

create index if not exists conversation_ai_state_last_decision_idx
  on public.conversation_ai_state (workspace_id, last_decision, last_decision_at desc);

update public.conversation_ai_state
set last_decision = case
      when automation_state = 'human_paused' then 'human_paused'
      when needs_human and coalesce(needs_human_reason, '') ilike '%draft%' then 'draft'
      when needs_human then 'blocked'
      else null
    end,
    last_decision_reason = coalesce(needs_human_reason, last_decision_reason),
    last_decision_at = coalesce(last_triaged_at, updated_at, now())
where last_decision is null;

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
  reason text := case when p_reason in ('human_message', 'customer_requested_human', 'unsafe_intent', 'low_confidence', 'manual_pause') then p_reason else 'human_message' end;
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
    needs_human = true,
    needs_human_reason = 'Human takeover paused AI automation.',
    updated_at = now()
  returning * into state_row;
  return state_row;
end;
$$;

create or replace function public.resume_conversation_ai(
  p_workspace_id uuid,
  p_conversation_id uuid
)
returns public.conversation_ai_state
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare state_row public.conversation_ai_state;
begin
  if auth.uid() is null and current_user <> 'service_role' then
    raise exception 'authentication_required';
  end if;
  if current_user <> 'service_role' and not public.is_workspace_member(p_workspace_id) then
    raise exception 'workspace_access_denied';
  end if;
  if not exists (
    select 1 from public.conversations
    where id = p_conversation_id and workspace_id = p_workspace_id
  ) then
    raise exception 'conversation_not_found';
  end if;
  update public.conversation_ai_state
  set automation_state = 'ai_active',
      human_takeover_at = null,
      human_takeover_by = null,
      human_takeover_reason = null,
      last_decision = null,
      last_decision_reason = null,
      last_decision_at = now(),
      paused_until = null,
      needs_human = false,
      needs_human_reason = null,
      updated_at = now()
  where workspace_id = p_workspace_id and conversation_id = p_conversation_id
  returning * into state_row;
  if state_row.id is null then
    insert into public.conversation_ai_state (workspace_id, conversation_id, automation_state)
    values (p_workspace_id, p_conversation_id, 'ai_active')
    returning * into state_row;
  end if;
  insert into public.audit_log (workspace_id, actor_user_id, action, entity_type, entity_id, metadata_json)
  values (p_workspace_id, auth.uid(), 'ai.resumed', 'conversation', p_conversation_id, jsonb_build_object('automation_state', 'ai_active'));
  return state_row;
end;
$$;
