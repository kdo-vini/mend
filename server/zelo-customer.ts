import { z } from "zod";

const ZELO_URL = "https://xnnjyrblpvsqrtsshawa.supabase.co";
/** More stores than this behind one phone is a data problem, not a customer. */
const MAX_MATCHES = 5;

const timestamp = z.string().nullable().optional();
const storeSchema = z.object({
  user_id: z.string(),
  nome_exibicao: z.string().nullable(),
  contato: z.string().nullable(),
  whatsmiau_phone: z.string().nullable(),
  manager_phone: z.string().nullable(),
  created_at: timestamp,
  last_seen_at: timestamp,
  delivery_city: z.string().nullable().optional(),
  delivery_state: z.string().nullable().optional(),
  modulo_pdv_ativo: z.boolean().nullable().optional(),
  zelomenu_cardapio_ativo: z.boolean().nullable().optional(),
  whatsmiau_instance: z.string().nullable().optional(),
  whatsmiau_connected: z.boolean().nullable().optional(),
  deletion_scheduled_at: timestamp,
});
const subscriptionSchema = z.object({
  user_id: z.string(),
  plan_tier: z.string().nullable(),
  status: z.string().nullable(),
  current_period_end: timestamp,
  manually_extended_until: timestamp,
  cancel_at_period_end: z.boolean().nullable(),
  billing_type: z.string().nullable(),
  payment_provider: z.string().nullable(),
  monthly_value_cents: z.number().nullable(),
  provider_next_charge_at: timestamp,
  has_mesas_addon: z.boolean().nullable(),
  has_acessos_addon: z.boolean().nullable(),
  has_zelo_menu: z.boolean().nullable(),
  has_fiscal_addon: z.boolean().nullable(),
});
const fiscalSchema = z.object({
  owner_user_id: z.string(),
  enabled: z.boolean().nullable(),
});
const stationSchema = z.object({
  owner_user_id: z.string(),
  enabled: z.boolean().nullable(),
  last_seen_at: timestamp,
});

export type ZeloPhoneMatch = "store" | "whatsapp" | "manager";

export interface ZeloCustomerSummary {
  ownerUserId: string;
  storeName: string;
  city: string | null;
  customerSince: string | null;
  matchedBy: ZeloPhoneMatch;
  deletionScheduledAt: string | null;
  subscription: {
    planTier: string | null;
    status: string | null;
    /** The later of the paid period and a manual extension. */
    accessUntil: string | null;
    cancelAtPeriodEnd: boolean;
    billingType: string | null;
    paymentProvider: string | null;
    monthlyValueCents: number | null;
    nextChargeAt: string | null;
  } | null;
  products: {
    pdv: boolean;
    menu: boolean;
    chat: boolean;
    tables: boolean;
    accesses: boolean;
    fiscal: boolean;
  };
  health: {
    pdvLastSeenAt: string | null;
    /** Null when the store has no WhatsApp of its own connected to Zelo. */
    whatsappConnected: boolean | null;
    printerLastSeenAt: string | null;
  };
}

/**
 * The phone as DDD + subscriber number, without the country code. A Brazilian
 * mobile may come with or without the extra leading 9 (old WhatsApp JIDs drop
 * it), so the comparison key is the DDD plus the last eight digits.
 */
export function brazilianPhoneKey(value: string | null | undefined) {
  let digits = (value ?? "").replace(/\D/g, "");
  if (digits.length >= 12 && digits.startsWith("55")) digits = digits.slice(2);
  if (digits.length !== 10 && digits.length !== 11) return null;
  return `${digits.slice(0, 2)}${digits.slice(-8)}`;
}

function later(...values: Array<string | null | undefined>) {
  const times = values
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter(Number.isFinite);
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

export interface ZeloCustomerService {
  lookupByPhone(phone: string): Promise<ZeloCustomerSummary[]>;
}

/**
 * Read-only lookup of the Zelo store behind a support contact. Fixed origin,
 * fixed tables and GETs only, like the Zelo finance reader.
 */
export function createZeloCustomerService(
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
): ZeloCustomerService | undefined {
  const key = env.MEND_ZELO_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) return undefined;

  async function rest(table: string, query: URLSearchParams) {
    const response = await fetcher(`${ZELO_URL}/rest/v1/${table}?${query}`, {
      method: "GET",
      headers: { apikey: key!, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("zelo_source_unavailable");
    return z.array(z.unknown()).parse(await response.json());
  }

  const inList = (ids: string[]) => `in.(${ids.join(",")})`;

  return {
    async lookupByPhone(phone) {
      const key = brazilianPhoneKey(phone);
      if (!key) return [];
      // Narrow on the last four digits server-side; the exact comparison runs
      // here because stored numbers come with and without formatting.
      const tail = key.slice(-4);
      const stores = z.array(storeSchema).parse(
        await rest(
          "empresa_perfil",
          new URLSearchParams({
            select:
              "user_id,nome_exibicao,contato,whatsmiau_phone,manager_phone,created_at,last_seen_at,delivery_city,delivery_state,modulo_pdv_ativo,zelomenu_cardapio_ativo,whatsmiau_instance,whatsmiau_connected,deletion_scheduled_at",
            or: `(contato.like.*${tail},whatsmiau_phone.like.*${tail},manager_phone.like.*${tail})`,
            limit: "50",
          }),
        ),
      );
      const matches = stores
        .map((store) => {
          const matchedBy: ZeloPhoneMatch | null =
            brazilianPhoneKey(store.contato) === key
              ? "store"
              : brazilianPhoneKey(store.whatsmiau_phone) === key
                ? "whatsapp"
                : brazilianPhoneKey(store.manager_phone) === key
                  ? "manager"
                  : null;
          return matchedBy ? { store, matchedBy } : null;
        })
        .filter((match) => match !== null)
        .slice(0, MAX_MATCHES);
      if (!matches.length) return [];

      const ids = matches.map((match) => match.store.user_id);
      const [subscriptions, fiscal, stations] = await Promise.all([
        rest(
          "subscriptions",
          new URLSearchParams({
            select:
              "user_id,plan_tier,status,current_period_end,manually_extended_until,cancel_at_period_end,billing_type,payment_provider,monthly_value_cents,provider_next_charge_at,has_mesas_addon,has_acessos_addon,has_zelo_menu,has_fiscal_addon",
            user_id: inList(ids),
            order: "updated_at.desc",
          }),
        ).then((rows) => z.array(subscriptionSchema).parse(rows)),
        rest(
          "fiscal_settings",
          new URLSearchParams({
            select: "owner_user_id,enabled",
            owner_user_id: inList(ids),
          }),
        ).then((rows) => z.array(fiscalSchema).parse(rows)),
        rest(
          "zelo_print_stations",
          new URLSearchParams({
            select: "owner_user_id,enabled,last_seen_at",
            owner_user_id: inList(ids),
          }),
        ).then((rows) => z.array(stationSchema).parse(rows)),
      ]);

      return matches.map(({ store, matchedBy }) => {
        const subscription = subscriptions.find(
          (row) => row.user_id === store.user_id,
        );
        const tier = subscription?.plan_tier ?? null;
        const fiscalEnabled = fiscal.some(
          (row) => row.owner_user_id === store.user_id && row.enabled === true,
        );
        return {
          ownerUserId: store.user_id,
          storeName: store.nome_exibicao?.trim() || "",
          city:
            [store.delivery_city, store.delivery_state]
              .filter(Boolean)
              .join(", ") || null,
          customerSince: store.created_at ?? null,
          matchedBy,
          deletionScheduledAt: store.deletion_scheduled_at ?? null,
          subscription: subscription
            ? {
                planTier: tier,
                status: subscription.status,
                accessUntil: later(
                  subscription.current_period_end,
                  subscription.manually_extended_until,
                ),
                cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
                billingType: subscription.billing_type,
                paymentProvider: subscription.payment_provider,
                monthlyValueCents: subscription.monthly_value_cents,
                nextChargeAt: subscription.provider_next_charge_at ?? null,
              }
            : null,
          products: {
            pdv: store.modulo_pdv_ativo !== false,
            menu:
              subscription?.has_zelo_menu === true ||
              store.zelomenu_cardapio_ativo === true,
            chat: tier === "bundle" || tier === "chat",
            tables: subscription?.has_mesas_addon === true,
            accesses: subscription?.has_acessos_addon === true,
            fiscal: subscription?.has_fiscal_addon === true && fiscalEnabled,
          },
          health: {
            pdvLastSeenAt: store.last_seen_at ?? null,
            whatsappConnected: store.whatsmiau_instance
              ? store.whatsmiau_connected === true
              : null,
            printerLastSeenAt: later(
              ...stations
                .filter(
                  (row) =>
                    row.owner_user_id === store.user_id &&
                    row.enabled !== false,
                )
                .map((row) => row.last_seen_at),
            ),
          },
        };
      });
    },
  };
}
