/* global console */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { URL } from "node:url";

const db = new PGlite();
const workspace = "11111111-1111-4111-8111-111111111111";
const human = "22222222-2222-4222-8222-222222222222";
const conversations = {
  automation: "a4444444-4444-4444-8444-444444444441",
  phone: "a4444444-4444-4444-8444-444444444442",
  repeat: "a4444444-4444-4444-8444-444444444443",
  expired: "a4444444-4444-4444-8444-444444444444",
  app: "a4444444-4444-4444-8444-444444444445",
};

// Minimal surface the trigger touches; the real pause function lives in older migrations.
await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create schema private;
  create table public.internal_workspace(workspace_id uuid not null);
  insert into public.internal_workspace values('${workspace}');
  create table public.audit_log(
    workspace_id uuid, actor_user_id uuid, action text, entity_type text,
    entity_id uuid, metadata_json jsonb
  );
  create table public.conversation_ai_state(
    conversation_id uuid primary key, automation_state text not null
  );
  insert into public.conversation_ai_state
  select id::uuid, 'ai_active' from unnest(array[
    '${conversations.automation}','${conversations.phone}','${conversations.repeat}',
    '${conversations.expired}','${conversations.app}'
  ]) as id;
  create function private.pause_conversation_for_human(
    p_workspace uuid, p_conversation uuid, p_message uuid, p_user uuid, p_reason text
  ) returns void language sql as $$
    update public.conversation_ai_state set automation_state = 'human_paused'
    where conversation_id = p_conversation
  $$;
  create table public.messages(
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    conversation_id uuid not null,
    direction text not null,
    origin text not null default 'whatsapp',
    text text,
    ai_generated boolean not null default false,
    sent_by_user_id uuid
  );
`);

await db.exec(
  readFileSync(
    new URL(
      "../supabase/migrations/20261008150000_automation_outbound_does_not_pause.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
await db.exec(`
  create trigger pause_after_human_message after insert on public.messages
  for each row execute function private.pause_after_human_message();
`);

const welcome =
  "Oi! Aqui é o Vinicius, do Zelo.\n\nVi que a conta da Loja X acabou de ser criada.";

async function register(text) {
  await db.query("select public.register_automation_outbound($1)", [text]);
}

async function echo(conversation, text, extra = {}) {
  await db.query(
    `insert into public.messages(workspace_id, conversation_id, direction, origin, text, sent_by_user_id)
     values ($1, $2, 'outbound', $3, $4, $5)`,
    [
      workspace,
      conversation,
      extra.origin ?? "whatsapp",
      text,
      extra.sentBy ?? null,
    ],
  );
}

async function state(conversation) {
  const result = await db.query(
    "select automation_state from public.conversation_ai_state where conversation_id = $1",
    [conversation],
  );
  return result.rows[0].automation_state;
}

// 1. Registered automation echo (provider may reflow whitespace) does not pause.
await register(welcome);
await echo(conversations.automation, `  ${welcome.replace("\n\n", "\n")} `);
assert.equal(await state(conversations.automation), "ai_active");
const automationAudit = await db.query(
  "select action from public.audit_log where entity_id = $1",
  [conversations.automation],
);
assert.deepEqual(
  automationAudit.rows.map((row) => row.action),
  ["ai.automation_outbound"],
);

// 2. Human typing on the phone (no mark) still pauses.
await echo(conversations.phone, "oi, claro");
assert.equal(await state(conversations.phone), "human_paused");

// 3. A mark is single-use: a second identical echo pauses.
await echo(conversations.repeat, welcome);
assert.equal(await state(conversations.repeat), "human_paused");

// 4. An expired mark does not match.
await register("Bom dia! Tudo bem? Aqui é o Vinicius.");
await db.exec(
  "update private.automation_outbound_marks set created_at = now() - interval '16 minutes' where consumed_at is null",
);
await echo(conversations.expired, "Bom dia! Tudo bem? Aqui é o Vinicius.");
assert.equal(await state(conversations.expired), "human_paused");

// 5. A Mend UI reply by a signed-in human pauses even if the text was marked.
await register("Mesmo texto");
await echo(conversations.app, "Mesmo texto", { origin: "app", sentBy: human });
assert.equal(await state(conversations.app), "human_paused");

// 6. AI-generated outbound never consults the marks.
await db.query(
  `insert into public.messages(workspace_id, conversation_id, direction, text, ai_generated)
   values ($1, $2, 'outbound', 'resposta da IA', true)`,
  [workspace, conversations.automation],
);
assert.equal(await state(conversations.automation), "ai_active");

// 7. Only service_role may register marks.
const grants = await db.query(`
  select grantee from information_schema.routine_privileges
  where routine_name = 'register_automation_outbound'
`);
assert.deepEqual(
  grants.rows.map((row) => row.grantee).filter((g) => g !== "postgres"),
  ["service_role"],
);
await assert.rejects(register("   "), /automation_text_required/);

console.log("automation outbound db tests passed");
