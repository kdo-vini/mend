import { z } from "zod";

const cents = z.number().int().nonnegative().max(100_000_000_000);
// Stripe zero-decimal charge units -> the feed's uniform hundredths convention.
// ISK/UGX remain two-decimal API units for compatibility; HUF/TWD charges too.
// https://docs.stripe.com/currencies#zero-decimal
const stripeZeroDecimal = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);
const stripeCents = (value: number, currency: string) =>
  cents.parse(
    value * (stripeZeroDecimal.has(currency.toUpperCase()) ? 100 : 1),
  );
const pixSchema = z.object({
  id: z.string(),
  provider_payment_id: z.string().nullable(),
  provider: z.string(),
  currency: z.string().regex(/^[a-zA-Z]{3}$/),
  status: z.string(),
  amount_expected_cents: cents,
  amount_paid_cents: cents.nullable(),
  created_at: z.string().datetime({ offset: true }),
  paid_at: z.string().datetime({ offset: true }).nullable(),
});
const invoiceSchema = z.object({
  id: z.string(),
  customer: z.union([z.string(), z.object({ id: z.string() }), z.null()]),
  livemode: z.boolean(),
  currency: z.string().regex(/^[a-zA-Z]{3}$/),
  status: z.string().nullable(),
  amount_due: cents,
  amount_paid: cents,
  created: z.number().int().nonnegative(),
  status_transitions: z.object({
    paid_at: z.number().int().nonnegative().nullable(),
  }),
  charge: z
    .union([
      z.string(),
      z
        .object({
          id: z.string(),
          paid: z.boolean(),
          livemode: z.boolean(),
          amount: cents,
          amount_refunded: cents,
          refunded: z.boolean(),
          disputed: z.boolean(),
          currency: z.string().regex(/^[a-zA-Z]{3}$/),
          balance_transaction: z.union([
            z.string(),
            z
              .object({
                amount: cents,
                fee: cents,
                net: z.number().int(),
                currency: z.string().regex(/^[a-zA-Z]{3}$/),
                available_on: z.number().int().nonnegative(),
              })
              .nullable(),
          ]),
        })
        .nullable(),
    ])
    .optional(),
});
type Pix = z.infer<typeof pixSchema>;
type Invoice = z.infer<typeof invoiceSchema>;
const abacateCheckoutSchema = z.object({
  success: z.literal(true),
  data: z
    .object({
      id: z.string(),
      amount: cents,
      paidAmount: cents.nullable(),
      status: z.string(),
      devMode: z.boolean(),
    })
    .nullable(),
});
const bankMovementSchema = z.object({
  amount: cents,
  kind: z.string(),
  method: z.string(),
  category: z.string(),
  balanceEffect: z.enum(["credit", "debit", "none"]),
});
const bankStatementItemSchema = z.object({
  id: z.string(),
  movements: z.array(bankMovementSchema),
  currency: z.string().regex(/^[a-zA-Z]{3}$/),
  createdAt: z.string().datetime({ offset: true }),
  checkoutId: z.string().nullable(),
  paymentIntentId: z.string().nullable(),
});
const bankStatementPageSchema = z.object({
  success: z.literal(true),
  data: z.array(bankStatementItemSchema),
  pagination: z.object({ hasMore: z.boolean(), next: z.string().nullable() }),
});
export type ZeloProviderState =
  | "ok"
  | "not_configured"
  | "unavailable"
  | "partial";
export interface ZeloPayment {
  id: string;
  externalId: string;
  provider: "abacatepay" | "stripe";
  currency: string;
  status:
    | "paid"
    | "pending"
    | "failed"
    | "expired"
    | "cancelled"
    | "uncollectible";
  createdAt: string;
  paidAt: string | null;
  billedCents: number;
  receivedCents: number | null;
  /** Provider processing fee, when verified from its settlement record. */
  feeCents?: number | null;
  /** Net credited to the provider balance, not a bank payout. */
  netCents?: number | null;
  /** Provider balance availability time; does not mean bank deposit time. */
  availableAt?: string | null;
}
export interface ZeloFinanceFeed {
  period: string;
  checkedAt: string;
  providers: { abacatepay: ZeloProviderState; stripe: ZeloProviderState };
  rows: ZeloPayment[];
  totals: Array<{
    currency: string;
    billedCents: number;
    receivedCents: number;
    pendingCents: number;
    netKnownCents?: number;
    unknownNetCount?: number;
  }>;
}
interface SourcePage<T> {
  rows: T[];
  complete: boolean;
}
export interface ZeloFinanceSources {
  pix?: (start: string, end: string) => Promise<SourcePage<Pix>>;
  checkout?: (id: string, signal: AbortSignal) => Promise<unknown>;
  bankStatement?: (
    startDate: string,
    endDate: string,
    after: string | null,
    signal: AbortSignal,
  ) => Promise<unknown>;
  customers?: () => Promise<Set<string>>;
  stripe?: (end: string) => Promise<SourcePage<Invoice>>;
}

/** Payment calendar, not accrual accounting. Resolve historical Brazilian DST too. */
export function zeloMonthBounds(period: string) {
  if (!/^(20\d{2})-(0[1-9]|1[0-2])-01$/.test(period))
    throw new Error("invalid_zelo_period");
  const [year, month] = period.split("-").map(Number);
  const midnight = (monthIndex: number) => {
    const day = new Date(Date.UTC(year, monthIndex, 1));
    const offset = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      timeZoneName: "longOffset",
    })
      .formatToParts(new Date(day.getTime() + 12 * 3600000))
      .find((part) => part.type === "timeZoneName")!.value;
    const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(offset);
    if (!match) throw new Error("zelo_timezone_unavailable");
    const minutes =
      (Number(match[2]) * 60 + Number(match[3])) * (match[1] === "+" ? 1 : -1);
    return new Date(day.getTime() - minutes * 60000).toISOString();
  };
  return { start: midnight(month - 1), end: midnight(month) };
}
const inRange = (value: string | null, start: string, end: string) =>
  value !== null &&
  Date.parse(value) >= Date.parse(start) &&
  Date.parse(value) < Date.parse(end);

/** Process memory only. The route MUST authorize membership + finance grant before every cache read. */
export class ZeloFinanceService {
  private cache = new Map<string, { expires: number; feed: ZeloFinanceFeed }>();
  private pending = new Map<string, Promise<ZeloFinanceFeed>>();
  constructor(
    private sources: ZeloFinanceSources,
    private now = Date.now,
  ) {}

  async month(period: string): Promise<ZeloFinanceFeed> {
    zeloMonthBounds(period);
    const cached = this.cache.get(period);
    if (cached && cached.expires > this.now()) return cached.feed;
    const pending = this.pending.get(period);
    if (pending) return pending;
    const request = this.load(period)
      .then((feed) => {
        if (this.cache.size >= 6)
          this.cache.delete(this.cache.keys().next().value!);
        const complete = Object.values(feed.providers).every(
          (state) => state === "ok",
        );
        this.cache.set(period, {
          feed,
          expires: this.now() + (complete ? 60000 : 5000),
        });
        return feed;
      })
      .finally(() => this.pending.delete(period));
    this.pending.set(period, request);
    return request;
  }

  private async load(period: string): Promise<ZeloFinanceFeed> {
    const { start, end } = zeloMonthBounds(period);
    const providers: ZeloFinanceFeed["providers"] = {
      abacatepay: "not_configured",
      stripe: "not_configured",
    };
    const rows = new Map<string, ZeloPayment>();
    const tasks: Promise<void>[] = [];
    if (this.sources.pix)
      tasks.push(
        (async () => {
          try {
            const page = await this.sources.pix!(start, end);
            providers.abacatepay = page.complete ? "ok" : "partial";
            for (const raw of page.rows) {
              const row = pixSchema.parse(raw);
              if (row.provider !== "abacatepay") continue;
              if (row.status === "paid" && row.paid_at === null)
                providers.abacatepay = "partial";
              if (
                !inRange(row.created_at, start, end) &&
                !inRange(row.paid_at, start, end)
              )
                continue;
              const status =
                row.status === "paid"
                  ? "paid"
                  : row.status === "expired"
                    ? "expired"
                    : row.status === "cancelled"
                      ? "cancelled"
                      : row.status === "pending"
                        ? "pending"
                        : "failed";
              if (
                status === "paid" &&
                (row.amount_paid_cents === null || row.paid_at === null)
              )
                providers.abacatepay = "partial";
              const externalId = row.provider_payment_id ?? row.id;
              rows.set(`abacatepay:${externalId}`, {
                id: `abacatepay:${externalId}`,
                externalId,
                provider: "abacatepay",
                currency: row.currency.toUpperCase(),
                status,
                createdAt: row.created_at,
                paidAt: row.paid_at,
                billedCents: row.amount_expected_cents,
                receivedCents: status === "paid" ? row.amount_paid_cents : 0,
                feeCents: null,
                netCents: null,
                availableAt: null,
              });
            }
          } catch {
            providers.abacatepay = "unavailable";
          }
        })(),
      );
    if (this.sources.stripe && this.sources.customers)
      tasks.push(
        (async () => {
          try {
            const [customers, page] = await Promise.all([
              this.sources.customers!(),
              this.sources.stripe!(end),
            ]);
            providers.stripe = page.complete ? "ok" : "partial";
            for (const raw of page.rows) {
              const row = invoiceSchema.parse(raw);
              const customer =
                typeof row.customer === "string"
                  ? row.customer
                  : row.customer?.id;
              if (
                !row.livemode ||
                !customer ||
                !customers.has(customer) ||
                row.status === "draft"
              )
                continue;
              const createdAt = new Date(row.created * 1000).toISOString();
              const paidAt =
                row.status_transitions.paid_at === null
                  ? null
                  : new Date(
                      row.status_transitions.paid_at * 1000,
                    ).toISOString();
              if (
                !inRange(createdAt, start, end) &&
                !inRange(paidAt, start, end)
              )
                continue;
              const status =
                row.status === "paid"
                  ? "paid"
                  : row.status === "open"
                    ? "pending"
                    : row.status === "void"
                      ? "cancelled"
                      : row.status === "uncollectible"
                        ? "uncollectible"
                        : "failed";
              const settlement = verifiedStripeSettlement(row);
              if (status === "paid" && paidAt === null)
                providers.stripe = "partial";
              rows.set(`stripe:${row.id}`, {
                id: `stripe:${row.id}`,
                externalId: row.id,
                provider: "stripe",
                currency: row.currency.toUpperCase(),
                status,
                createdAt,
                paidAt,
                billedCents: stripeCents(row.amount_due, row.currency),
                receivedCents: stripeCents(row.amount_paid, row.currency),
                feeCents: settlement?.feeCents ?? null,
                netCents: settlement?.netCents ?? null,
                availableAt: settlement?.availableAt ?? null,
              });
            }
          } catch {
            providers.stripe = "unavailable";
          }
        })(),
      );
    await Promise.all(tasks);
    if (this.sources.checkout && this.sources.bankStatement)
      await this.enrichAbacateFees([...rows.values()], start, end);
    // If a source fails during normalization, none of its partial rows imply a complete result.
    for (const [key, row] of rows)
      if (providers[row.provider] === "unavailable") rows.delete(key);
    const totals = new Map<string, ZeloFinanceFeed["totals"][number]>();
    for (const row of rows.values()) {
      const total = totals.get(row.currency) ?? {
        currency: row.currency,
        billedCents: 0,
        receivedCents: 0,
        pendingCents: 0,
        netKnownCents: 0,
        unknownNetCount: 0,
      };
      if (
        inRange(row.createdAt, start, end) &&
        row.status !== "cancelled" &&
        row.status !== "expired"
      )
        total.billedCents += row.billedCents;
      if (inRange(row.paidAt, start, end))
        total.receivedCents += row.receivedCents ?? 0;
      if (row.status === "paid" && inRange(row.paidAt, start, end)) {
        if (row.netCents === null || row.netCents === undefined)
          total.unknownNetCount! += 1;
        else total.netKnownCents! += row.netCents;
      }
      if (
        inRange(row.createdAt, start, end) &&
        (row.status === "pending" || row.status === "failed")
      )
        total.pendingCents += Math.max(
          0,
          row.billedCents - (row.receivedCents ?? 0),
        );
      totals.set(row.currency, total);
    }
    return {
      period,
      checkedAt: new Date(this.now()).toISOString(),
      providers,
      rows: [...rows.values()].sort((a, b) =>
        (b.paidAt ?? b.createdAt).localeCompare(a.paidAt ?? a.createdAt),
      ),
      totals: [...totals.values()].sort((a, b) =>
        a.currency.localeCompare(b.currency),
      ),
    };
  }

  private async enrichAbacateFees(
    rows: ZeloPayment[],
    start: string,
    end: string,
  ) {
    const candidates = rows
      .filter(
        (row) =>
          row.provider === "abacatepay" &&
          row.status === "paid" &&
          row.currency === "BRL" &&
          row.receivedCents !== null &&
          row.paidAt !== null &&
          inRange(row.paidAt, start, end) &&
          /^bill_[A-Za-z0-9_-]+$/.test(row.externalId),
      )
      .slice(0, 100);
    if (!candidates.length) return;

    const controller = new AbortController();
    let timeout: NodeJS.Timeout | undefined;
    const timedOut = new Promise<boolean>((resolve) => {
      timeout = setTimeout(() => {
        controller.abort();
        resolve(true);
      }, 12000);
      timeout.unref?.();
    });
    const work = (async () => {
      const checkouts = new Map<string, ZeloPayment>();
      let cursor = 0;
      const workers = Array.from(
        { length: Math.min(4, candidates.length) },
        async () => {
          while (!controller.signal.aborted) {
            const index = cursor++;
            if (index >= candidates.length) return;
            const row = candidates[index]!;
            try {
              const checkout = abacateCheckoutSchema.parse(
                await this.sources.checkout!(row.externalId, controller.signal),
              ).data;
              if (
                !controller.signal.aborted &&
                checkout &&
                checkout.id === row.externalId &&
                checkout.status === "PAID" &&
                !checkout.devMode &&
                checkout.amount === row.billedCents &&
                checkout.paidAmount === row.receivedCents
              )
                checkouts.set(checkout.id, row);
            } catch {
              // Keep gross receipt data; unverified net stays unknown.
            }
          }
        },
      );
      await Promise.all(workers);
      if (controller.signal.aborted || !checkouts.size) return;

      const statements = new Map<
        string,
        z.infer<typeof bankStatementItemSchema>[]
      >();
      const endDateParts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .formatToParts(new Date(end))
        .reduce<Record<string, number>>((parts, part) => {
          if (
            part.type === "year" ||
            part.type === "month" ||
            part.type === "day"
          )
            parts[part.type] = Number(part.value);
          return parts;
        }, {});
      const endDate = new Date(
        Date.UTC(
          endDateParts.year!,
          endDateParts.month! - 1,
          endDateParts.day! - 1,
        ),
      )
        .toISOString()
        .slice(0, 10);
      let after: string | null = null;
      let complete = false;
      for (let pageIndex = 0; pageIndex < 10; pageIndex++) {
        if (controller.signal.aborted) return;
        const rawPage = await this.sources.bankStatement!(
          start.slice(0, 10),
          endDate,
          after,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        const page = bankStatementPageSchema.parse(rawPage);
        for (const item of page.data) {
          if (!item.checkoutId || !checkouts.has(item.checkoutId)) continue;
          const matches = statements.get(item.checkoutId) ?? [];
          matches.push(item);
          statements.set(item.checkoutId, matches);
        }
        if (!page.pagination.hasMore) {
          complete = true;
          break;
        }
        if (!page.pagination.next || page.pagination.next === after) return;
        after = page.pagination.next;
      }
      // A truncated monthly statement cannot establish that all movements exist.
      if (!complete || controller.signal.aborted) return;

      for (const [checkoutId, row] of checkouts) {
        const matches = statements.get(checkoutId) ?? [];
        if (matches.length !== 1) continue;
        const statement = matches[0]!;
        if (statement.currency.toUpperCase() !== row.currency) continue;
        const credits = statement.movements.filter(
          (movement) =>
            movement.kind === "DEPOSIT" &&
            ["PIX", "PIX_QRCODE"].includes(movement.method) &&
            movement.category === "transaction" &&
            movement.balanceEffect === "credit",
        );
        const fees = statement.movements.filter(
          (movement) =>
            ["PIX", "PIX_QRCODE"].includes(movement.method) &&
            movement.category === "fee" &&
            movement.balanceEffect === "debit",
        );
        if (
          statement.movements.length !== 2 ||
          credits.length !== 1 ||
          fees.length !== 1 ||
          credits[0]!.amount !== row.receivedCents ||
          fees[0]!.amount > credits[0]!.amount
        )
          continue;
        const feeCents = fees[0]!.amount;
        row.feeCents = feeCents;
        row.netCents = credits[0]!.amount - feeCents;
      }
    })();

    try {
      await Promise.race([work, timedOut]);
    } catch {
      // Keep verified gross receipt data and leave unresolved net unknown.
    } finally {
      if (timeout) clearTimeout(timeout);
      controller.abort();
    }
  }
}

function verifiedStripeSettlement(
  invoice: Invoice,
): { feeCents: number; netCents: number; availableAt: string } | null {
  const charge = invoice.charge;
  if (
    invoice.status !== "paid" ||
    charge === undefined ||
    charge === null ||
    typeof charge === "string" ||
    !charge.paid ||
    !charge.livemode ||
    charge.amount !== invoice.amount_paid ||
    charge.currency.toLowerCase() !== invoice.currency.toLowerCase() ||
    charge.amount_refunded !== 0 ||
    charge.refunded ||
    charge.disputed ||
    typeof charge.balance_transaction === "string" ||
    charge.balance_transaction === null
  )
    return null;

  const balance = charge.balance_transaction;
  if (
    balance.currency.toLowerCase() !== invoice.currency.toLowerCase() ||
    balance.amount !== charge.amount ||
    balance.net !== balance.amount - balance.fee
  )
    return null;

  return {
    feeCents: stripeCents(balance.fee, balance.currency),
    netCents: stripeCents(balance.net, balance.currency),
    availableAt: new Date(balance.available_on * 1000).toISOString(),
  };
}

const ZELO_URL = "https://xnnjyrblpvsqrtsshawa.supabase.co";
/** Only fixed-origin GETs; no caller-controlled table, URL, JWT or provider mutation. */
export function createZeloFinanceService(
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
) {
  const supabaseKey = env.MEND_ZELO_SUPABASE_SERVICE_ROLE_KEY?.trim();
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
      signal,
      redirect: "error",
    });
    if (!response.ok) throw new Error("zelo_source_unavailable");
    return response.json() as Promise<unknown>;
  }
  async function rest(
    table: "billing_payments" | "subscriptions",
    query: URLSearchParams,
    signal: AbortSignal,
  ) {
    const rows: unknown[] = [];
    for (let offset = 0; offset < 10000; offset += 500) {
      query.set("limit", "500");
      query.set("offset", String(offset));
      const page = z
        .array(z.unknown())
        .parse(
          await get(
            `${ZELO_URL}/rest/v1/${table}?${query}`,
            { apikey: supabaseKey!, Authorization: `Bearer ${supabaseKey}` },
            signal,
          ),
        );
      rows.push(...page);
      if (page.length < 500) return { rows, complete: true };
    }
    return { rows, complete: false };
  }
  const sources: ZeloFinanceSources = {};
  if (supabaseKey) {
    sources.pix = async (start, end) => {
      const query = new URLSearchParams({
        select:
          "id,provider_payment_id,provider,currency,status,amount_expected_cents,amount_paid_cents,created_at,paid_at",
        provider: "eq.abacatepay",
        order: "created_at.asc,id.asc",
        or: `(and(created_at.gte.${start},created_at.lt.${end}),and(paid_at.gte.${start},paid_at.lt.${end}),and(status.eq.paid,paid_at.is.null))`,
      });
      const result = await rest(
        "billing_payments",
        query,
        AbortSignal.timeout(12000),
      );
      return {
        rows: z.array(pixSchema).parse(result.rows),
        complete: result.complete,
      };
    };
    sources.customers = async () => {
      const result = await rest(
        "subscriptions",
        new URLSearchParams({
          select: "id,provider_customer_id",
          payment_provider: "eq.stripe",
          provider_customer_id: "not.is.null",
          order: "id.asc",
        }),
        AbortSignal.timeout(12000),
      );
      if (!result.complete) throw new Error("zelo_customer_limit");
      return new Set(
        z
          .array(z.object({ provider_customer_id: z.string() }))
          .parse(result.rows)
          .map((row) => row.provider_customer_id),
      );
    };
  }
  if (abacateKey) {
    const headers = { Authorization: `Bearer ${abacateKey}` };
    sources.checkout = (id, signal) => {
      const query = new URLSearchParams({ id });
      return get(
        `https://api.abacatepay.com/v2/checkouts/get?${query}`,
        headers,
        signal,
      );
    };
    sources.bankStatement = (startDate, endDate, after, signal) => {
      const query = new URLSearchParams({
        startDate,
        endDate,
        limit: "100",
      });
      if (after) query.set("after", after);
      return get(
        `https://api.abacatepay.com/v2/bank-statement/list?${query}`,
        headers,
        signal,
      );
    };
  }
  if (stripeKey)
    sources.stripe = async (end) => {
      if (/^(sk|rk)_test_/.test(stripeKey))
        throw new Error("zelo_live_key_required");
      const signal = AbortSignal.timeout(12000);
      const query = new URLSearchParams({
        limit: "100",
        "created[lt]": String(Date.parse(end) / 1000),
      });
      const rows: Invoice[] = [];
      let expandCharge = true;
      for (let pageIndex = 0; pageIndex < 20; pageIndex++) {
        const requestPage = (expand: boolean) => {
          const pageQuery = new URLSearchParams(query);
          if (expand)
            pageQuery.append("expand[]", "data.charge.balance_transaction");
          return get(
            `https://api.stripe.com/v1/invoices?${pageQuery}`,
            {
              Authorization: `Bearer ${stripeKey}`,
              "Stripe-Version": "2024-06-20",
            },
            signal,
          );
        };
        let raw: unknown;
        try {
          raw = await requestPage(expandCharge);
        } catch {
          if (!expandCharge) throw new Error("zelo_source_unavailable");
          expandCharge = false;
          raw = await requestPage(false);
        }
        let page: { data: Invoice[]; has_more: boolean };
        try {
          page = z
            .object({ data: z.array(invoiceSchema), has_more: z.boolean() })
            .parse(raw);
        } catch {
          if (!expandCharge) throw new Error("zelo_source_unavailable");
          expandCharge = false;
          page = z
            .object({ data: z.array(invoiceSchema), has_more: z.boolean() })
            .parse(await requestPage(false));
        }
        rows.push(...page.data);
        if (!page.has_more) return { rows, complete: true };
        if (!page.data.length) throw new Error("zelo_stripe_invalid_cursor");
        query.set("starting_after", page.data.at(-1)!.id);
      }
      return { rows, complete: false };
    };
  return new ZeloFinanceService(sources);
}
