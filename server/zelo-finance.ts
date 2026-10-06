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
});
type Pix = z.infer<typeof pixSchema>;
type Invoice = z.infer<typeof invoiceSchema>;
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
  }>;
}
interface SourcePage<T> {
  rows: T[];
  complete: boolean;
}
export interface ZeloFinanceSources {
  pix?: (start: string, end: string) => Promise<SourcePage<Pix>>;
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
              });
            }
          } catch {
            providers.stripe = "unavailable";
          }
        })(),
      );
    await Promise.all(tasks);
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
      };
      if (
        inRange(row.createdAt, start, end) &&
        row.status !== "cancelled" &&
        row.status !== "expired"
      )
        total.billedCents += row.billedCents;
      if (inRange(row.paidAt, start, end))
        total.receivedCents += row.receivedCents ?? 0;
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
}

const ZELO_URL = "https://xnnjyrblpvsqrtsshawa.supabase.co";
/** Only fixed-origin GETs; no caller-controlled table, URL, JWT or provider mutation. */
export function createZeloFinanceService(
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
) {
  const supabaseKey = env.MEND_ZELO_SUPABASE_SERVICE_ROLE_KEY?.trim();
  const stripeKey = env.MEND_ZELO_STRIPE_READ_KEY?.trim();
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
      for (let pageIndex = 0; pageIndex < 20; pageIndex++) {
        const page = z
          .object({ data: z.array(invoiceSchema), has_more: z.boolean() })
          .parse(
            await get(
              `https://api.stripe.com/v1/invoices?${query}`,
              {
                Authorization: `Bearer ${stripeKey}`,
                "Stripe-Version": "2024-06-20",
              },
              signal,
            ),
          );
        rows.push(...page.data);
        if (!page.has_more) return { rows, complete: true };
        if (!page.data.length) throw new Error("zelo_stripe_invalid_cursor");
        query.set("starting_after", page.data.at(-1)!.id);
      }
      return { rows, complete: false };
    };
  return new ZeloFinanceService(sources);
}
