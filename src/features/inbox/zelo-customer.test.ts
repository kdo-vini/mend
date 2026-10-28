import { describe, expect, it } from "vitest";
import type { ZeloCustomer } from "../../types";
import { customerAlerts, sinceLabel, subscriptionState } from "./zelo-customer";

const now = Date.parse("2026-10-28T12:00:00.000Z");
const day = 24 * 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(now + offsetMs).toISOString();

const subscription = (
  patch: Partial<NonNullable<ZeloCustomer["subscription"]>> = {},
): NonNullable<ZeloCustomer["subscription"]> => ({
  planTier: "bundle",
  status: "active",
  accessUntil: at(20 * day),
  cancelAtPeriodEnd: false,
  billingType: "PIX",
  paymentProvider: "abacatepay",
  monthlyValueCents: 19800,
  nextChargeAt: null,
  ...patch,
});

const customer = (patch: Partial<ZeloCustomer> = {}): ZeloCustomer => ({
  ownerUserId: "owner-1",
  storeName: "Lanchonete do Zé",
  city: "Bauru, SP",
  customerSince: at(-200 * day),
  matchedBy: "store",
  deletionScheduledAt: null,
  subscription: subscription(),
  products: {
    pdv: true,
    menu: true,
    chat: true,
    tables: false,
    accesses: false,
    fiscal: false,
  },
  health: {
    pdvLastSeenAt: at(-6 * 60 * 1000),
    whatsappConnected: true,
    printerLastSeenAt: null,
  },
  ...patch,
});

describe("subscriptionState", () => {
  it("names what the plan means for support right now", () => {
    expect(subscriptionState(subscription(), now)).toMatchObject({
      key: "status.active",
      tone: "success",
    });
    expect(
      subscriptionState(subscription({ accessUntil: at(2 * day) }), now),
    ).toMatchObject({
      key: "status.renewsSoon",
      values: { count: 2 },
      tone: "warning",
    });
    expect(
      subscriptionState(subscription({ accessUntil: at(-3 * day) }), now),
    ).toMatchObject({
      key: "status.expired",
      values: { count: 3 },
      tone: "danger",
    });
    expect(
      subscriptionState(subscription({ cancelAtPeriodEnd: true }), now),
    ).toMatchObject({ key: "status.cancelsOn", tone: "warning" });
    expect(
      subscriptionState(subscription({ status: "trial_expired" }), now),
    ).toMatchObject({ key: "status.trialExpired", tone: "danger" });
    expect(subscriptionState(null, now)).toMatchObject({
      key: "status.none",
      tone: "neutral",
    });
  });
});

describe("customerAlerts", () => {
  it("raises only what must not be missed with the panel folded", () => {
    expect(customerAlerts(customer(), now)).toEqual([]);
    expect(
      customerAlerts(
        customer({
          subscription: subscription({ accessUntil: at(-1 * day) }),
          health: {
            pdvLastSeenAt: null,
            whatsappConnected: false,
            printerLastSeenAt: null,
          },
        }),
        now,
      ).map((alert) => alert.key),
    ).toEqual(["status.expired", "alerts.whatsappDisconnected"]);
  });
});

describe("sinceLabel", () => {
  it("speaks in recency", () => {
    expect(sinceLabel(at(-6 * 60 * 1000), now)).toEqual({
      key: "ago.minutes",
      values: { count: 6 },
    });
    expect(sinceLabel(at(-3 * day), now)).toEqual({
      key: "ago.days",
      values: { count: 3 },
    });
    expect(sinceLabel(null, now)).toEqual({ key: "ago.never" });
  });
});
