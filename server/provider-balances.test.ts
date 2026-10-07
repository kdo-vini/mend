import { describe, expect, it, vi } from "vitest";
import { createProviderBalancesService } from "./provider-balances";

const stripeBalance = {
  livemode: true,
  available: [
    { currency: "usd", amount: 1200 },
    { currency: "usd", amount: 300 },
    { currency: "jpy", amount: 44 },
  ],
  pending: [
    { currency: "usd", amount: 250 },
    { currency: "eur", amount: 0 },
  ],
};
const stripePayout = (overrides: Record<string, unknown> = {}) => ({
  id: "po_live_1",
  amount: 1000,
  currency: "usd",
  arrival_date: 1_800_000_000,
  created: 1_799_000_000,
  status: "pending",
  livemode: true,
  ...overrides,
});
const abacateStore = {
  success: true,
  data: { balance: { available: 7800, pending: 600, blocked: 10 } },
};
const abacatePayout = (overrides: Record<string, unknown> = {}) => ({
  id: "tran_live_1",
  kind: "WITHDRAW",
  status: "PENDING",
  amount: 3000,
  platformFee: 80,
  createdAt: "2026-10-06T12:00:00.000Z",
  devMode: false,
  ...overrides,
});

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("ProviderBalancesService", () => {
  it("marks missing credentials separately without making requests", async () => {
    const fetcher = vi.fn();
    const result = await createProviderBalancesService(
      {},
      fetcher,
      () => 0,
    ).load();
    expect(result).toEqual({
      checkedAt: "1970-01-01T00:00:00.000Z",
      providers: {
        stripe: {
          status: "not_configured",
          scope: "provider_account",
          balances: null,
          payouts: [],
        },
        abacatepay: {
          status: "not_configured",
          scope: "provider_account",
          balances: null,
          payouts: [],
        },
      },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reads only live Stripe account balance and pending/in-transit payouts", async () => {
    const fetcher = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        expect(init?.method).toBe("GET");
        expect(init?.redirect).toBe("error");
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        expect(new Headers(init?.headers).get("Authorization")).toBe(
          "Bearer rk_live_secret",
        );
        expect(new Headers(init?.headers).get("Stripe-Version")).toBe(
          "2024-06-20",
        );
        const address = new URL(String(url));
        expect(address.origin).toBe("https://api.stripe.com");
        if (address.pathname === "/v1/balance") return response(stripeBalance);
        expect(address.pathname).toBe("/v1/payouts");
        expect(address.searchParams.get("limit")).toBe("100");
        return response({
          data: [
            stripePayout(),
            stripePayout({
              id: "po_live_2",
              status: "in_transit",
              arrival_date: null,
            }),
            stripePayout({ id: "po_paid", status: "paid" }),
          ],
          has_more: false,
        });
      },
    );
    const result = await createProviderBalancesService(
      { MEND_ZELO_STRIPE_READ_KEY: "rk_live_secret" },
      fetcher as typeof fetch,
    ).load();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.providers.stripe).toEqual({
      status: "ok",
      scope: "provider_account",
      balances: [
        { currency: "EUR", availableMinor: 0, pendingMinor: 0 },
        { currency: "JPY", availableMinor: 44, pendingMinor: 0 },
        { currency: "USD", availableMinor: 1500, pendingMinor: 250 },
      ],
      payouts: [
        {
          id: "po_live_1",
          status: "pending",
          currency: "USD",
          amountMinor: 1000,
          feeMinor: null,
          netMinor: 1000,
          arrivalAt: new Date(1_800_000_000_000).toISOString(),
          createdAt: new Date(1_799_000_000_000).toISOString(),
        },
        {
          id: "po_live_2",
          status: "in_transit",
          currency: "USD",
          amountMinor: 1000,
          feeMinor: null,
          netMinor: 1000,
          arrivalAt: null,
          createdAt: new Date(1_799_000_000_000).toISOString(),
        },
      ],
    });
  });

  it("rejects test keys and rejects Stripe test-mode payloads", async () => {
    const fetcher = vi.fn(async () => response(stripeBalance));
    const testKey = await createProviderBalancesService(
      { MEND_ZELO_STRIPE_READ_KEY: "sk_test_fake" },
      fetcher as typeof fetch,
    ).load();
    expect(testKey.providers.stripe.status).toBe("unavailable");
    expect(fetcher).not.toHaveBeenCalled();

    const payload = await createProviderBalancesService(
      { MEND_ZELO_STRIPE_READ_KEY: "rk_live_fake" },
      vi.fn(async () =>
        response({ ...stripeBalance, livemode: false }),
      ) as typeof fetch,
    ).load();
    expect(payload.providers.stripe.status).toBe("unavailable");
  });

  it("keeps AbacatePay real zero values, provider fee, and no invented arrival/net", async () => {
    const fetcher = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        expect(init?.method).toBe("GET");
        expect(init?.redirect).toBe("error");
        expect(new Headers(init?.headers).get("Authorization")).toBe(
          "Bearer aba_live_secret",
        );
        const address = new URL(String(url));
        expect(address.origin).toBe("https://api.abacatepay.com");
        if (address.pathname === "/v2/stores/get")
          return response(abacateStore);
        expect(address.pathname).toBe("/v2/payouts/list");
        expect(address.searchParams.get("limit")).toBe("100");
        return response({
          success: true,
          data: [
            abacatePayout(),
            abacatePayout({ id: "tran_done", status: "COMPLETE" }),
            abacatePayout({ id: "tran_dev", devMode: true }),
          ],
          pagination: { hasMore: false, next: null },
        });
      },
    );
    const result = await createProviderBalancesService(
      { MEND_ZELO_ABACATEPAY_READ_KEY: "aba_live_secret" },
      fetcher as typeof fetch,
    ).load();
    expect(result.providers.abacatepay).toEqual({
      status: "ok",
      scope: "provider_account",
      balances: [{ currency: "BRL", availableMinor: 7800, pendingMinor: 600 }],
      payouts: [
        {
          id: "tran_live_1",
          status: "pending",
          currency: "BRL",
          amountMinor: 3000,
          feeMinor: 80,
          netMinor: null,
          arrivalAt: null,
          createdAt: "2026-10-06T12:00:00.000Z",
        },
      ],
    });
  });

  it("distinguishes valid zero from a missing balance field", async () => {
    const make = (store: unknown) =>
      createProviderBalancesService(
        { MEND_ZELO_ABACATEPAY_READ_KEY: "aba_live" },
        vi.fn(async (url: string | URL | Request) =>
          String(url).includes("stores/get")
            ? response(store)
            : response({
                success: true,
                data: [],
                pagination: { hasMore: false },
              }),
        ) as typeof fetch,
      ).load();
    const zero = await make({
      success: true,
      data: { balance: { available: 0, pending: 0 } },
    });
    expect(zero.providers.abacatepay.status).toBe("ok");
    expect(zero.providers.abacatepay.balances?.[0]).toEqual({
      currency: "BRL",
      availableMinor: 0,
      pendingMinor: 0,
    });

    const missing = await make({ success: true, data: { balance: {} } });
    expect(missing.providers.abacatepay.status).toBe("partial");
    expect(missing.providers.abacatepay.balances).toBeNull();
  });

  it("marks providers partial on bounded/truncated pages and unavailable on HTTP failure", async () => {
    const partialStripe = await createProviderBalancesService(
      { MEND_ZELO_STRIPE_READ_KEY: "rk_live" },
      vi.fn(async (url: string | URL | Request) =>
        String(url).includes("/balance")
          ? response(stripeBalance)
          : response({ data: [stripePayout()], has_more: true }),
      ) as typeof fetch,
    ).load();
    expect(partialStripe.providers.stripe.status).toBe("partial");

    const unavailable = await createProviderBalancesService(
      { MEND_ZELO_ABACATEPAY_READ_KEY: "aba_live" },
      vi.fn(async () =>
        response({ error: "private provider text" }, 503),
      ) as typeof fetch,
    ).load();
    expect(unavailable.providers.abacatepay.status).toBe("unavailable");
    expect(JSON.stringify(unavailable)).not.toContain("private provider text");
  });

  it("paginates AbacatePay with its opaque next cursor and bounded query contract", async () => {
    let payoutPage = 0;
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const address = new URL(String(url));
      if (address.pathname.endsWith("stores/get"))
        return response(abacateStore);
      payoutPage++;
      expect(address.searchParams.get("limit")).toBe("100");
      if (payoutPage === 1) {
        expect(address.searchParams.has("after")).toBe(false);
        return response({
          success: true,
          data: [abacatePayout()],
          pagination: { hasMore: true, next: "opaque-next-cursor" },
        });
      }
      expect(address.searchParams.get("after")).toBe("opaque-next-cursor");
      return response({
        success: true,
        data: [],
        pagination: { hasMore: false, next: null },
      });
    });
    const result = await createProviderBalancesService(
      { MEND_ZELO_ABACATEPAY_READ_KEY: "aba_live" },
      fetcher as typeof fetch,
    ).load();
    expect(payoutPage).toBe(2);
    expect(result.providers.abacatepay.status).toBe("ok");
    expect(result.providers.abacatepay.payouts).toHaveLength(1);
  });
});
