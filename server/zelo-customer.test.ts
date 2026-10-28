import { describe, expect, it, vi } from "vitest";
import {
  brazilianPhoneKey,
  createZeloCustomerService,
} from "./zelo-customer.js";

const ownerId = "11111111-1111-4111-8111-111111111111";

function fakeZelo(tables: Record<string, unknown[]>) {
  const urls: string[] = [];
  const fetcher = vi.fn(async (input: unknown) => {
    const url = new URL(String(input));
    urls.push(url.toString());
    const table = url.pathname.split("/").at(-1) ?? "";
    return new Response(JSON.stringify(tables[table] ?? []), { status: 200 });
  });
  return { fetcher: fetcher as unknown as typeof fetch, urls };
}

const store = {
  user_id: ownerId,
  nome_exibicao: "Lanchonete do Zé",
  contato: "5514998360854",
  whatsmiau_phone: null,
  manager_phone: null,
  created_at: "2026-03-02T12:00:00.000Z",
  last_seen_at: "2026-10-28T11:54:00.000Z",
  delivery_city: "Bauru",
  delivery_state: "SP",
  modulo_pdv_ativo: true,
  zelomenu_cardapio_ativo: true,
  whatsmiau_instance: "zelo-abc",
  whatsmiau_connected: true,
  deletion_scheduled_at: null,
};

describe("brazilianPhoneKey", () => {
  it("matches a number with or without country code, mask or ninth digit", () => {
    const key = brazilianPhoneKey("5514998360854");
    expect(brazilianPhoneKey("(14) 99836-0854")).toBe(key);
    expect(brazilianPhoneKey("551498360854")).toBe(key);
    expect(brazilianPhoneKey("123")).toBeNull();
    expect(brazilianPhoneKey("120363426966918405")).toBeNull();
  });
});

describe("createZeloCustomerService", () => {
  it("is off without the Zelo read key", () => {
    expect(createZeloCustomerService({})).toBeUndefined();
  });

  it("summarizes the store, plan, products and health behind a phone", async () => {
    const { fetcher, urls } = fakeZelo({
      empresa_perfil: [
        store,
        // Shares the last digits but not the number: must not match.
        { ...store, user_id: "other", contato: "5511912340854" },
      ],
      subscriptions: [
        {
          user_id: ownerId,
          plan_tier: "bundle",
          status: "active",
          current_period_end: "2026-10-30T00:00:00.000Z",
          manually_extended_until: "2026-11-05T00:00:00.000Z",
          cancel_at_period_end: false,
          billing_type: "PIX",
          payment_provider: "abacatepay",
          monthly_value_cents: 19800,
          provider_next_charge_at: null,
          has_mesas_addon: false,
          has_acessos_addon: true,
          has_zelo_menu: false,
          has_fiscal_addon: true,
        },
      ],
      fiscal_settings: [{ owner_user_id: ownerId, enabled: false }],
      zelo_print_stations: [
        {
          owner_user_id: ownerId,
          enabled: true,
          last_seen_at: "2026-10-28T10:00:00.000Z",
        },
        {
          owner_user_id: ownerId,
          enabled: true,
          last_seen_at: "2026-10-28T11:00:00.000Z",
        },
      ],
    });
    const service = createZeloCustomerService(
      { MEND_ZELO_SUPABASE_SERVICE_ROLE_KEY: "key" },
      fetcher,
    )!;

    const [customer, ...rest] = await service.lookupByPhone("551498360854");

    expect(rest).toEqual([]);
    expect(customer).toMatchObject({
      ownerUserId: ownerId,
      storeName: "Lanchonete do Zé",
      city: "Bauru, SP",
      matchedBy: "store",
      subscription: {
        planTier: "bundle",
        status: "active",
        accessUntil: "2026-11-05T00:00:00.000Z",
        billingType: "PIX",
      },
      products: {
        pdv: true,
        menu: true,
        chat: true,
        accesses: true,
        // The add-on is paid but NFC-e is not switched on.
        fiscal: false,
      },
      health: {
        whatsappConnected: true,
        printerLastSeenAt: "2026-10-28T11:00:00.000Z",
      },
    });
    expect(urls[0]).toContain("/rest/v1/empresa_perfil?");
    expect(decodeURIComponent(urls[0])).toContain("contato.like.*0854");
  });

  it("does not query Zelo for a group or an invalid number", async () => {
    const { fetcher } = fakeZelo({});
    const service = createZeloCustomerService(
      { MEND_ZELO_SUPABASE_SERVICE_ROLE_KEY: "key" },
      fetcher,
    )!;
    await expect(service.lookupByPhone("120363426966918405")).resolves.toEqual(
      [],
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
