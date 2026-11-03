-- Diário: short daily work notes (usually written by Claude Code on request)
-- that teammates can read. Notes expire; reads hide expired rows and the
-- server purges them, so nothing lingers past its validity.
create table public.work_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check(length(trim(author_name)) between 1 and 200),
  title text not null check(length(trim(title)) between 1 and 200),
  body text not null check(length(trim(body)) between 1 and 8000),
  project text check(project is null or length(trim(project)) between 1 and 200),
  source text not null default 'claude' check(source in ('claude','manual')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  check(expires_at > created_at and expires_at <= created_at + interval '30 days')
);
create index work_logs_feed on public.work_logs(workspace_id, created_at desc);
create index work_logs_expiry on public.work_logs(expires_at);
alter table public.work_logs enable row level security;
revoke all on public.work_logs from public, anon, authenticated;
grant select, delete on public.work_logs to authenticated;
grant select, insert, delete on public.work_logs to service_role;
create policy work_logs_read on public.work_logs for select to authenticated
  using(private.workspace_member_role(workspace_id) is not null and expires_at > now());
create policy work_logs_delete on public.work_logs for delete to authenticated
  using(
    author_id = (select auth.uid())
    or private.workspace_member_role(workspace_id) in ('owner','admin')
  );

-- Personal tokens let a local Claude Code session post as its owner. Only the
-- SHA-256 hash is stored; the plain token is shown once at creation.
create table public.work_log_tokens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
  label text not null check(length(trim(label)) between 1 and 120),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index work_log_tokens_owner on public.work_log_tokens(user_id, created_at desc);
alter table public.work_log_tokens enable row level security;
revoke all on public.work_log_tokens from public, anon, authenticated;
grant select(id, workspace_id, user_id, label, created_at, last_used_at, revoked_at)
  on public.work_log_tokens to authenticated;
grant insert(workspace_id, user_id, token_hash, label) on public.work_log_tokens to authenticated;
grant update(revoked_at) on public.work_log_tokens to authenticated;
grant select, update(last_used_at) on public.work_log_tokens to service_role;
create policy work_log_tokens_read on public.work_log_tokens for select to authenticated
  using(user_id = (select auth.uid()));
create policy work_log_tokens_insert on public.work_log_tokens for insert to authenticated
  with check(
    user_id = (select auth.uid())
    and private.workspace_member_role(workspace_id) is not null
  );
create policy work_log_tokens_revoke on public.work_log_tokens for update to authenticated
  using(user_id = (select auth.uid()) and revoked_at is null)
  with check(user_id = (select auth.uid()) and revoked_at is not null);
