import type { ZeloCustomer } from "../../types";

const DAY_MS = 24 * 60 * 60 * 1000;
/** A renewal this close is worth a warning while the customer is on the line. */
const RENEWAL_WARNING_DAYS = 3;
/** The PDV pings while open; silence this long means nobody is using it. */
export const PDV_IDLE_MS = 3 * DAY_MS;
/** Print stations ping while connected; this long without one is offline. */
export const PRINTER_IDLE_MS = 10 * 60 * 1000;

export type CustomerTone = "success" | "warning" | "danger" | "neutral";

export interface CustomerLabel {
  /** Key under `customer.` in the inbox catalog. */
  key: string;
  values?: Record<string, string | number>;
  tone: CustomerTone;
}

function daysUntil(value: string | null, now: number) {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? Math.ceil((time - now) / DAY_MS) : null;
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}

/** What the subscription means for support right now, in one chip. */
export function subscriptionState(
  subscription: ZeloCustomer["subscription"],
  now = Date.now(),
): CustomerLabel {
  if (!subscription) return { key: "status.none", tone: "neutral" };
  const { status, accessUntil } = subscription;
  if (status === "canceled") return { key: "status.canceled", tone: "danger" };
  if (status === "trial_expired")
    return { key: "status.trialExpired", tone: "danger" };
  const days = daysUntil(accessUntil, now);
  if (days !== null && days <= 0)
    return {
      key: "status.expired",
      values: { count: Math.max(1, Math.abs(days)) },
      tone: "danger",
    };
  if (status === "trialing")
    return {
      key: "status.trialing",
      values: { date: accessUntil ? shortDate(accessUntil) : "—" },
      tone:
        days !== null && days <= RENEWAL_WARNING_DAYS ? "warning" : "neutral",
    };
  if (status === "active") {
    if (subscription.cancelAtPeriodEnd && accessUntil)
      return {
        key: "status.cancelsOn",
        values: { date: shortDate(accessUntil) },
        tone: "warning",
      };
    if (days !== null && days <= RENEWAL_WARNING_DAYS)
      return {
        key: "status.renewsSoon",
        values: { count: days },
        tone: "warning",
      };
    return {
      key: "status.active",
      values: { date: accessUntil ? shortDate(accessUntil) : "—" },
      tone: "success",
    };
  }
  return { key: "status.pending", tone: "warning" };
}

/**
 * What must not be missed even with the panel folded away: these show as a
 * chip in the conversation header.
 */
export function customerAlerts(
  customer: ZeloCustomer,
  now = Date.now(),
): CustomerLabel[] {
  const alerts: CustomerLabel[] = [];
  const subscription = subscriptionState(customer.subscription, now);
  if (subscription.tone === "danger") alerts.push(subscription);
  if (customer.health.whatsappConnected === false)
    alerts.push({ key: "alerts.whatsappDisconnected", tone: "danger" });
  if (customer.deletionScheduledAt)
    alerts.push({ key: "alerts.deletionScheduled", tone: "danger" });
  return alerts;
}

/** "há 6 min", "há 3 h", "há 2 dias": recency matters, not the timestamp. */
export function sinceLabel(
  value: string | null,
  now = Date.now(),
): { key: string; values?: { count: number } } {
  const time = value ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(time)) return { key: "ago.never" };
  const minutes = Math.max(0, Math.floor((now - time) / 60_000));
  if (minutes < 1) return { key: "ago.now" };
  if (minutes < 60) return { key: "ago.minutes", values: { count: minutes } };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { key: "ago.hours", values: { count: hours } };
  return { key: "ago.days", values: { count: Math.floor(hours / 24) } };
}

export function isOlderThan(
  value: string | null,
  ms: number,
  now = Date.now(),
) {
  const time = value ? Date.parse(value) : Number.NaN;
  return !Number.isFinite(time) || now - time > ms;
}
