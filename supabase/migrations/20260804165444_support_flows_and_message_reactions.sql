-- Per-conversation checkpoint for the configurable WhatsApp support flow.
-- The flow definition itself lives in channel_connections.settings_json so
-- existing channel RLS and the one-channel-per-instance model remain intact.
alter table public.conversations
  add column if not exists support_flow_state_json jsonb not null default '{}'::jsonb;

alter table public.channel_connections
  add column if not exists history_sync_progress integer not null default 100
    check (history_sync_progress between 0 and 100),
  add column if not exists history_sync_complete boolean not null default true,
  add column if not exists history_sync_updated_at timestamptz;

create index if not exists conversations_support_flow_state_idx
  on public.conversations (workspace_id, channel_connection_id, updated_at desc)
  where support_flow_state_json <> '{}'::jsonb;
