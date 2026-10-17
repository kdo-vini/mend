-- Whatsmiau `messages.edited` events rewrite the body of an existing message.
-- `edited_at` lets the inbox label the bubble as edited without a new table.
alter table public.messages
  add column if not exists edited_at timestamptz;

comment on column public.messages.edited_at is
  'When the provider last reported an edit of this message; null if never edited.';
