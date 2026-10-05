-- B1: the Support feed also carries human (founder/team) outbound messages so
-- Support sees what the human already told the customer, including audio STT.
-- Outbound events are read-only context: the API reports replyAllowed=false
-- for them. AI-generated outbound is never recorded. Existing rows are inbound.

alter table public.support_inbound_events
  add column if not exists direction text not null default 'inbound';

alter table public.support_inbound_events
  drop constraint if exists support_inbound_events_direction_check;

alter table public.support_inbound_events
  add constraint support_inbound_events_direction_check
  check (direction in ('inbound', 'outbound'));
