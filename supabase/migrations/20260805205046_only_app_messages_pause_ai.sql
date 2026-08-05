-- Messages sent from the Mend UI explicitly hand the conversation to a human.
-- Provider echoes from the connected WhatsApp account remain visible in the
-- timeline but do not permanently disable the workspace's automation policy.
create or replace function private.pause_after_human_message()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.direction = 'outbound'
     and not new.ai_generated
     and new.origin = 'app' then
    perform private.pause_conversation_for_human(
      new.workspace_id, new.conversation_id, new.id, new.sent_by_user_id, 'human_message'
    );
    insert into public.audit_log (
      workspace_id, actor_user_id, action, entity_type, entity_id, metadata_json
    ) values (
      new.workspace_id, new.sent_by_user_id, 'ai.human_takeover', 'conversation', new.conversation_id,
      jsonb_build_object('message_id', new.id, 'origin', new.origin)
    );
  end if;
  return new;
end;
$$;

update public.conversations
set ai_mode = 'safe_auto',
    updated_at = now()
where id = 'de373656-d81b-4830-92dc-515080ed5ded'
  and workspace_id = '0de88c1f-bb26-4fbc-bc65-f01a434eadda';

update public.conversation_ai_state
set automation_state = 'ai_active',
    human_takeover_at = null,
    human_takeover_by = null,
    human_takeover_reason = null,
    last_decision = null,
    last_decision_reason = null,
    last_decision_at = now(),
    latest_intent = null,
    latest_confidence = null,
    current_summary = null,
    paused_until = null,
    needs_human = false,
    needs_human_reason = null,
    updated_at = now()
where conversation_id = 'de373656-d81b-4830-92dc-515080ed5ded'
  and workspace_id = '0de88c1f-bb26-4fbc-bc65-f01a434eadda';

update public.ai_drafts
set status = 'expired',
    updated_at = now()
where conversation_id = 'de373656-d81b-4830-92dc-515080ed5ded'
  and workspace_id = '0de88c1f-bb26-4fbc-bc65-f01a434eadda'
  and status = 'pending_review';
