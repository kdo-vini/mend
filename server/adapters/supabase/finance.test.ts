import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { SupabaseFinanceAdapter } from "./finance.js";

describe("financial attention queries", () => {
  it.each(["unknown", "estimated"] as const)(
    "filters %s before server pagination without changing the period",
    async (attention) => {
      const fetch = vi.fn<typeof globalThis.fetch>(
        async () =>
          new Response("[]", {
            headers: { "Content-Type": "application/json" },
          }),
      );
      const client = createClient(
        "https://finance.test.supabase.co",
        "test-public-key",
        {
          global: { fetch },
          auth: { persistSession: false, autoRefreshToken: false },
        },
      );
      await new SupabaseFinanceAdapter(client).list(
        "entries",
        "2026-10-01",
        50,
        attention,
      );
      const url = new URL(String(fetch.mock.calls[0][0]));
      expect(url.pathname).toBe("/rest/v1/finance_entries");
      expect(url.searchParams.get("period")).toBe("eq.2026-10-01");
      expect(url.searchParams.get("cancelled")).toBe("eq.false");
      expect(url.searchParams.get("kind")).toBe("neq.transfer");
      expect(
        url.searchParams.get(
          attention === "unknown" ? "amount_cents" : "estimated",
        ),
      ).toBe(attention === "unknown" ? "is.null" : "eq.true");
      expect(url.searchParams.get("offset")).toBe("50");
      expect(url.searchParams.get("limit")).toBe("50");
    },
  );
});
