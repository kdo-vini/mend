-- Clientes: the Diagium client panel (replaces the Notion "Clientes" database).
--
-- clients        one row per client with the Notion properties (Cliente,
--                Contato, Email, Telefone, Site, Estágio, Notas, Produto), the
--                origin of the lead (manual, Diagnóstico de marca, agent,
--                import) and a rich markdown body split into `##` sections.
-- client_entries permanent timeline per client: notes, meetings, received
--                diagnósticos and stage changes. The Diário expires after 7
--                days, so client history lives here instead.
-- issues.client_id optional link from a chamado to a client.
--
-- Access: every member of the internal workspace reads; agent and above
-- create and edit; only owner/admin archive or delete. Service-role callers
-- (ingestion endpoint, MCP) bypass RLS and run their own checks.

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 200),
  contact text check (contact is null or length(contact) <= 200),
  email text check (email is null or length(email) <= 320),
  phone text check (phone is null or length(phone) <= 40),
  -- Digits only, for de-duplication by phone ("(11) 98765-4321" = "11987654321").
  phone_digits text generated always as (
    nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '')
  ) stored,
  site text check (site is null or length(site) <= 500),
  stage text not null default 'lead'
    check (stage in ('lead', 'proposta', 'ativo', 'churn')),
  -- Produto: what Diagium builds for the client. Every site already includes
  -- basic SEO (robots.txt, llms.txt); `sistema` and `integracao` go further.
  products text[] not null default '{}'
    check (products <@ array['site', 'sistema', 'integracao']::text[]),
  notes text check (notes is null or length(notes) <= 2000),
  body text not null default '' check (length(body) <= 100000),
  source text not null default 'manual'
    check (source in ('manual', 'diagnostico_marca', 'agente', 'importacao')),
  area text check (area is null or length(area) <= 120),
  specialty text check (specialty is null or length(specialty) <= 200),
  registration text check (registration is null or length(registration) <= 120),
  referral text check (referral is null or length(referral) <= 200),
  utm jsonb not null default '{}'::jsonb check (jsonb_typeof(utm) = 'object'),
  -- Idempotency key from the origin system (e.g. the diagnóstico id).
  external_id text check (external_id is null or length(external_id) between 1 and 200),
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, source, external_id)
);
create index clients_list on public.clients(workspace_id, updated_at desc);
create index clients_stage on public.clients(workspace_id, stage);
create index clients_phone on public.clients(workspace_id, phone_digits)
  where phone_digits is not null;

create table public.client_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  kind text not null default 'nota'
    check (kind in ('nota', 'reuniao', 'diagnostico', 'estagio')),
  title text check (title is null or length(trim(title)) between 1 and 200),
  body text not null default '' check (length(body) <= 100000),
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null check (length(trim(author_name)) between 1 and 200),
  -- Idempotency key from the origin system: one entry per diagnóstico id,
  -- whether it created the client or was attached to an existing one.
  external_id text check (external_id is null or length(external_id) between 1 and 200),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (workspace_id, client_id)
    references public.clients(workspace_id, id) on delete cascade,
  unique (workspace_id, kind, external_id)
);
create index client_entries_feed
  on public.client_entries(client_id, occurred_at desc);

alter table public.issues add column client_id uuid;
alter table public.issues
  add constraint issues_client_fk foreign key (workspace_id, client_id)
  references public.clients(workspace_id, id) on delete set null (client_id);
create index issues_client on public.issues(client_id) where client_id is not null;

-- updated_at, and archiving reserved to owner/admin for signed-in users.
create or replace function private.clients_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if current_user = 'authenticated'
    and new.archived_at is distinct from old.archived_at
    and not (new.workspace_id = any (private.member_workspace_ids(array['owner', 'admin'])))
  then
    raise exception 'only owner or admin can archive clients'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.clients_before_update() from public, anon;
create trigger clients_before_update
  before update on public.clients
  for each row execute function private.clients_before_update();

alter table public.clients enable row level security;
alter table public.client_entries enable row level security;
revoke all on public.clients, public.client_entries from public, anon, authenticated;

grant select, insert, delete on public.clients to authenticated;
grant update (
  name, contact, email, phone, site, stage, products, notes, body,
  area, specialty, registration, referral, archived_at
) on public.clients to authenticated;
grant select, insert, update, delete on public.clients to service_role;

grant select, insert, delete on public.client_entries to authenticated;
grant select, insert, update, delete on public.client_entries to service_role;

create policy clients_read on public.clients for select to authenticated
  using (workspace_id = any ((select private.member_workspace_ids())::uuid[]));
create policy clients_insert on public.clients for insert to authenticated
  with check (
    workspace_id = any ((select private.member_workspace_ids(array['owner', 'admin', 'agent']))::uuid[])
    and created_by = (select auth.uid())
  );
create policy clients_update on public.clients for update to authenticated
  using (workspace_id = any ((select private.member_workspace_ids(array['owner', 'admin', 'agent']))::uuid[]))
  with check (workspace_id = any ((select private.member_workspace_ids(array['owner', 'admin', 'agent']))::uuid[]));
create policy clients_delete on public.clients for delete to authenticated
  using (workspace_id = any ((select private.member_workspace_ids(array['owner', 'admin']))::uuid[]));

create policy client_entries_read on public.client_entries for select to authenticated
  using (workspace_id = any ((select private.member_workspace_ids())::uuid[]));
create policy client_entries_insert on public.client_entries for insert to authenticated
  with check (
    workspace_id = any ((select private.member_workspace_ids(array['owner', 'admin', 'agent']))::uuid[])
    and author_id = (select auth.uid())
  );
create policy client_entries_delete on public.client_entries for delete to authenticated
  using (
    author_id = (select auth.uid())
    or workspace_id = any ((select private.member_workspace_ids(array['owner', 'admin']))::uuid[])
  );
