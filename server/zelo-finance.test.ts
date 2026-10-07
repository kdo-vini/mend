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
const balanceTransaction = (extra = {}) => ({
  amount: 5900,
  fee: 200,
  net: 5700,
  currency: "brl",
  available_on: Date.parse("2026-10-03T00:00:00Z") / 1000,
  ...extra,
});
const charge = (extra = {}) => ({
  id: "ch_1",
  paid: true,
  livemode: true,
  amount: 5900,
  amount_refunded: 0,
  refunded: false,
  disputed: false,
  currency: "brl",
  balance_transaction: balanceTransaction(),
  ...extra,
});
const checkoutDetail = (extra = {}) => ({
  success: true,
  data: {
    id: "bill_1",
    amount: 5900,
    paidAmount: 5900,
    status: "PAID",
    devMode: false,
    ...extra,
  },
});
const bankStatementItem = (extra = {}) => ({
  id: "tran_1",
  currency: "BRL",
  createdAt: "2026-10-01T04:00:00.000Z",
  checkoutId: "bill_1",
  paymentIntentId: "char_1",
  referenceId: null,
  customer: { name: "must-not-leak", taxId: "12345678900" },
  movements: [
    {
      amount: 5900,
      kind: "DEPOSIT",
      method: "PIX",
      description: "Customer payment",
      category: "transaction",
      balanceEffect: "credit",
    },
    {
      amount: 80,
      kind: "PLUGIN_FEE",
      method: "PIX",
      description: "Processing fee",
      category: "fee",
      balanceEffect: "debit",
    },
  ],
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
        netKnownCents: 0,
        unknownNetCount: 2,
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
      {
        currency: "BRL",
        billedCents: 0,
        receivedCents: 5900,
        pendingCents: 0,
        netKnownCents: 0,
        unknownNetCount: 1,
      },
      {
        currency: "USD",
        billedCents: 5900,
        receivedCents: 5900,
        pendingCents: 0,
        netKnownCents: 0,
        unknownNetCount: 1,
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
  it("keeps Abacate incoming fees and net unknown when settlement sources are unavailable", async () => {
    const { port } = service([pix()], []);
    const feed = await port.month("2026-10-01");
    expect(feed.rows[0]).toMatchObject({
      provider: "abacatepay",
      receivedCents: 5900,
      feeCents: null,
      netCents: null,
      availableAt: null,
    });
    expect(feed.totals[0]).toMatchObject({
      receivedCents: 5900,
      netKnownCents: 0,
      unknownNetCount: 1,
    });
  });
  it("maps Abacate fees only from a matching live checkout and complete credit/fee statement pair", async () => {
    const { sources, port } = service([pix()], []);
    sources.checkout = vi.fn(async () => checkoutDetail());
    sources.bankStatement = vi.fn(async () => ({
      success: true,
      data: [bankStatementItem()],
      pagination: { hasMore: false, next: null },
    }));
    const feed = await port.month("2026-10-01");
    expect(sources.checkout).toHaveBeenCalledWith(
      "bill_1",
      expect.any(AbortSignal),
    );
    expect(sources.bankStatement).toHaveBeenCalledWith(
      "2026-10-01",
      "2026-10-31",
      null,
      expect.any(AbortSignal),
    );
    expect(feed.rows[0]).toMatchObject({
      receivedCents: 5900,
      feeCents: 80,
      netCents: 5820,
      availableAt: null,
    });
    expect(feed.totals[0]).toMatchObject({
      netKnownCents: 5820,
      unknownNetCount: 0,
    });
    expect(JSON.stringify(feed)).not.toContain("must-not-leak");
    expect(JSON.stringify(feed)).not.toContain("12345678900");
  });
  it("leaves Abacate net unknown for checkout or statement mismatches and incomplete pagination", async () => {
    const badCheckouts = [
      checkoutDetail({ devMode: true }),
      checkoutDetail({ status: "REFUNDED" }),
      checkoutDetail({ amount: 5800 }),
      checkoutDetail({ paidAmount: 5800 }),
      checkoutDetail({ id: "bill_other" }),
    ];
    for (const detail of badCheckouts) {
      const { sources, port } = service([pix()], []);
      sources.checkout = vi.fn(async () => detail);
      sources.bankStatement = vi.fn(async () => ({
        success: true,
        data: [bankStatementItem()],
        pagination: { hasMore: false, next: null },
      }));
      const feed = await port.month("2026-10-01");
      expect(feed.rows[0]?.netCents).toBeNull();
      expect(sources.bankStatement).not.toHaveBeenCalled();
    }

    const malformedStatements = [
      bankStatementItem({ currency: "USD" }),
      bankStatementItem({ checkoutId: "bill_other" }),
      bankStatementItem({ movements: [bankStatementItem().movements[0]] }),
      bankStatementItem({
        movements: [
          ...bankStatementItem().movements,
          { ...bankStatementItem().movements[0], kind: "REVERSAL" },
        ],
      }),
      bankStatementItem({
        movements: [
          { ...bankStatementItem().movements[0], amount: 5800 },
          bankStatementItem().movements[1],
        ],
      }),
      bankStatementItem({
        movements: [
          bankStatementItem().movements[0],
          { ...bankStatementItem().movements[1], balanceEffect: "credit" },
        ],
      }),
    ];
    for (const item of malformedStatements) {
      const { sources, port } = service([pix()], []);
      sources.checkout = vi.fn(async () => checkoutDetail());
      sources.bankStatement = vi.fn(async () => ({
        success: true,
        data: [item],
        pagination: { hasMore: false, next: null },
      }));
      expect((await port.month("2026-10-01")).rows[0]?.netCents).toBeNull();
    }

    const { sources, port } = service([pix()], []);
    sources.checkout = vi.fn(async () => checkoutDetail());
    sources.bankStatement = vi.fn(async () => ({
      success: true,
      data: [bankStatementItem()],
      pagination: { hasMore: true, next: "cursor-2" },
    }));
    const partial = await port.month("2026-10-01");
    expect(partial.rows[0]?.netCents).toBeNull();
  });
  it("bounds Abacate statement pagination and leaves all fees unknown if the month is truncated", async () => {
    const { sources, port } = service([pix()], []);
    sources.checkout = vi.fn(async () => checkoutDetail());
    sources.bankStatement = vi.fn(async (_start, _end, after) => ({
      success: true,
      data: [bankStatementItem({ id: `tran-${after ?? "first"}` })],
      pagination: { hasMore: true, next: `cursor-${after ?? "first"}` },
    }));
    const feed = await port.month("2026-10-01");
    expect(sources.bankStatement).toHaveBeenCalledTimes(10);
    expect(feed.rows[0]?.netCents).toBeNull();
  });
  it("caps Abacate checkout lookups at 100 with four concurrent requests", async () => {
    let active = 0;
    let maxActive = 0;
    const rows = Array.from({ length: 105 }, (_, index) =>
      pix({
        id: `pix-${index}`,
        provider_payment_id: `bill_${index}`,
      }),
    );
    const { sources, port } = service(rows, []);
    sources.checkout = vi.fn(async (id) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      return checkoutDetail({ id });
    });
    sources.bankStatement = vi.fn(async () => ({
      success: true,
      data: [],
      pagination: { hasMore: false, next: null },
    }));
    const feed = await port.month("2026-10-01");
    expect(sources.checkout).toHaveBeenCalledTimes(100);
    expect(maxActive).toBeLessThanOrEqual(4);
    expect(feed.rows.every((row) => row.netCents === null)).toBe(true);
  });
  it("maps a matching paid live Stripe charge to verified fee, net and provider availability", async () => {
    const { port } = service([], [invoice({ charge: charge() })]);
    const feed = await port.month("2026-10-01");
    expect(feed.rows[0]).toMatchObject({
      provider: "stripe",
      receivedCents: 5900,
      feeCents: 200,
      netCents: 5700,
      availableAt: "2026-10-03T00:00:00.000Z",
    });
    expect(feed.totals[0]).toMatchObject({
      currency: "BRL",
      receivedCents: 5900,
      netKnownCents: 5700,
      unknownNetCount: 0,
    });
  });
  it("keeps net unknown for an unverified, refunded, disputed or foreign-currency charge", async () => {
    const { port } = service(
      [],
      [
        invoice({ id: "mismatch", charge: charge({ amount: 5800 }) }),
        invoice({ id: "refund", charge: charge({ amount_refunded: 1 }) }),
        invoice({ id: "dispute", charge: charge({ disputed: true }) }),
        invoice({
          id: "fx",
          charge: charge({
            balance_transaction: balanceTransaction({ currency: "usd" }),
          }),
        }),
        invoice({ id: "not-live", charge: charge({ livemode: false }) }),
      ],
    );
    const feed = await port.month("2026-10-01");
    expect(feed.rows).toHaveLength(5);
    expect(feed.rows.every((row) => row.netCents === null)).toBe(true);
    expect(feed.rows.every((row) => row.feeCents === null)).toBe(true);
    expect(feed.totals[0].netKnownCents).toBe(0);
    expect(feed.totals[0].unknownNetCount).toBe(5);
  });
  it("drops malformed source rows and never reports an error as a complete zero", async () => {
    const { port } = service([pix({ amount_paid_cents: -1 })], []);
    expect((await port.month("2026-10-01")).providers.abacatepay).toBe(
      "unavailable",
    );
  });
  it("uses the fixed v2 checkout and date-bounded bank statement GETs for Abacate fees", async () => {
    const calls: URL[] = [];
    const fetcher = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        const address = new URL(String(url));
        calls.push(address);
        expect(init?.method).toBe("GET");
        expect(init?.redirect).toBe("error");
        if (address.pathname.endsWith("billing_payments"))
          return new Response(
            JSON.stringify([pix({ provider_payment_id: "bill_1" })]),
            { status: 200 },
          );
        expect(address.origin).toBe("https://api.abacatepay.com");
        expect(init?.headers).toMatchObject({
          Authorization: "Bearer fake-abacate",
        });
        if (address.pathname.endsWith("/v2/checkouts/get")) {
          expect(address.searchParams.get("id")).toBe("bill_1");
          return new Response(JSON.stringify(checkoutDetail()), {
            status: 200,
          });
        }
        if (address.pathname.endsWith("/v2/bank-statement/list")) {
          expect(address.searchParams.get("startDate")).toBe("2026-10-01");
          expect(address.searchParams.get("endDate")).toBe("2026-10-31");
          expect(address.searchParams.get("limit")).toBe("100");
          expect(address.searchParams.has("after")).toBe(false);
          return new Response(
            JSON.stringify({
              success: true,
              data: [bankStatementItem()],
              pagination: { hasMore: false, next: null, before: null },
            }),
            { status: 200 },
          );
        }
        throw new Error(`unexpected provider request: ${address.pathname}`);
      },
    );
    const port = createZeloFinanceService(
      {
        MEND_ZELO_SUPABASE_SERVICE_ROLE_KEY: "fake-supabase",
        MEND_ZELO_ABACATEPAY_READ_KEY: "fake-abacate",
      },
      fetcher as typeof fetch,
    );
    const feed = await port.month("2026-10-01");
    expect(
      feed.rows.find((row) => row.provider === "abacatepay"),
    ).toMatchObject({
      receivedCents: 5900,
      feeCents: 80,
      netCents: 5820,
    });
    expect(JSON.stringify(feed)).not.toContain("must-not-leak");
    expect(calls).toHaveLength(3);
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
          expect(address.searchParams.getAll("expand[]")).toEqual([
            "data.charge.balance_transaction",
          ]);
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
  it("falls back to gross invoice rows when Stripe expansion is unavailable", async () => {
    const fetcher = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        expect(init?.method).toBe("GET");
        const address = new URL(String(url));
        if (address.pathname.endsWith("subscriptions"))
          return new Response(
            JSON.stringify([{ provider_customer_id: "cus_zelo" }]),
            { status: 200 },
          );
        if (address.searchParams.has("expand[]"))
          return new Response(
            JSON.stringify({ error: { message: "Expansion unavailable" } }),
            { status: 403 },
          );
        return new Response(
          JSON.stringify({ data: [invoice()], has_more: false }),
          { status: 200 },
        );
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
    expect(feed.providers.stripe).toBe("ok");
    expect(feed.rows.find((row) => row.provider === "stripe")).toMatchObject({
      receivedCents: 5900,
      feeCents: null,
      netCents: null,
      availableAt: null,
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
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
