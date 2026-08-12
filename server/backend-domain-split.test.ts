import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8");

describe("backend domain boundaries", () => {
  it("keeps the Supabase API entrypoint as composition and compatibility exports", async () => {
    const value = await source("./supabase-api-adapters.ts");

    expect(value.split("\n").length).toBeLessThan(450);
    expect(value).not.toMatch(/export class Supabase/);
  });

  it("keeps the live worker entrypoint focused on polling and assembly", async () => {
    const value = await source("./live-worker.ts");

    expect(value.split("\n").length).toBeLessThan(950);
    expect(value).not.toMatch(/export class SupabaseLiveWorker/);
    expect(value).not.toMatch(/export class SupabaseCodexStarter/);
  });
});
