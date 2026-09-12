import { describe, expect, it, vi } from "vitest";
import { insertKnowledgeChunkRows } from "./knowledge-sync.js";

describe("knowledge sync chunk writes", () => {
  it("keeps vector inserts below the database timeout batch size", async () => {
    const insert = vi.fn(async () => ({ data: null, error: null }));
    const client = { from: vi.fn(() => ({ insert })) };
    const rows = Array.from({ length: 55 }, (_, index) => ({ index }));

    await insertKnowledgeChunkRows(client as never, rows);

    expect(insert).toHaveBeenCalledTimes(7);
    expect(insert.mock.calls.map(([batch]) => batch.length)).toEqual([
      8, 8, 8, 8, 8, 8, 7,
    ]);
  });
});
