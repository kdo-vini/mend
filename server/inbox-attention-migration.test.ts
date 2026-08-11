import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL(
    "../supabase/migrations/20260811125008_classify_outbound_first_conversations.sql",
    import.meta.url,
  ),
);

describe("Inbox attention migration contract", () => {
  it("keeps outbound-first conversations neutral without clearing inbound work", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain("alter column attention_state set default 'none'");
    expect(sql).toContain("conversation.unread_count = 0");
    expect(sql).toContain("message.direction = 'outbound'");
    expect(sql).toContain("message.direction = 'inbound'");
    expect(sql).toContain("and not exists");
  });
});
