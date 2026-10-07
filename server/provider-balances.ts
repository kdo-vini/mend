import { z } from "zod";

export type ProviderBalanceStatus =
  | "not_configured"
  | "unavailable"
  | "ok"
  | "partial";

export interface ProviderCurrencyBalance {
  currency: string;
  availableMinor: number;
  pendingMinor: number;
}

export interface ProviderPayout {
  id: string;
  status: "pending" | "in_transit";
  currency: string;
  amountMinor: number;
  feeMinor: number | null;
  /** Provider-confirmed deposited amount, when the API defines it. */
  netMinor: number | null;
  arrivalAt: string | null;
  createdAt: string | null;
}

export interface ProviderBalance {
  status: ProviderBalanceStatus;
  /** The credential's whole provider account, not Zelo-only revenue. */
  scope: "provider_account";
  balances: ProviderCurrencyBalance[] | null;
  payouts: ProviderPayout[];
}

export interface ProviderBalances {
  checkedAt: string;
  providers: {
    stripe: ProviderBalance;
    abacatepay: ProviderBalance;
  };
}

const stripeMoney = z.object({
  amount: z.number().int(),
  currency: z.string().regex(/^[a-zA-Z]{3}$/),
});
const stripeBalanceSchema = z.object({
  livemode: z.literal(true),
  available: z.array(stripeMoney),
  pending: z.array(stripeMoney),
});
const stripePayoutSchema = z.object({
  id: z.string().min(1),
  amount: z.number().int(),
  currency: z.string().regex(/^[a-zA-Z]{3}$/),
  arrival_date: z.number().int().nonnegative().nullable().optional(),
  created: z.number().int().nonnegative().nullable().optional(),
  status: z.enum(["pending", "in_transit", "paid", "failed", "canceled"]),
  livemode: z.literal(true),
});
const stripePayoutPageSchema = z.object({
  data: z.array(stripePayoutSchema),
  has_more: z.boolean(),
});

const abacateStoreSchema = z.object({
  success: z.literal(true),
  data: z.object({
    balance: z.object({
      available: z.number().int().nonnegative(),
      pending: z.number().int().nonnegative(),
    }),
  }),
});
const abacatePayoutSchema = z.object({
  id: z.string().min(1),
  kind: z.string().optional(),
  status: z.string(),
  amount: z.number().int().nonnegative(),
  platformFee: z.number().int().nonnegative(),
  createdAt: z.string().datetime({ offset: true }).nullable().optional(),
  devMode: z.boolean(),
});
const abacatePayoutPageSchema = z.object({
  success: z.literal(true),
  data: z.array(abacatePayoutSchema),
  pagination: z.object({
    hasMore: z.boolean(),
    next: z.string().nullable().optional(),
  }),
});

const EMPTY_PROVIDER: ProviderBalance = {
  status: "not_configured",
  scope: "provider_account",
  balances: null,
  payouts: [],
};
const MAX_PAGES = 5;
const PAGE_SIZE = 100;
const REQUEST_TIMEOUT_MS = 12_000;

function unixIso(seconds: number | null | undefined) {
  return seconds == null ? null : new Date(seconds * 1000).toISOString();
}

function normalizeCurrency(value: string) {
  return value.toUpperCase();
}

function stripeBalances(
  available: z.infer<typeof stripeBalanceSchema>["available"],
  pending: z.infer<typeof stripeBalanceSchema>["pending"],
) {
  const byCurrency = new Map<string, ProviderCurrencyBalance>();
  for (const row of available) {
    const currency = normalizeCurrency(row.currency);
    const current = byCurrency.get(currency) ?? {
      currency,
      availableMinor: 0,
      pendingMinor: 0,
    };
    current.availableMinor += row.amount;
    byCurrency.set(currency, current);
  }
  for (const row of pending) {
    const currency = normalizeCurrency(row.currency);
    const current = byCurrency.get(currency) ?? {
      currency,
      availableMinor: 0,
      pendingMinor: 0,
    };
    current.pendingMinor += row.amount;
    byCurrency.set(currency, current);
  }
  return [...byCurrency.values()].sort((a, b) =>
    a.currency.localeCompare(b.currency),
  );
}

function stripePayout(
  row: z.infer<typeof stripePayoutSchema>,
): ProviderPayout | null {
  if (row.status !== "pending" && row.status !== "in_transit") return null;
  return {
    id: row.id,
    status: row.status,
    currency: normalizeCurrency(row.currency),
    amountMinor: row.amount,
    // The payout object exposes the transfer amount, not Stripe processing fees.
    feeMinor: null,
    netMinor: row.amount,
    arrivalAt: unixIso(row.arrival_date),
    createdAt: unixIso(row.created),
  };
}

function abacatePayout(
  row: z.infer<typeof abacatePayoutSchema>,
): ProviderPayout | null {
  if (row.devMode || (row.kind && row.kind !== "WITHDRAW")) return null;
  const status = row.status.toUpperCase();
  if (status !== "PENDING" && status !== "IN_TRANSIT") return null;
  return {
    id: row.id,
    status: status === "PENDING" ? "pending" : "in_transit",
    currency: "BRL",
    amountMinor: row.amount,
    feeMinor: row.platformFee,
    // AbacatePay does not define the amount/fee relationship as a deposited net.
    netMinor: null,
    // Its withdrawal response has creation/update timestamps, not an arrival ETA.
    arrivalAt: null,
    createdAt: row.createdAt ?? null,
  };
}

/** Read-only, fixed-origin provider adapters for account-wide balances and unsettled payouts. */
export function createProviderBalancesService(
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
  now = Date.now,
) {
  const stripeKey = env.MEND_ZELO_STRIPE_READ_KEY?.trim();
  const abacateKey = env.MEND_ZELO_ABACATEPAY_READ_KEY?.trim();

  async function get(
    url: string,
    headers: Record<string, string>,
    signal: AbortSignal,
  ) {
    const response = await fetcher(url, {
      method: "GET",
      headers,
      redirect: "error",
      signal,
    });
    if (!response.ok) throw new Error("provider_source_unavailable");
    return response.json() as Promise<unknown>;
  }

  async function loadStripe(): Promise<ProviderBalance> {
    if (!stripeKey) return { ...EMPTY_PROVIDER };
    if (/^(sk|rk)_test_/.test(stripeKey))
      return { ...EMPTY_PROVIDER, status: "unavailable" };
    const headers = {
      Authorization: `Bearer ${stripeKey}`,
      "Stripe-Version": "2024-06-20",
    };
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    let balances: ProviderCurrencyBalance[] | null = null;
    let payouts: ProviderPayout[] = [];
    let balanceOk = false;
    let payoutsOk = false;
    try {
      const raw = await get(
        "https://api.stripe.com/v1/balance",
        headers,
        signal,
      );
      const result = stripeBalanceSchema.parse(raw);
      balances = stripeBalances(result.available, result.pending);
      balanceOk = true;
    } catch {
      // Keep provider errors and response bodies out of the returned DTO.
    }
    const rows: z.infer<typeof stripePayoutSchema>[] = [];
    try {
      let cursor: string | null = null;
      let complete = false;
      for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex++) {
        const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
        if (cursor) query.set("starting_after", cursor);
        const raw = await get(
          `https://api.stripe.com/v1/payouts?${query}`,
          headers,
          signal,
        );
        const page = stripePayoutPageSchema.parse(raw);
        rows.push(...page.data);
        if (!page.has_more) {
          complete = true;
          break;
        }
        const lastId = page.data.at(-1)?.id;
        if (!lastId) throw new Error("provider_invalid_cursor");
        cursor = lastId;
      }
      payoutsOk = complete;
    } catch {
      // An incomplete or invalid page is not represented as a complete empty list.
    }
    payouts = rows.flatMap((row) => {
      const payout = stripePayout(row);
      return payout ? [payout] : [];
    });
    return {
      status:
        balanceOk && payoutsOk
          ? "ok"
          : balanceOk || payoutsOk
            ? "partial"
            : "unavailable",
      scope: "provider_account",
      balances,
      payouts,
    };
  }

  async function loadAbacatePay(): Promise<ProviderBalance> {
    if (!abacateKey) return { ...EMPTY_PROVIDER };
    let balances: ProviderCurrencyBalance[] | null = null;
    let payouts: ProviderPayout[] = [];
    let balanceOk = false;
    let payoutsOk = false;
    const headers = { Authorization: `Bearer ${abacateKey}` };
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    try {
      const raw = await get(
        "https://api.abacatepay.com/v2/stores/get",
        headers,
        signal,
      );
      const result = abacateStoreSchema.parse(raw);
      balances = [
        {
          currency: "BRL",
          availableMinor: result.data.balance.available,
          pendingMinor: result.data.balance.pending,
        },
      ];
      balanceOk = true;
    } catch {
      // Keep provider errors and response bodies out of the returned DTO.
    }
    const rows: z.infer<typeof abacatePayoutSchema>[] = [];
    try {
      let cursor: string | null = null;
      let complete = false;
      for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex++) {
        const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
        if (cursor) query.set("after", cursor);
        const raw = await get(
          `https://api.abacatepay.com/v2/payouts/list?${query}`,
          headers,
          signal,
        );
        const page = abacatePayoutPageSchema.parse(raw);
        rows.push(...page.data);
        if (!page.pagination.hasMore) {
          complete = true;
          break;
        }
        const next = page.pagination.next;
        if (!next) throw new Error("provider_invalid_cursor");
        cursor = next;
      }
      payoutsOk = complete;
    } catch {
      // An incomplete or invalid page is not represented as a complete empty list.
    }
    payouts = rows.flatMap((row) => {
      const payout = abacatePayout(row);
      return payout ? [payout] : [];
    });
    return {
      status:
        balanceOk && payoutsOk
          ? "ok"
          : balanceOk || payoutsOk
            ? "partial"
            : "unavailable",
      scope: "provider_account",
      balances,
      payouts,
    };
  }

  return {
    async load(): Promise<ProviderBalances> {
      const [stripe, abacatepay] = await Promise.all([
        loadStripe(),
        loadAbacatePay(),
      ]);
      return {
        checkedAt: new Date(now()).toISOString(),
        providers: { stripe, abacatepay },
      };
    },
  };
}
