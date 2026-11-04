import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFile(fileURLToPath(new URL(path, import.meta.url)), "utf8");

describe("Per-channel contacts contract", () => {
  it("keys contacts by channel so a second WhatsApp number keeps its own threads", async () => {
    const sql = await read(
      "../supabase/migrations/20261104120000_contacts_per_channel.sql",
    );

    expect(sql).toContain(
      "drop constraint if exists contacts_workspace_id_phone_number_key",
    );
    expect(sql).toContain(
      "unique (workspace_id, channel_connection_id, phone_number)",
    );
    expect(sql).toContain(
      "on conflict (workspace_id, channel_connection_id, phone_number) do update",
    );
    expect(sql).not.toContain("on conflict (workspace_id, phone_number)");
    // A contact must never move to the channel of the latest message.
    expect(sql).not.toContain(
      "set channel_connection_id = excluded.channel_connection_id",
    );
    expect(sql).toContain("contacts_channel_mismatch");
  });

  it("syncs provider contacts with the same per-channel key", async () => {
    const webhook = await read(
      "../supabase/functions/whats-mend-webhook/index.ts",
    );

    expect(webhook).toContain(
      'onConflict: "workspace_id,channel_connection_id,phone_number"',
    );
  });
});
