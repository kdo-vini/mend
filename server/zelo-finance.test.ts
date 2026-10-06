import { describe, expect, it, vi } from "vitest";
import {
  createZeloFinanceService,
  zeloMonthBounds,
  ZeloFinanceService,
} from "./zelo-finance.js";

const pix = (extra = {}) => ({
  id: "pix-1",
  provider_payment_id: "bill_1",
  provider: "abacatepay",
  currency: "BRL",
  status: "paid",
  amount_expected_cents: 5900,
  amount_paid_cents: 5900,
  created_at: "2026-09-30T20:00:00Z",
  paid_at: "2026-10-01T04:00:00Z",
  ...extra,
});
const invoice = (extra = {}) => ({
  id: "in_1",
  customer: "cus_zelo",
  livemode: true,
  currency: "brl",
  status: "paid",
  amount_due: 5900,
  amount_paid: 5900,
  created: Date.parse("2026-09-29T15:00:00Z") / 1000,
  status_transitions: { paid_at: Date.parse("2026-10-01T04:00:00Z") / 1000 },
  ...extra,
});
function service(pixRows = [pix()], invoices = [invoice()]) {
  const sources = {
    pix: vi.fn(async () => ({ rows: pixRows, complete: true })),
    stripe: vi.fn(async () => ({ rows: invoices, complete: true })),
    customers: vi.fn(async () => new Set(["cus_zelo"])),
  };
  return { sources, port: new ZeloFinanceService(sources) };
}
describe("Zelo read-only finance", () => {
  it("normalizes Stripe zero-decimal invoices without changing ISK compatibility units", async () => {
    const { port } = service(
      [],
      [
        invoice({ currency: "jpy", amount_paid: 59 }),
        invoice({ id: "in_isk", currency: "isk", amount_paid: 5900 }),
      ],
    );
    const feed = await port.month("2026-10-01");
    expect(feed.rows.find((row) => row.currency === "JPY")?.receivedCents).toBe(
      5900,
    );
    expect(feed.rows.find((row) => row.currency === "ISK")?.receivedCents).toBe(
      5900,
    );
  });
  it("uses historical Sao Paulo DST for calendar boundaries", () => {
    expect(zeloMonthBounds("2018-01-01")).toEqual({
      start: "2018-01-01T02:00:00.000Z",
      end: "2018-02-01T02:00:00.000Z",
    });
    expect(zeloMonthBounds("2026-12-01").end).toBe("2027-01-01T03:00:00.000Z");
  });
  it("counts previous-month invoices paid this month without inventing accrual revenue", async () => {
    const { port } = service();
    const feed = await port.month("2026-10-01");
    expect(feed.totals).toEqual([
      {
        currency: "BRL",
        billedCents: 0,
        receivedCents: 11800,
        pendingCents: 0,
      },
    ]);
    expect(feed.rows).toHaveLength(2);
    expect(feed.rows[0]).not.toHaveProperty("customer");
    expect(feed.rows[0]).not.toHaveProperty("user_id");
  });
  it("uses Sao Paulo calendar, deduplicates external IDs and separates currencies", async () => {
    const p = pix({
      created_at: "2026-10-01T02:59:59Z",
      paid_at: "2026-10-01T02:59:59Z",
    });
    const card = invoice({
      created: Date.parse("2026-10-01T03:00:00Z") / 1000,
      currency: "usd",
    });
    const { port } = service([p, pix(), pix()], [card, card]);
    const feed = await port.month("2026-10-01");
    expect(feed.rows).toHaveLength(2);
    expect(feed.totals).toEqual([
      { currency: "BRL", billedCents: 0, receivedCents: 5900, pendingCents: 0 },
      {
        currency: "USD",
        billedCents: 5900,
        receivedCents: 5900,
        pendingCents: 0,
      },
    ]);
  });
  it("does not include foreign customers, drafts, test invoices or unrelated PIX providers", async () => {
    const { port } = service(
      [pix({ provider: "other" })],
      [
        invoice({ customer: "cus_other" }),
        invoice({ livemode: false }),
        invoice({ status: "draft" }),
      ],
    );
    expect((await port.month("2026-10-01")).rows).toEqual([]);
  });
  it("reports provider failures and missing credentials separately from zero payments", async () => {
    const { sources, port } = service();
    sources.stripe.mockRejectedValueOnce(new Error("secret-key-do-not-return"));
    const feed = await port.month("2026-10-01");
    expect(feed.providers.stripe).toBe("unavailable");
    expect(feed.providers.abacatepay).toBe("ok");
    expect(JSON.stringify(feed)).not.toContain("secret-key");
    const missing = await new ZeloFinanceService({}).month("2026-10-01");
    expect(missing.providers).toEqual({
      abacatepay: "not_configured",
      stripe: "not_configured",
    });
  });
  it("caches bounded month snapshots but expires and retries provider failures", async () => {
    let now = 0;
    const { sources } = service();
    const port = new ZeloFinanceService(sources, () => now);
    await Promise.all([port.month("2026-10-01"), port.month("2026-10-01")]);
    expect(sources.pix).toHaveBeenCalledTimes(1);
    now = 61000;
    await port.month("2026-10-01");
    expect(sources.pix).toHaveBeenCalledTimes(2);
  });
  it("never substitutes expected value for a missing paid amount", async () => {
    const { port } = service([pix({ amount_paid_cents: null })], []);
    const feed = await port.month("2026-10-01");
    expect(feed.providers.abacatepay).toBe("partial");
    expect(feed.rows[0].receivedCents).toBeNull();
    expect(feed.totals[0].receivedCents).toBe(0);
  });
  it("drops malformed source rows and never reports an error as a complete zero", async () => {
    const { port } = service([pix({ amount_paid_cents: -1 })], []);
    expect((await port.month("2026-10-01")).providers.abacatepay).toBe(
      "unavailable",
    );
  });
  it("fixed-origin adapters only issue GETs with minimal projected columns and page Stripe", async () => {
    let stripeCalls = 0;
    const fetcher = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        expect(init?.method).toBe("GET");
        expect(init?.redirect).toBe("error");
        const address = new URL(String(url));
        let result: unknown;
        if (address.pathname.endsWith("billing_payments")) {
          expect(address.searchParams.get("select")).not.toMatch(
            /user_id|qr_code|metadata|br_code/,
          );
          expect(address.searchParams.get("or")).toContain("paid_at.gte.");
          result = [pix()];
        } else if (address.pathname.endsWith("subscriptions"))
          result = [{ provider_customer_id: "cus_zelo" }];
        else {
          expect(address.origin).toBe("https://api.stripe.com");
          stripeCalls++;
          if (stripeCalls === 2)
            expect(address.searchParams.get("starting_after")).toBe("in_1");
          result = {
            data: [invoice({ id: stripeCalls === 1 ? "in_1" : "in_2" })],
            has_more: stripeCalls === 1,
          };
        }
        return new Response(JSON.stringify(result), { status: 200 });
      },
    );
    const port = createZeloFinanceService(
      {
        MEND_ZELO_SUPABASE_SERVICE_ROLE_KEY: "fake-key",
        MEND_ZELO_STRIPE_READ_KEY: "rk_live_fake",
      },
      fetcher as typeof fetch,
    );
    const feed = await port.month("2026-10-01");
    expect(feed.providers).toEqual({ abacatepay: "ok", stripe: "ok" });
    expect(feed.rows).toHaveLength(3);
  });
  it("surfaces truncation and rejects Stripe test credentials", async () => {
    const { sources } = service();
    sources.stripe.mockResolvedValueOnce({
      rows: [invoice()],
      complete: false,
    });
    const feed = await new ZeloFinanceService(sources).month("2026-10-01");
    expect(feed.providers.stripe).toBe("partial");
    const fetcher = vi.fn(async () => new Response(JSON.stringify([])));
    const port = createZeloFinanceService(
      {
        MEND_ZELO_SUPABASE_SERVICE_ROLE_KEY: "fake-key",
        MEND_ZELO_STRIPE_READ_KEY: "sk_test_fake",
      },
      fetcher as typeof fetch,
    );
    expect((await port.month("2026-10-01")).providers.stripe).toBe(
      "unavailable",
    );
    expect(fetcher.mock.calls).toHaveLength(2);
  });
});
