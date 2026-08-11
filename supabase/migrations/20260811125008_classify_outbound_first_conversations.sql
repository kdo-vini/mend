-- A conversation created by an outbound WhatsApp echo has no customer action
-- waiting. Inbound ingestion already promotes the conversation to
-- needs_attention in inbox_ingest_message.
alter table public.conversations
  alter column attention_state set default 'none';

-- Repair only outbound-only conversations affected by the previous default.
-- Conversations with any inbound history keep their current workflow state.
update public.conversations as conversation
set attention_state = 'none'
where conversation.attention_state = 'needs_attention'
  and conversation.unread_count = 0
  and exists (
    select 1
    from public.messages as message
    where message.conversation_id = conversation.id
      and message.workspace_id = conversation.workspace_id
      and message.direction = 'outbound'
  )
  and not exists (
    select 1
    from public.messages as message
    where message.conversation_id = conversation.id
      and message.workspace_id = conversation.workspace_id
      and message.direction = 'inbound'
  );
