/* global console */
// Runs the Clientes migration on an in-memory Postgres (PGlite) and checks
// its RLS, constraints and the issues link. `npm run test:clients-db`.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { URL } from "node:url";

const db = new PGlite();
const workspace = "11111111-1111-4111-8111-111111111111";
const foreignWorkspace = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const viewer = "22222222-2222-4222-8222-222222222222";
const agent = "33333333-3333-4333-8333-333333333333";
const admin = "44444444-4444-4444-8444-444444444444";
const foreignOwner = "55555555-5555-4555-8555-555555555555";
const issue = "66666666-6666-4666-8666-666666666666";

await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create schema auth;
  create schema private;
  grant usage on schema auth, private to authenticated, service_role;
  create function auth.uid() returns uuid language sql as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
  $$;
  create table auth.users(id uuid primary key);
  create table public.workspaces(id uuid primary key);
  create table public.workspace_members(
    workspace_id uuid not null, user_id uuid not null, role text not null,
    primary key(workspace_id,user_id)
  );
  create table public.internal_workspace(workspace_id uuid not null);
  create table public.issues(
    id uuid primary key,
    workspace_id uuid not null references public.workspaces(id)
  );
  grant select, update on public.issues to authenticated;
  insert into auth.users values ('${viewer}'),('${agent}'),('${admin}'),('${foreignOwner}');
  insert into public.workspaces values ('${workspace}'),('${foreignWorkspace}');
  insert into public.internal_workspace values ('${workspace}');
  insert into public.workspace_members values
    ('${workspace}','${viewer}','viewer'),
    ('${workspace}','${agent}','agent'),
    ('${workspace}','${admin}','admin'),
    ('${foreignWorkspace}','${foreignOwner}','owner');
  insert into public.issues values ('${issue}','${workspace}');
  create function private.member_workspace_ids(allowed_roles text[] default null)
  returns uuid[] language sql stable security definer set search_path = '' as $$
    select coalesce(array_agg(wm.workspace_id), '{}'::uuid[])
    from public.workspace_members wm
    join public.internal_workspace iw on iw.workspace_id = wm.workspace_id
    where wm.user_id = (select auth.uid())
      and (allowed_roles is null or wm.role = any (allowed_roles));
  $$;
  grant execute on function private.member_workspace_ids(text[]) to authenticated, service_role;
`);

await db.exec(
  readFileSync(
    new URL("../supabase/migrations/20261105120000_clients.sql", import.meta.url),
    "utf8",
  ),
);

async function as(user, fn) {
  await db.exec(`set role authenticated;
    select set_config('request.jwt.claim.sub','${user}',false);`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role;");
  }
}
async function rejects(promise, pattern) {
  await assert.rejects(promise, pattern);
}

// Agents create clients; the phone is normalized for de-duplication.
const created = await as(agent, () =>
  db.query(
    `insert into public.clients(workspace_id,name,phone,products,created_by)
     values ($1,'Dra. Helena','(11) 98765-4321','{site,integracao}',$2)
     returning id, phone_digits, stage`,
    [workspace, agent],
  ),
);
const clientId = created.rows[0].id;
assert.equal(created.rows[0].phone_digits, "11987654321");
assert.equal(created.rows[0].stage, "lead");

// Unknown stage or product fails.
await rejects(
  as(agent, () =>
    db.query(
      `insert into public.clients(workspace_id,name,stage,created_by) values ($1,'X','ganho',$2)`,
      [workspace, agent],
    ),
  ),
  /check/,
);
await rejects(
  as(agent, () =>
    db.query(
      `insert into public.clients(workspace_id,name,products,created_by) values ($1,'X','{app}',$2)`,
      [workspace, agent],
    ),
  ),
  /check/,
);

// Viewers read but cannot write.
const seen = await as(viewer, () => db.query("select id from public.clients"));
assert.equal(seen.rows.length, 1);
await rejects(
  as(viewer, () =>
    db.query(
      `insert into public.clients(workspace_id,name,created_by) values ($1,'X',$2)`,
      [workspace, viewer],
    ),
  ),
  /row-level security/,
);
const viewerUpdate = await as(viewer, () =>
  db.query(`update public.clients set stage='ativo' where id=$1 returning id`, [clientId]),
);
assert.equal(viewerUpdate.rows.length, 0);

// Other workspaces see nothing.
const foreign = await as(foreignOwner, () => db.query("select id from public.clients"));
assert.equal(foreign.rows.length, 0);

// Agents edit; updated_at moves.
const edited = await as(agent, () =>
  db.query(
    `update public.clients set stage='proposta' where id=$1 returning stage`,
    [clientId],
  ),
);
assert.equal(edited.rows[0].stage, "proposta");

// Only owner/admin archive.
await rejects(
  as(agent, () =>
    db.query(`update public.clients set archived_at=now() where id=$1`, [clientId]),
  ),
  /only owner or admin/,
);
const archived = await as(admin, () =>
  db.query(
    `update public.clients set archived_at=now() where id=$1 returning archived_at`,
    [clientId],
  ),
);
assert.ok(archived.rows[0].archived_at);

// Service role ignores the archive check and sets columns users cannot.
await db.exec("set role service_role;");
await db.query(`update public.clients set archived_at=null, external_id='d1', source='diagnostico_marca' where id=$1`, [clientId]);
await rejects(
  db.query(
    `insert into public.clients(workspace_id,name,source,external_id) values ($1,'Y','diagnostico_marca','d1')`,
    [workspace],
  ),
  /duplicate key/,
);
await db.exec("reset role;");

// Users cannot set external_id or source on update (column grants).
await rejects(
  as(agent, () =>
    db.query(`update public.clients set external_id='x' where id=$1`, [clientId]),
  ),
  /permission denied/,
);

// Timeline entries: agents write as themselves; viewers cannot.
await as(agent, () =>
  db.query(
    `insert into public.client_entries(workspace_id,client_id,kind,body,author_id,author_name)
     values ($1,$2,'reuniao','Topou reunião',$3,'Agente')`,
    [workspace, clientId, agent],
  ),
);
await rejects(
  as(agent, () =>
    db.query(
      `insert into public.client_entries(workspace_id,client_id,body,author_id,author_name)
       values ($1,$2,'x',$3,'Outro')`,
      [workspace, clientId, admin],
    ),
  ),
  /row-level security/,
);
await rejects(
  as(viewer, () =>
    db.query(
      `insert into public.client_entries(workspace_id,client_id,body,author_id,author_name)
       values ($1,$2,'x',$3,'Viewer')`,
      [workspace, clientId, viewer],
    ),
  ),
  /row-level security/,
);
// An entry cannot point at a client of another workspace.
await db.exec("set role service_role;");
await rejects(
  db.query(
    `insert into public.client_entries(workspace_id,client_id,body,author_name)
     values ($1,$2,'x','Sistema')`,
    [foreignWorkspace, clientId],
  ),
  /foreign key/,
);
await db.exec("reset role;");

// Issues link to clients and keep their workspace when the client goes.
await as(agent, () =>
  db.query(`update public.issues set client_id=$1 where id=$2`, [clientId, issue]),
);
await rejects(
  as(agent, () =>
    db.query(`delete from public.clients where id=$1`, [clientId]).then((r) => {
      if (r.affectedRows === 0) throw new Error("row-level security: not deleted");
    }),
  ),
  /row-level security/,
);
await as(admin, () => db.query(`delete from public.clients where id=$1`, [clientId]));
const unlinked = await db.query(`select workspace_id, client_id from public.issues where id=$1`, [issue]);
assert.equal(unlinked.rows[0].client_id, null);
assert.equal(unlinked.rows[0].workspace_id, workspace);
const entries = await db.query("select count(*)::int as n from public.client_entries");
assert.equal(entries.rows[0].n, 0);

console.log("clients migration: ok");
