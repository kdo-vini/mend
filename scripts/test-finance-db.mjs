/* global console, crypto, URL */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const w = "11111111-1111-4111-8111-111111111111";
const operator = "22222222-2222-4222-8222-222222222222";
const owner = "33333333-3333-4333-8333-333333333333";
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create schema private;grant usage on schema auth,private to authenticated;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table auth.users(id uuid primary key);
create table public.workspaces(id uuid primary key);
create table public.workspace_members(workspace_id uuid,user_id uuid,role text,primary key(workspace_id,user_id));
create table public.internal_workspace(workspace_id uuid);
insert into auth.users values('${operator}'),('${owner}');insert into workspaces values('${w}');insert into internal_workspace values('${w}');
insert into workspace_members values('${w}','${operator}','agent'),('${w}','${owner}','owner');
grant select on internal_workspace to authenticated;
create function private.workspace_member_role(w uuid) returns text language sql stable security definer set search_path=pg_catalog,public as $$select role from public.workspace_members where workspace_id=w and user_id=auth.uid() and workspace_id in(select workspace_id from internal_workspace)$$;`);
await db.exec(
  readFileSync(
    new URL(
      "../supabase/migrations/20261005220515_diagium_finance.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
await db.exec(
  `insert into finance_access values('${w}','${operator}');set role authenticated;select set_config('request.jwt.claim.sub','${operator}',false);`,
);
let count = 0;
const uuid = () => crypto.randomUUID();
async function save(entity, record, version = null) {
  const result = await db.query(
    "select finance_save($1,$2::jsonb,$3) as record",
    [entity, JSON.stringify(record), version],
  );
  return result.rows[0].record;
}
async function summary(period) {
  return (
    await db.query("select finance_summary($1::date) as summary", [period])
  ).rows[0].summary;
}
const base = {
  description: "Receita cliente",
  kind: "income",
  period: "2026-09-01",
  amount_cents: 10000,
  category: "service",
  source: "Gateway",
  estimated: false,
  project: "",
  allocation: "",
  cancelled: false,
  reason: "",
};
const income = await save("entries", { id: uuid(), ...base });
assert.equal((await summary("2026-09-01")).income, 10000);
assert.equal((await summary("2026-09-01")).received, 0);
count++;
const settlement = await save("settlements", {
  id: uuid(),
  entry_id: income.id,
  paid_on: "2026-10-05",
  amount_cents: 8000,
  source: "Bank",
  cancelled: false,
  reason: "",
});
assert.equal((await summary("2026-10-01")).income, 0);
assert.equal((await summary("2026-10-01")).received, 8000);
count++;
await save("entries", {
  id: uuid(),
  ...base,
  kind: "transfer",
  period: "2026-10-01",
  amount_cents: 999999,
});
assert.equal((await summary("2026-10-01")).income, 0);
count++;
const reference = {
  id: uuid(),
  entry_id: income.id,
  settlement_id: settlement.id,
  source: "Bank",
  external_id: "txn-1",
  note: "Statement",
};
await save("references", reference);
await save("references", {
  ...reference,
  id: uuid(),
  source: "Gateway",
  external_id: "other-id",
});
assert.equal((await summary("2026-10-01")).received, 8000);
assert.equal((await summary("2026-10-01")).reference_pending, 0);
count++;
await assert.rejects(
  () => save("references", { ...reference, id: uuid() }),
  (e) => e.code === "23505",
);
count++;
const edited = await save(
  "entries",
  { id: income.id, ...base, amount_cents: 12000 },
  1,
);
assert.equal(edited.version, 2);
await assert.rejects(
  () => save("entries", { id: income.id, ...base }, 1),
  (e) => e.code === "40001",
);
count++;
await save("templates", {
  id: uuid(),
  description: "Hostinger",
  category: "Infrastructure",
  source: "Hostinger",
  amount_cents: 4000,
  estimated: true,
  project: "",
  allocation: "",
  starts_on: "2026-10-01",
  ends_on: null,
  active: true,
});
assert.equal(
  (await db.query("select finance_generate('2026-10-01') as n")).rows[0].n,
  1,
);
assert.equal(
  (await db.query("select finance_generate('2026-10-01') as n")).rows[0].n,
  0,
);
assert.equal((await summary("2026-10-01")).expenses, 4000);
assert.equal((await summary("2026-10-01")).paid, 0);
count++;
await save("entries", {
  id: uuid(),
  ...base,
  kind: "expense",
  amount_cents: null,
  period: "2026-10-01",
});
assert.equal((await summary("2026-10-01")).unknown_count, 1);
count++;
await assert.rejects(
  () =>
    save("entries", { id: uuid(), ...base, source: "Supabase", project: "" }),
  (e) => e.code === "23514",
);
count++;
await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false);`);
assert.equal((await db.query("select * from finance_entries")).rows.length, 0);
await assert.rejects(
  () => summary("2026-10-01"),
  (e) => e.code === "42501",
);
await assert.rejects(
  () => db.exec(`insert into finance_access values('${w}','${owner}')`),
  (e) => e.code === "42501",
);
count++;
await db.exec(
  `select set_config('request.jwt.claim.sub','${operator}',false);`,
);
await assert.rejects(
  () => db.exec("update finance_events set actor_id=actor_id"),
  (e) => e.code === "42501",
);
count++;
assert.ok((await db.query("select * from finance_events")).rows.length >= 8);
await db.exec(
  `reset role;delete from workspace_members where user_id='${operator}';set role authenticated;`,
);
assert.equal((await db.query("select * from finance_entries")).rows.length, 0);
await assert.rejects(
  () => summary("2026-10-01"),
  (e) => e.code === "42501",
);
count++;
console.log(
  `PASS: ${count} financial behavior/security scenarios, real PostgreSQL engine, isolated, no Docker or production writes.`,
);
await db.close();
