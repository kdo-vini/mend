-- Any human outbound reply pauses AI automation for that conversation.
-- This restores the original takeover rule after 20260805205046 narrowed it
-- to origin='app' only, which left WhatsApp fromMe (origin='whatsapp') active.
-- AI sends stay excluded via ai_generated=true (origin becomes 'ai').
create or replace function private.pause_after_human_message()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.direction = 'outbound'
     and not new.ai_generated then
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
