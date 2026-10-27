/* global console */
// Executes the WHOLE supabase/migrations chain on a fresh PGlite (after a
// minimal Supabase stub prelude) and asserts the behaviour of the inbox
// history/read-up-to, job-lane and security/role-check migrations.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readdirSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { URL } from "node:url";

const db = new PGlite({ extensions: { pgcrypto } });

// PGlite has no pgvector: model the type as a domain over real[] plus a
// dummy <=> operator, and skip the ivfflat index (needs the real extension).
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema extensions;
  create schema auth;
  create schema storage;
  grant usage on schema extensions, auth, storage to anon, authenticated, service_role;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create function auth.role() returns text language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
  $$;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  create table auth.users(
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb default '{}',
    created_at timestamptz default now()
  );
  create table storage.buckets(
    id text primary key, name text, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects(
    id uuid primary key default gen_random_uuid(),
    bucket_id text, name text, owner uuid, metadata jsonb
  );
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[]
    language sql as $$ select string_to_array(name, '/') $$;
  -- Supabase grants new public objects to the API roles by default.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  create publication supabase_realtime;
  create domain extensions.vector as real[];
  create function extensions.vec_cos(a real[], b real[]) returns float8
    language sql as $$ select 0::float8 $$;
  create operator extensions.<=> (
    leftarg = real[], rightarg = real[], function = extensions.vec_cos
  );
`);

const migrationsDir = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();
for (const f of files) {
  const sql = readFileSync(new URL(f, migrationsDir), "utf8")
    .replace(/create extension if not exists vector[^;]*;/gi, "")
    .replace(/extensions\.vector\(\d+\)/g, "extensions.vector")
    .replace(/create index[^;]*ivfflat[^;]*;/gi, "");
  // A production-only data migration expects this workspace to already exist.
  if (f.startsWith("20260804181939")) {
    await db.exec(
      "insert into public.workspaces(id,name,slug) values ('0de88c1f-bb26-4fbc-bc65-f01a434eadda','Techne','techne')",
    );
  }
  try {
    await db.exec(sql);
  } catch (error) {
    throw new Error(`migration ${f} failed: ${error.message}`, {
      cause: error,
    });
  }
}
console.log(`applied ${files.length} migrations`);

const W = "0de88c1f-bb26-4fbc-bc65-f01a434eadda"; // the single internal workspace
const owner = "aaaaaaa1-0000-4000-8000-000000000001";
const owner2 = "aaaaaaa2-0000-4000-8000-000000000002";
const admin = "aaaaaaa3-0000-4000-8000-000000000003";
const viewer = "aaaaaaa4-0000-4000-8000-000000000004";
const agentUser = "aaaaaaa5-0000-4000-8000-000000000005";
const CC = "cccccccc-0000-4000-8000-000000000001";

const asRole = async (role, user) => {
  await db.exec(`reset role; set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
    user ?? "",
  ]);
};
const asSuper = async () => {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
};
const q = async (sql, params) => (await db.query(sql, params)).rows;
const rejects = async (fn, pattern, label) => {
  try {
    await fn();
  } catch (error) {
    assert.match(String(error.message), pattern, label);
    return;
  }
  assert.fail(`${label}: expected failure`);
};

await db.exec(`
  insert into auth.users(id,email) values
    ('${owner}','o@x'),('${owner2}','o2@x'),('${admin}','a@x'),('${viewer}','v@x'),('${agentUser}','ag@x');
  insert into public.internal_workspace(workspace_id) values ('${W}') on conflict do nothing;
  insert into public.workspace_members(workspace_id,user_id,role) values
    ('${W}','${owner}','owner'),('${W}','${admin}','admin'),('${W}','${viewer}','viewer'),('${W}','${agentUser}','agent');
  insert into public.channel_connections(id,workspace_id,name,provider_instance_name)
    values ('${CC}','${W}','c','inst');
`);

let seq = 0;
const ingest = async (phone, ts, history = false) => {
  seq += 1;
  const rows = await q(
    `select public.inbox_ingest_message(
       p_workspace_id => $1, p_channel_connection_id => $2, p_phone_number => $3,
       p_display_name => 'N', p_provider_contact_id => null,
       p_provider_message_id => $4, p_direction => 'inbound',
       p_sender_type => 'contact', p_message_type => 'text', p_text => 'hi',
       p_provider_timestamp => $5, p_is_history => $6) as r`,
    [W, CC, phone, `pm-${phone}-${seq}`, ts, history],
  );
  return rows[0].r;
};
const conv = async (id) =>
  (await q("select * from public.conversations where id=$1", [id]))[0];

// ---- 1. inbox_ingest_message ------------------------------------------------
await asRole("service_role");
const T0 = "2026-10-01T10:00:00Z";
const T1 = "2026-10-01T11:00:00Z";
const T2 = "2026-10-01T12:00:00Z";

// 1a. normal inbound bumps unread / attention and reopens a resolved thread.
let r = await ingest("5511900000001", T1);
assert.equal(r.inserted, true);
const c1 = r.conversation_id;
assert.equal((await conv(c1)).unread_count, 1);
assert.equal((await conv(c1)).attention_state, "needs_attention");
await asSuper();
await db.query(
  "update public.conversations set status='resolved', resolved_at=now() where id=$1",
  [c1],
);
await asRole("service_role");
await ingest("5511900000001", T2);
let c = await conv(c1);
assert.equal(c.unread_count, 2);
assert.equal(c.status, "open");
assert.equal(c.resolved_at, null);

// 1b. history import: no unread bump, no reopen, no attention.
r = await ingest("5511900000002", T1, true);
const c2 = r.conversation_id;
c = await conv(c2);
assert.equal(c.unread_count, 0);
assert.notEqual(c.attention_state, "needs_attention");
await asSuper();
await db.query(
  "update public.conversations set status='resolved', resolved_at=now() where id=$1",
  [c2],
);
await asRole("service_role");
await ingest("5511900000002", T2, true);
c = await conv(c2);
assert.equal(c.unread_count, 0);
assert.equal(c.status, "resolved");

// 1c. an older provider timestamp never moves last_message_at backwards.
const before = new Date((await conv(c1)).last_message_at).getTime();
await ingest("5511900000001", T0);
const after = new Date((await conv(c1)).last_message_at).getTime();
assert.equal(after, before);
assert.equal(after, new Date(T2).getTime());

// 1d. message older than last_read_at does not bump unread.
await asSuper();
await db.query(
  "update public.conversations set unread_count=0, last_read_at=$2 where id=$1",
  [c1, "2026-10-01T13:00:00Z"],
);
await asRole("service_role");
await ingest("5511900000001", "2026-10-01T12:30:00Z");
assert.equal((await conv(c1)).unread_count, 0);
await ingest("5511900000001", "2026-10-01T14:00:00Z");
assert.equal((await conv(c1)).unread_count, 1);

// ---- 2. inbox_set_conversation_state read / p_read_up_to ---------------------
const mk = async (phone) => {
  const first = await ingest(phone, "2026-10-02T10:00:00Z");
  await ingest(phone, "2026-10-02T11:00:00Z");
  await ingest(phone, "2026-10-02T12:00:00Z");
  return first.conversation_id;
};
const readState = async (id, upTo) =>
  (
    await q(
      `select public.inbox_set_conversation_state(
         p_workspace_id => $1, p_conversation_id => $2, p_action => 'read',
         p_read_up_to => $3) as r`,
      [W, id, upTo],
    )
  )[0].r;
const c3 = await mk("5511900000003");
assert.equal((await conv(c3)).unread_count, 3);
let s = await readState(c3, "2026-10-02T10:30:00Z");
assert.equal(s.unread_count, 2, "inbound after read_up_to stay unread");
assert.equal((await conv(c3)).attention_state, "needs_attention");
s = await readState(c3, "2026-10-02T12:00:00Z");
assert.equal(s.unread_count, 0);
assert.equal((await conv(c3)).attention_state, "none");
const c4 = await mk("5511900000004");
s = await readState(c4, null);
assert.equal(s.unread_count, 0, "legacy read without bound clears everything");
assert.equal(
  (
    await q(
      "select count(*)::int n from public.messages where conversation_id=$1 and read_at is null",
      [c4],
    )
  )[0].n,
  0,
);

// ---- 3. claim_next_job lanes + whatsmiau.message.event ------------------------
await asSuper();
await db.exec("delete from public.jobs");
const addJob = (type, minutesAgo) =>
  db.query(
    `insert into public.jobs(type, workspace_id, available_at, created_at)
     values ($1, $2, now() - make_interval(mins => $3), now() - make_interval(mins => $3))`,
    [type, W, minutesAgo],
  );
const claim = async (...args) => {
  await asRole("service_role");
  const rows = await q(
    `select type, locked_by, lease_expires_at, locked_at
     from public.claim_next_job(${args.map((_, i) => `$${i + 1}`).join(",")})`,
    args,
  );
  await asSuper();
  return rows;
};
await addJob("agent.run", 10);
await addJob("whatsmiau.message.event", 9); // new type from 9fb3ce9: no check
await addJob("message.ingest", 8);
await addJob("knowledge.sync", 7);
const lane = ["message.ingest", "whatsmiau.message.event"];
let rows = await claim("w1", 300, lane, null);
assert.equal(rows[0].type, "whatsmiau.message.event");
rows = await claim("w1", 300, lane, null);
assert.equal(rows[0].type, "message.ingest");
rows = await claim("w1", 300, lane, null);
assert.equal(rows.length, 0, "include lane empty though other types queued");
rows = await claim("w2", 300, null, ["agent.run"]);
assert.equal(rows[0].type, "knowledge.sync", "exclude lane skips agent.run");
rows = await claim("w2", 300, null, ["agent.run"]);
assert.equal(rows.length, 0);
await addJob("late", 1);
rows = await claim("w3"); // one-arg call
assert.equal(rows[0].type, "agent.run");
rows = await claim("w3", 600); // old two-arg call
assert.equal(rows[0].type, "late");
const leaseSecs =
  (new Date(rows[0].lease_expires_at) - new Date(rows[0].locked_at)) / 1000;
assert.ok(Math.abs(leaseSecs - 600) < 2, `lease honoured (${leaseSecs})`);
assert.equal(rows[0].locked_by, "w3");
assert.equal(
  (
    await q(
      `select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where p.proname='claim_next_job' and p.pronargs=2`,
    )
  )[0].n,
  0,
  "old 2-arg overloads dropped",
);

// ---- 4. security migration ---------------------------------------------------
const pol = await q(
  `select tablename, policyname from pg_policies where schemaname='public'
   and tablename in ('agent_runs','agent_run_events','media_batches','media_assets',
                     'media_variants','media_send_requests','audit_log')`,
);
const names = (t) =>
  pol
    .filter((p) => p.tablename === t)
    .map((p) => p.policyname)
    .sort();
assert.deepEqual(names("agent_runs"), [
  "admins can delete agent runs",
  "admins can update agent runs",
  "agents can queue agent runs",
  "members can read agent runs",
]);
assert.deepEqual(names("agent_run_events"), ["members can read agent events"]);
for (const t of [
  "media_batches",
  "media_assets",
  "media_variants",
  "media_send_requests",
]) {
  assert.equal(names(t).length, 2, `${t} policies: ${names(t)}`);
}
assert.deepEqual(
  names("audit_log").filter((n) => /append/.test(n)),
  [],
);

await asSuper();
const [{ id: issueId }] = await q(
  `insert into public.issues(workspace_id, number, identifier, title, type) values ($1,1,'T-1','t','bug') returning id`,
  [W],
);
const [{ id: runId }] = await q(
  `insert into public.agent_runs(workspace_id, issue_id, mode) values ($1,$2,'investigate') returning id`,
  [W, issueId],
);
const [{ id: contactId }] = await q(
  `insert into public.contacts(workspace_id, channel_connection_id, phone_number, display_name)
   values ($1,$2,'5500','c') returning id`,
  [W, CC],
);
const [{ id: convId }] = await q(
  `insert into public.conversations(workspace_id, channel_connection_id, contact_id)
   values ($1,$2,$3) returning id`,
  [W, CC, contactId],
);
const [{ id: assetId }] = await q(
  `insert into public.media_assets(workspace_id, conversation_id, original_storage_path,
     original_file_name, kind, size_bytes)
   values ($1,$2,'p','f.png','image',1) returning id`,
  [W, convId],
);
const sendReq = (key) =>
  db.query(
    `insert into public.media_send_requests(workspace_id, conversation_id, asset_id, idempotency_key)
     values ($1,$2,$3,$4)`,
    [W, convId, assetId, key],
  );
const updateRun = async () =>
  (
    await q(
      "update public.agent_runs set updated_at = now() where id=$1 returning id",
      [runId],
    )
  ).length;

// viewer: reads yes, writes no.
await asRole("authenticated", viewer);
assert.equal((await q("select id from public.agent_runs")).length, 1);
assert.equal(await updateRun(), 0, "viewer update affects no rows");
await rejects(
  () => sendReq("viewer-key"),
  /row-level security/,
  "viewer send request",
);
await rejects(
  () =>
    db.query(
      `insert into public.agent_runs(workspace_id, issue_id, mode) values ($1,$2,'investigate')`,
      [W, issueId],
    ),
  /row-level security/,
  "viewer queue agent run",
);
// agent role may queue runs but not approve/update/delete them (regression: the
// pre-rename "coding runs" policies used to allow it).
await asRole("authenticated", agentUser);
await db.query(
  `insert into public.agent_runs(workspace_id, issue_id, mode) values ($1,$2,'propose_fix')`,
  [W, issueId],
);
assert.equal(await updateRun(), 0, "agent cannot update agent runs");
assert.equal(
  (await q("delete from public.agent_runs where id=$1 returning id", [runId]))
    .length,
  0,
  "agent cannot delete agent runs",
);
// admin and owner can.
for (const [user, key] of [
  [admin, "admin-key"],
  [owner, "owner-key"],
]) {
  await asRole("authenticated", user);
  await sendReq(key);
  assert.equal(await updateRun(), 1, "owner/admin may update agent runs");
}
// audit log: browsers cannot insert.
await asRole("authenticated", owner);
await rejects(
  () =>
    db.query(
      `insert into public.audit_log(workspace_id, actor_user_id, action, entity_type)
       values ($1,$2,'x','y')`,
      [W, owner],
    ),
  /permission denied|row-level security/,
  "audit insert",
);

// pause_conversation_for_human is not executable by PUBLIC/anon/authenticated.
await asSuper();
const acl = await q(
  `select
     has_function_privilege('anon', p.oid, 'execute') as anon,
     has_function_privilege('authenticated', p.oid, 'execute') as authed,
     has_function_privilege('service_role', p.oid, 'execute') as svc,
     exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
             where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_exec
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'pause_conversation_for_human'`,
);
assert.equal(acl.length, 1);
assert.deepEqual(acl[0], {
  anon: false,
  authed: false,
  svc: true,
  public_exec: false,
});

// last-owner guard.
await asRole("authenticated", owner);
await rejects(
  () =>
    db.query("select private.update_workspace_member_role($1,$2,'admin')", [
      W,
      owner,
    ]),
  /workspace_requires_owner/,
  "demote last owner",
);
await rejects(
  () => db.query("select private.remove_workspace_member($1,$2)", [W, owner]),
  /workspace_requires_owner/,
  "remove last owner",
);
await asRole("authenticated", viewer);
await rejects(
  () =>
    db.query("select private.update_workspace_member_role($1,$2,'admin')", [
      W,
      admin,
    ]),
  /workspace_role_denied/,
  "viewer cannot change roles",
);
await asRole("authenticated", admin);
await rejects(
  () =>
    db.query("select private.update_workspace_member_role($1,$2,'viewer')", [
      W,
      owner,
    ]),
  /workspace_role_denied/,
  "admin cannot demote owner",
);
// With a second owner the demotion is allowed, and the remaining one is locked.
await asSuper();
await db.query(
  "insert into public.workspace_members(workspace_id,user_id,role) values ($1,$2,'owner')",
  [W, owner2],
);
await asRole("authenticated", owner);
await db.query("select private.update_workspace_member_role($1,$2,'admin')", [
  W,
  owner2,
]);
await rejects(
  () =>
    db.query("select private.update_workspace_member_role($1,$2,'admin')", [
      W,
      owner,
    ]),
  /workspace_requires_owner/,
  "owner is last again",
);

console.log("inbox/job-lane/security migration DB tests passed");
