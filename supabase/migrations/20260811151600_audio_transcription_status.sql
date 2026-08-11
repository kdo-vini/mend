alter table public.messages
  add column if not exists transcription_status text
    check (transcription_status in ('processing', 'ready', 'failed')),
  add column if not exists transcription_error_code text;

create index if not exists messages_audio_transcription_backfill_idx
  on public.messages (workspace_id, created_at)
  where message_type = 'audio'
    and direction = 'inbound'
    and text is null
    and media_storage_path is not null;
