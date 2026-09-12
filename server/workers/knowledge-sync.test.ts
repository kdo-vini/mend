import { describe, expect, it, vi } from "vitest";
import { insertKnowledgeChunkRows } from "./knowledge-sync.js";

describe("knowledge sync chunk writes", () => {
  it("keeps vector inserts below the database timeout batch size", async () => {
    const upsert = vi.fn(async () => ({ data: null, error: null }));
    const client = { from: vi.fn(() => ({ upsert })) };
    const rows = Array.from({ length: 55 }, (_, index) => ({ index }));

    await insertKnowledgeChunkRows(client as never, rows);

    expect(upsert).toHaveBeenCalledTimes(7);
    expect(upsert.mock.calls.map(([batch]) => batch.length)).toEqual([
      8, 8, 8, 8, 8, 8, 7,
    ]);
    expect(upsert).toHaveBeenCalledWith(expect.any(Array), {
      onConflict: "article_id,article_version,chunk_index",
      ignoreDuplicates: true,
    });
  });

  it("retries a transient timeout without risking duplicate chunks", async () => {
    const upsert = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { message: "Gateway Timeout" },
      })
      .mockResolvedValueOnce({ data: null, error: null });
    const client = { from: vi.fn(() => ({ upsert })) };

    await insertKnowledgeChunkRows(client as never, [{ index: 0 }]);

    expect(upsert).toHaveBeenCalledTimes(2);
  });
});
