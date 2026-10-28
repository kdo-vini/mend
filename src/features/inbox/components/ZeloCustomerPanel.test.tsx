// @vitest-environment jsdom
// i18n-exempt: this test asserts the Portuguese copy the operator sees.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ZeloCustomer } from "../../../types";
import {
  CUSTOMER_SECTIONS_STORAGE_KEY,
  ZeloCustomerPanel,
} from "./ZeloCustomerPanel";
import "../../../i18n";

const customer: ZeloCustomer = {
  ownerUserId: "owner-1",
  storeName: "Lanchonete do Zé",
  city: "Bauru, SP",
  customerSince: "2026-03-02T12:00:00.000Z",
  matchedBy: "store",
  deletionScheduledAt: null,
  subscription: {
    planTier: "bundle",
    status: "active",
    accessUntil: new Date(Date.now() + 20 * 24 * 3600 * 1000).toISOString(),
    cancelAtPeriodEnd: false,
    billingType: "PIX",
    paymentProvider: "abacatepay",
    monthlyValueCents: 19800,
    nextChargeAt: null,
  },
  products: {
    pdv: true,
    menu: true,
    chat: true,
    tables: false,
    accesses: false,
    fiscal: false,
  },
  health: {
    pdvLastSeenAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    whatsappConnected: false,
    printerLastSeenAt: null,
  },
};

describe("ZeloCustomerPanel", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (state: Parameters<typeof ZeloCustomerPanel>[0]["state"]) =>
    act(async () =>
      root.render(
        <ZeloCustomerPanel
          state={state}
          issues={[]}
          onOpenIssue={() => undefined}
          onCopied={() => undefined}
        />,
      ),
    );

  it("shows the store, plan, products and health", async () => {
    await render({ status: "ready", customers: [customer] });
    const text = container.textContent ?? "";
    expect(text).toContain("Lanchonete do Zé");
    expect(text).toContain("Pacote (PDV + Atendimento)");
    expect(text).toContain("Ativa até");
    expect(text).toContain("Pix");
    expect(text).toContain("R$");
    expect(text).toContain("NFC-e desligada");
    expect(text).toContain("há 6 min");
    expect(text).toContain("Desconectado");
    expect(
      container.querySelector<HTMLAnchorElement>("a")?.getAttribute("href"),
    ).toBe("https://admin.zelopdv.com.br/subscriptions?tab=todas&user=owner-1");
  });

  it("keeps a folded section folded in the next conversation", async () => {
    await render({ status: "ready", customers: [customer] });
    const products = [
      ...container.querySelectorAll<HTMLDetailsElement>("details"),
    ].find((section) =>
      section.querySelector("summary")?.textContent?.includes("Produtos"),
    )!;
    expect(products.open).toBe(true);
    await act(async () => {
      products.open = false;
      products.dispatchEvent(new Event("toggle"));
    });
    expect(
      JSON.parse(
        window.localStorage.getItem(CUSTOMER_SECTIONS_STORAGE_KEY) ?? "[]",
      ),
    ).toEqual(["products"]);

    await act(async () => root.unmount());
    root = createRoot(container);
    await render({ status: "ready", customers: [customer] });
    const again = [
      ...container.querySelectorAll<HTMLDetailsElement>("details"),
    ].find((section) =>
      section.querySelector("summary")?.textContent?.includes("Produtos"),
    )!;
    expect(again.open).toBe(false);
  });

  it("says so when no store uses the phone, or Zelo cannot be read", async () => {
    await render({ status: "ready", customers: [] });
    expect(container.textContent).toContain(
      "Nenhuma loja do Zelo usa este telefone.",
    );
    await render({ status: "error" });
    expect(container.textContent).toContain(
      "Não foi possível consultar o Zelo agora.",
    );
  });

  it("lets the operator pick between stores that share a phone", async () => {
    await render({
      status: "ready",
      customers: [
        customer,
        { ...customer, ownerUserId: "owner-2", storeName: "Pizzaria do Zé" },
      ],
    });
    expect(container.textContent).toContain(
      "Mais de uma loja usa este telefone",
    );
    await act(async () =>
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "Pizzaria do Zé")
        ?.click(),
    );
    expect(container.querySelector(".customer-store strong")?.textContent).toBe(
      "Pizzaria do Zé",
    );
  });
});
