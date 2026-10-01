-- Fase A / B1: Mend is the WhatsApp bridge. Every persisted inbound customer
-- message gets one append-only event the external Support bot polls through
-- GET /internal/support/events. Reply flags (ai_mode, automation_state) are
-- read live at poll time, so the row only stores routing identity.

create table if not exists public.support_inbound_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  remote_jid text not null,
  phone_number text,
  chat_type text,
  created_at timestamptz not null default now(),
  constraint support_inbound_events_message_unique unique (message_id)
);

create index if not exists support_inbound_events_workspace_cursor_idx
  on public.support_inbound_events (workspace_id, id);

-- Machine-only feed: never exposed to browser roles.
alter table public.support_inbound_events enable row level security;
revoke all on table public.support_inbound_events from public, anon, authenticated;
grant select, insert on table public.support_inbound_events to service_role;
