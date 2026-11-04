import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { channelAiFromSettings } from "../src/shared/channel-ai.js";

describe("Per-channel AI lock migration", () => {
  it("keeps today's channels open and leaves new channels locked", async () => {
    const sql = await readFile(
      fileURLToPath(
        new URL(
          "../supabase/migrations/20261107120000_channel_ai_lock.sql",
          import.meta.url,
        ),
      ),
      "utf8",
    );
    // Only channels without an ai block are touched, so an explicit lock set
    // later is never overwritten by a replay.
    expect(sql).toContain(
      "where not (coalesce(settings_json, '{}'::jsonb) ? 'ai')",
    );
    // The backfilled block must parse as an open legacy channel.
    expect(
      channelAiFromSettings({
        ai: {
          enabled: true,
          knowledge: { mode: "workspace" },
          mcpEnabled: true,
          zeloCustomerLookup: true,
        },
      }),
    ).toMatchObject({ enabled: true, knowledge: { mode: "workspace" } });
    for (const key of [
      "'enabled', true",
      "'knowledge', jsonb_build_object('mode', 'workspace')",
      "'mcpEnabled', true",
      "'zeloCustomerLookup', true",
    ])
      expect(sql).toContain(key);
  });
});
