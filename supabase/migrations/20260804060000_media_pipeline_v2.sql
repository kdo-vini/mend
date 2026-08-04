create table if not exists public.media_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_by_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'created' check (status in ('created', 'uploading', 'processing', 'sending', 'sent', 'partial', 'failed')),
  total_count integer not null default 0 check (total_count between 0 and 10),
  total_bytes bigint not null default 0 check (total_bytes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  batch_id uuid references public.media_batches(id) on delete set null,
  original_storage_path text not null,
  original_file_name text not null,
  declared_mime_type text,
  detected_mime_type text,
  kind text not null check (kind in ('image', 'video', 'audio', 'document', 'archive', 'unknown')),
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'ready', 'failed', 'unsupported')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 200 * 1024 * 1024),
  width integer,
  height integer,
  duration_seconds integer,
  error_code text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.media_variants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  asset_id uuid not null references public.media_assets(id) on delete cascade,
  channel text not null default 'browser',
  purpose text not null check (purpose in ('original', 'browser', 'provider', 'preview')),
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (asset_id, channel, purpose)
);

create table if not exists public.media_send_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  batch_id uuid references public.media_batches(id) on delete set null,
  asset_id uuid not null references public.media_assets(id) on delete cascade,
  idempotency_key text not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'unknown')),
  provider_message_id text,
  message_id uuid references public.messages(id) on delete set null,
  error_code text,
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key)
);

alter table public.messages
  add column if not exists media_asset_id uuid references public.media_assets(id) on delete set null,
  add column if not exists media_batch_id uuid references public.media_batches(id) on delete set null,
  add column if not exists media_status text not null default 'ready'
    check (media_status in ('processing', 'ready', 'failed', 'unsupported')),
  add column if not exists media_error_code text;

create index if not exists media_assets_workspace_conversation_idx
  on public.media_assets (workspace_id, conversation_id, created_at);
create index if not exists media_variants_asset_idx
  on public.media_variants (workspace_id, asset_id);
create index if not exists messages_media_asset_idx
  on public.messages (workspace_id, media_asset_id);
create index if not exists media_send_requests_batch_idx
  on public.media_send_requests (workspace_id, batch_id, created_at);

alter table public.media_batches enable row level security;
alter table public.media_assets enable row level security;
alter table public.media_variants enable row level security;
alter table public.media_send_requests enable row level security;

revoke all on public.media_batches, public.media_assets, public.media_variants, public.media_send_requests from public, anon;
grant select, insert, update on public.media_batches, public.media_assets, public.media_variants, public.media_send_requests to authenticated;
grant select, insert, update, delete on public.media_batches, public.media_assets, public.media_variants, public.media_send_requests to service_role;

create policy "workspace members can access media batches" on public.media_batches
  for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy "workspace members can access media assets" on public.media_assets
  for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy "workspace members can access media variants" on public.media_variants
  for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy "workspace members can access media send requests" on public.media_send_requests
  for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'media_batches'
  ) then alter publication supabase_realtime add table public.media_batches; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'media_assets'
  ) then alter publication supabase_realtime add table public.media_assets; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'media_variants'
  ) then alter publication supabase_realtime add table public.media_variants; end if;
end $$;
