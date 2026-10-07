/* global console, crypto */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { URL } from "node:url";

const db = new PGlite();
const workspace = "11111111-1111-4111-8111-111111111111";
const foreignWorkspace = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const agent = "22222222-2222-4222-8222-222222222222";
const owner = "33333333-3333-4333-8333-333333333333";
const admin = "44444444-4444-4444-8444-444444444444";
const foreignOwner = "55555555-5555-4555-8555-555555555555";
const agentWithoutFinance = "66666666-6666-4666-8666-666666666666";
const uuid = () => crypto.randomUUID();

await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create schema auth;
  create schema private;
  grant usage on schema auth, private to authenticated;
  create function auth.uid() returns uuid language sql as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
  $$;
  create table auth.users(id uuid primary key);
  create table public.workspaces(id uuid primary key);
  create table public.workspace_members(
    workspace_id uuid not null,
    user_id uuid not null,
    role text not null,
    primary key(workspace_id,user_id)
  );
  create table public.internal_workspace(workspace_id uuid not null);
  insert into auth.users values
    ('${agent}'),('${owner}'),('${admin}'),('${foreignOwner}'),('${agentWithoutFinance}');
  insert into public.workspaces values
    ('${workspace}'),('${foreignWorkspace}');
  insert into public.internal_workspace values('${workspace}');
  insert into public.workspace_members values
    ('${workspace}','${agent}','agent'),
    ('${workspace}','${owner}','owner'),
    ('${workspace}','${admin}','admin'),
    ('${foreignWorkspace}','${foreignOwner}','owner'),
    ('${workspace}','${agentWithoutFinance}','agent');
  grant select on public.internal_workspace to authenticated;
  create function private.workspace_member_role(target uuid)
  returns text language sql stable security definer
  set search_path=pg_catalog,public as $$
    select wm.role from public.workspace_members wm
    join public.internal_workspace iw on iw.workspace_id=wm.workspace_id
    where wm.workspace_id=target and wm.user_id=auth.uid() limit 1
  $$;
  grant execute on function private.workspace_member_role(uuid) to authenticated;
`);

for (const migration of ["20261005220515_diagium_finance.sql"]) {
  await db.exec(
    readFileSync(
      new URL(`../supabase/migrations/${migration}`, import.meta.url),
      "utf8",
    ),
  );
}

// Seed legacy project references through the authorized finance RPC, as real writes do.
await db.exec(`
  insert into public.finance_access values('${workspace}','${agent}');
  set role authenticated;
  select set_config('request.jwt.claim.sub','${agent}',false);
`);
for (const [description, project] of [
  ["legacy Zelo", "Zelo"],
  ["legacy project", "Legacy Project"],
]) {
  await db.query("select public.finance_save('entries',$1::jsonb,null)", [
    JSON.stringify({
      id: uuid(),
      kind: "income",
      description,
      period: "2026-09-01",
      amount_cents: 1000,
      category: "service",
      source: "manual",
      estimated: false,
      project,
      allocation: "",
      cancelled: false,
      reason: "",
    }),
  ]);
}
await db.query("select public.finance_save('templates',$1::jsonb,null)", [
  JSON.stringify({
    id: uuid(),
    description: "legacy template",
    category: "infra",
    source: "manual",
    amount_cents: 500,
    estimated: true,
    project: "Template Project",
    allocation: "",
    starts_on: "2026-09-01",
    ends_on: null,
    active: true,
  }),
]);
await db.exec("reset role;");
await db.exec(
  readFileSync(
    new URL(
      "../supabase/migrations/20261007010000_project_catalog.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);

await db.exec(`
  insert into public.finance_access values('${foreignWorkspace}','${foreignOwner}');
  set role authenticated;
  select set_config('request.jwt.claim.sub','${agent}',false);
`);

let scenarios = 0;
async function saveProject(record, version = null) {
  const result = await db.query(
    "select public.project_save($1::jsonb,$2::integer) as record",
    [JSON.stringify(record), version],
  );
  return result.rows[0].record;
}
async function summary(period, project) {
  const result = await db.query(
    "select public.finance_project_summary($1::date,$2::text) as summary",
    [period, project],
  );
  return result.rows[0].summary;
}
async function projectRows() {
  return (
    await db.query(
      "select id,key,name,description,status,version from public.projects order by key",
    )
  ).rows;
}

const seeds = await projectRows();
assert.deepEqual(
  seeds.map((row) => row.key),
  ["Legacy Project", "Template Project", "Zelo"],
);
assert.equal(seeds.find((row) => row.key === "Zelo").name, "Zelo");
scenarios++;

const project = {
  id: uuid(),
  key: "Alpha",
  name: "Alpha project",
  description: "Initial",
  status: "active",
};
const created = await saveProject(project);
assert.equal(created.version, 1);
assert.equal(
  (await projectRows()).some((row) => row.key === "Alpha"),
  true,
);
scenarios++;

await assert.rejects(
  () => saveProject({ ...project, id: uuid(), key: "Alpha" }),
  (error) => error.code === "23505",
);
await assert.rejects(
  () => saveProject({ ...project, name: "Stale" }, 2),
  (error) => error.code === "40001",
);
const renamed = await saveProject({ ...project, name: "Alpha renamed" }, 1);
assert.equal(renamed.version, 2);
assert.equal(renamed.name, "Alpha renamed");
await assert.rejects(
  () => saveProject({ ...project, key: "Beta" }, 2),
  (error) => error.code === "40001",
);
await assert.rejects(
  () =>
    db.exec(
      `update public.projects set key='Beta',version=version+1 where id='${project.id}'`,
    ),
  (error) => error.code === "40001",
);
assert.equal(
  (await projectRows()).find((row) => row.id === project.id).key,
  "Alpha",
);
scenarios++;

const archived = await saveProject(
  { ...project, name: "Alpha renamed", status: "archived" },
  2,
);
assert.equal(archived.status, "archived");
assert.equal(archived.version, 3);
scenarios++;

// A member without finance access may read the catalog, but cannot write it.
await db.exec(
  `select set_config('request.jwt.claim.sub','${agentWithoutFinance}',false);`,
);
assert.equal((await projectRows()).length, 4);
await assert.rejects(
  () => saveProject({ ...project, id: uuid(), key: "No grant" }),
  (error) => error.code === "42501",
);
scenarios++;

// Owner/admin workspace roles authorize catalog edits without finance access.
await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false);`);
const ownerProject = await saveProject({
  id: uuid(),
  key: "Owner-created",
  name: "Owner-created",
  description: "",
  status: "active",
});
assert.equal(ownerProject.key, "Owner-created");
await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false);`);
const adminProject = await saveProject({
  id: uuid(),
  key: "Admin-created",
  name: "Admin-created",
  description: "",
  status: "active",
});
assert.equal(adminProject.key, "Admin-created");
scenarios++;

// A real member in a different workspace cannot see or address this workspace's records.
await db.exec(
  `select set_config('request.jwt.claim.sub','${foreignOwner}',false);`,
);
assert.equal((await projectRows()).length, 0);
await assert.rejects(
  () => saveProject({ ...project, id: uuid(), key: "Foreign write" }),
  (error) => error.code === "42501",
);
await assert.rejects(
  () =>
    db.exec(
      `insert into public.projects(workspace_id,key,name) values('${foreignWorkspace}','foreign','foreign')`,
    ),
  (error) => error.code === "42501",
);
scenarios++;

await db.exec(`select set_config('request.jwt.claim.sub','${agent}',false);`);
const alphaId = uuid();
const alphaExpenseId = uuid();
const alphaOldIncomeId = uuid();
const entry = async (
  id,
  {
    kind,
    description,
    period = "2026-10-01",
    amount,
    project: key,
    estimated = false,
    cancelled = false,
  },
) => {
  await db.query(
    `insert into public.finance_entries
      (id,workspace_id,kind,description,period,amount_cents,category,source,project,estimated,cancelled,reason)
     values($1,$2,$3,$4,$5,$6,'service','manual',$7,$8,$9,$10)`,
    [
      id,
      workspace,
      kind,
      description,
      period,
      amount,
      key,
      estimated,
      cancelled,
      cancelled ? "removed" : "",
    ],
  );
};
await entry(alphaId, {
  kind: "income",
  description: "Alpha income",
  amount: 10000,
  project: "Alpha",
});
await entry(uuid(), {
  kind: "income",
  description: "Alpha Pro income",
  amount: 90000,
  project: "Alpha Pro",
});
await entry(alphaExpenseId, {
  kind: "expense",
  description: "Alpha estimate",
  amount: 2000,
  project: "Alpha",
  estimated: true,
});
await entry(uuid(), {
  kind: "expense",
  description: "Alpha unknown",
  amount: null,
  project: "Alpha",
});
await entry(uuid(), {
  kind: "transfer",
  description: "Alpha transfer",
  amount: 7000,
  project: "Alpha",
});
await entry(uuid(), {
  kind: "income",
  description: "Alpha canceled",
  amount: 5000,
  project: "Alpha",
  cancelled: true,
});
await entry(alphaOldIncomeId, {
  kind: "income",
  description: "Alpha other month",
  period: "2026-09-01",
  amount: 8000,
  project: "Alpha",
});

const settlementRows = [
  {
    id: uuid(),
    entry: alphaId,
    paidOn: "2026-10-01",
    amount: 6000,
    cancelled: false,
  },
  {
    id: uuid(),
    entry: alphaId,
    paidOn: "2026-11-01",
    amount: 9000,
    cancelled: false,
  },
];
for (const row of settlementRows) {
  await db.query(
    `insert into public.finance_settlements(id,workspace_id,entry_id,paid_on,amount_cents,source)
     values($1,$2,$3,$4,$5,'bank')`,
    [row.id, workspace, row.entry, row.paidOn, row.amount],
  );
}
const projectedSettlement = uuid();
await db.query(
  `insert into public.finance_settlements(id,workspace_id,entry_id,paid_on,amount_cents,source)
   values($1,$2,$3,'2026-10-20',3000,'bank')`,
  [projectedSettlement, workspace, alphaId],
);
const canceledSettlement = uuid();
await db.query(
  `insert into public.finance_settlements(id,workspace_id,entry_id,paid_on,amount_cents,source,cancelled,reason)
   values($1,$2,$3,'2026-10-21',4000,'bank',true,'reversed')`,
  [canceledSettlement, workspace, alphaId],
);
await db.query(
  `insert into public.finance_settlements(id,workspace_id,entry_id,paid_on,amount_cents,source)
   values($1,$2,$3,'2026-10-22',2000,'bank'),($4,$2,$5,'2026-10-23',1500,'bank')`,
  [uuid(), workspace, alphaOldIncomeId, uuid(), alphaExpenseId],
);
await db.query(
  `insert into public.finance_references(id,workspace_id,entry_id,settlement_id,source,external_id)
   values($1,$2,$3,$4,'bank','external-1')`,
  [uuid(), workspace, alphaId, projectedSettlement],
);
const summaryOct = await summary("2026-10-01", "Alpha");
assert.equal(summaryOct.income, 10000);
assert.equal(summaryOct.expenses, 2000);
assert.equal(summaryOct.estimated_count, 1);
assert.equal(summaryOct.unknown_count, 1);
assert.equal(summaryOct.received, 11000);
assert.equal(summaryOct.paid, 1500);
assert.equal(summaryOct.reference_pending, 3);
assert.equal(summaryOct.review, null);
assert.equal((await summary("2026-10-01", "Alpha Pro")).income, 90000);
assert.equal((await summary("2026-11-01", "Alpha")).received, 9000);
scenarios++;

await db.query(
  `insert into public.finance_reviews(id,workspace_id,period,sources_complete,note)
   values($1,$2,'2026-10-01',true,'Month close')`,
  [uuid(), workspace],
);
assert.deepEqual((await summary("2026-10-01", "Alpha")).review, {
  id: (
    await db.query(
      "select id from public.finance_reviews where workspace_id=$1",
      [workspace],
    )
  ).rows[0].id,
  workspace_id: workspace,
  period: "2026-10-01",
  sources_complete: true,
  expenses_complete: false,
  taxes_complete: false,
  note: "Month close",
  version: 1,
});
scenarios++;

await assert.rejects(
  () => summary("2026-10-02", "Alpha"),
  (error) => error.code === "22023",
);
await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false);`);
await assert.rejects(
  () => summary("2026-10-01", "Alpha"),
  (error) => error.code === "42501",
);
scenarios++;

// Cancelling a parent first must not strand its existing payment's delete action.
await db.exec(`select set_config('request.jwt.claim.sub','${agent}',false);`);
await db.query(
  "update public.finance_entries set cancelled=true,reason='Test cancellation',version=version+1 where id=$1",
  [alphaId],
);
await db.query(
  "update public.finance_settlements set cancelled=true,reason='Duplicate payment',version=version+1 where id=$1",
  [projectedSettlement],
);
assert.equal(
  (
    await db.query(
      "select cancelled from public.finance_settlements where id=$1",
      [projectedSettlement],
    )
  ).rows[0].cancelled,
  true,
);
await assert.rejects(
  () =>
    db.query(
      "update public.finance_settlements set cancelled=false,version=version+1 where id=$1",
      [projectedSettlement],
    ),
  /finance_entry_unavailable/,
);
scenarios++;
console.log(
  `PASS: ${scenarios} project behavior/security scenarios, PGlite PostgreSQL engine, isolated, no production writes.`,
);

await db.close();
