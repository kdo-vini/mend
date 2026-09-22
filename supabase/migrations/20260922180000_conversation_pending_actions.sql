-- Pending catalog/write confirmations for Zelinho-style Sim/Não flows.
-- Service-role only: the live worker owns create/confirm/cancel.

create table if not exists public.conversation_pending_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  conversation_id uuid not null,
  owner_ref text,
  tool_name text not null check (char_length(tool_name) between 1 and 120),
  arguments_json jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'executed', 'cancelled', 'expired', 'failed')),
  summary text not null check (char_length(summary) between 1 and 2000),
  external_action_id text,
  result_json jsonb,
  idempotency_key text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversation_pending_actions_conversation_workspace_fkey
    foreign key (conversation_id, workspace_id)
    references public.conversations (id, workspace_id)
    on delete cascade
);

create unique index if not exists conversation_pending_actions_idempotency_uidx
  on public.conversation_pending_actions (workspace_id, idempotency_key);

create unique index if not exists conversation_pending_actions_one_pending_uidx
  on public.conversation_pending_actions (conversation_id)
  where status = 'pending';

create index if not exists conversation_pending_actions_lookup_idx
  on public.conversation_pending_actions (workspace_id, conversation_id, status, expires_at);

alter table public.conversation_pending_actions enable row level security;
revoke all on public.conversation_pending_actions from public, anon, authenticated;
grant select, insert, update, delete on public.conversation_pending_actions to service_role;
