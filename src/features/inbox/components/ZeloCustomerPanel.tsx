import { useState, type ReactNode } from "react";
import { Copy, ExternalLink, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Issue, ZeloCustomer } from "../../../types";
import { StatusPill } from "../../../shared/ui/DataDisplay";
import type { ZeloCustomerState } from "../hooks/useZeloCustomer";
import {
  PDV_IDLE_MS,
  PRINTER_IDLE_MS,
  isOlderThan,
  sinceLabel,
  subscriptionState,
  type CustomerTone,
} from "../zelo-customer";

const ADMIN_URL = "https://admin.zelopdv.com.br/subscriptions";
export const CUSTOMER_SECTIONS_STORAGE_KEY = "mend.inbox-customer-sections";
type SectionKey = "subscription" | "products" | "health" | "history";

function readFoldedSections(): Set<string> {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(CUSTOMER_SECTIONS_STORAGE_KEY) ?? "[]",
    ) as unknown;
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

/** A section folded once stays folded in every conversation. */
function useFoldedSections() {
  const [folded, setFolded] = useState(readFoldedSections);
  const toggle = (key: SectionKey, open: boolean) =>
    setFolded((current) => {
      const next = new Set(current);
      if (open) next.delete(key);
      else next.add(key);
      try {
        window.localStorage.setItem(
          CUSTOMER_SECTIONS_STORAGE_KEY,
          JSON.stringify([...next]),
        );
      } catch {
        // Blocked storage only forgets the choice after a reload.
      }
      return next;
    });
  return { folded, toggle };
}

function Section({
  id,
  title,
  folded,
  onToggle,
  children,
}: {
  id: SectionKey;
  title: string;
  folded: boolean;
  onToggle: (key: SectionKey, open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <details
      className="customer-section"
      open={!folded}
      onToggle={(event) => {
        const open = event.currentTarget.open;
        if (open === folded) onToggle(id, open);
      }}
    >
      <summary>{title}</summary>
      <div className="customer-section-body">{children}</div>
    </details>
  );
}

function Chip({ tone, children }: { tone: CustomerTone; children: ReactNode }) {
  return <span className={`customer-chip ${tone}`}>{children}</span>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="customer-row">
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}

function money(cents: number | null) {
  return cents === null
    ? "—"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(cents / 100);
}

function shortDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
        new Date(value),
      )
    : "—";
}

function CustomerDetails({
  customer,
  issues,
  onOpenIssue,
  onCopied,
}: {
  customer: ZeloCustomer;
  issues: Issue[];
  onOpenIssue: (issueId: string) => void;
  onCopied: () => void;
}) {
  const { t } = useTranslation("inbox");
  const { folded, toggle } = useFoldedSections();
  const now = Date.now();
  const subscription = customer.subscription;
  const state = subscriptionState(subscription, now);
  const since = (value: string | null) => {
    const label = sinceLabel(value, now);
    return t(`customer.${label.key}`, label.values);
  };
  const products = (
    [
      ["pdv", customer.products.pdv],
      ["menu", customer.products.menu],
      ["chat", customer.products.chat],
      ["tables", customer.products.tables],
      ["accesses", customer.products.accesses],
      ["fiscal", customer.products.fiscal],
    ] as const
  ).filter(([key, on]) => on || key === "fiscal");

  return (
    <>
      <div className="customer-store">
        <div className="customer-store-title">
          <strong>{customer.storeName || t("customer.unnamedStore")}</strong>
          <a
            className="icon-button subtle"
            href={`${ADMIN_URL}?tab=todas&user=${encodeURIComponent(customer.ownerUserId)}`}
            target="_blank"
            rel="noreferrer"
            aria-label={t("customer.openAdmin")}
            title={t("customer.openAdmin")}
          >
            <ExternalLink size={14} />
          </a>
        </div>
        <small>
          {[
            customer.customerSince
              ? t("customer.since", { date: shortDate(customer.customerSince) })
              : null,
            customer.city,
          ]
            .filter(Boolean)
            .join(" · ")}
        </small>
        <small className="customer-match">
          {t(`customer.matchedBy.${customer.matchedBy}`)}
        </small>
        {customer.deletionScheduledAt && (
          <Chip tone="danger">
            {t("customer.alerts.deletionScheduled")} ·{" "}
            {shortDate(customer.deletionScheduledAt)}
          </Chip>
        )}
      </div>

      <Section
        id="subscription"
        title={t("customer.sections.subscription")}
        folded={folded.has("subscription")}
        onToggle={toggle}
      >
        <div className="customer-plan">
          <strong>
            {subscription?.planTier
              ? t(`customer.plans.${subscription.planTier}`, {
                  defaultValue: subscription.planTier,
                })
              : t("customer.plans.none")}
          </strong>
          <Chip tone={state.tone}>
            {t(`customer.${state.key}`, state.values)}
          </Chip>
        </div>
        {subscription && (
          <>
            <Row label={t("customer.payment")}>
              {subscription.billingType
                ? t(`customer.billing.${subscription.billingType}`, {
                    defaultValue: subscription.billingType,
                  })
                : "—"}
            </Row>
            {subscription.monthlyValueCents !== null && (
              <Row label={t("customer.monthlyValue")}>
                {money(subscription.monthlyValueCents)}
              </Row>
            )}
            <Row label={t("customer.accessUntil")}>
              {shortDate(subscription.accessUntil)}
            </Row>
            {subscription.nextChargeAt && (
              <Row label={t("customer.nextCharge")}>
                {shortDate(subscription.nextChargeAt)}
              </Row>
            )}
          </>
        )}
      </Section>

      <Section
        id="products"
        title={t("customer.sections.products")}
        folded={folded.has("products")}
        onToggle={toggle}
      >
        <div className="customer-products">
          {products.map(([key, on]) => (
            <Chip key={key} tone={on ? "success" : "neutral"}>
              {t(`customer.products.${key}${on ? "" : "Off"}`)}
            </Chip>
          ))}
        </div>
      </Section>

      <Section
        id="health"
        title={t("customer.sections.health")}
        folded={folded.has("health")}
        onToggle={toggle}
      >
        <Row label={t("customer.health.pdv")}>
          <span
            className={
              isOlderThan(customer.health.pdvLastSeenAt, PDV_IDLE_MS, now)
                ? "customer-warning"
                : undefined
            }
          >
            {since(customer.health.pdvLastSeenAt)}
          </span>
        </Row>
        {customer.health.whatsappConnected !== null && (
          <Row label={t("customer.health.whatsapp")}>
            <span
              className={
                customer.health.whatsappConnected
                  ? "customer-ok"
                  : "customer-danger"
              }
            >
              {customer.health.whatsappConnected
                ? t("customer.health.connected")
                : t("customer.health.disconnected")}
            </span>
          </Row>
        )}
        <Row label={t("customer.health.printer")}>
          {customer.health.printerLastSeenAt ? (
            <span
              className={
                isOlderThan(
                  customer.health.printerLastSeenAt,
                  PRINTER_IDLE_MS,
                  now,
                )
                  ? "customer-warning"
                  : "customer-ok"
              }
            >
              {since(customer.health.printerLastSeenAt)}
            </span>
          ) : (
            t("customer.health.noPrinter")
          )}
        </Row>
      </Section>

      <Section
        id="history"
        title={t("customer.sections.history")}
        folded={folded.has("history")}
        onToggle={toggle}
      >
        {issues.length ? (
          <ul className="customer-history">
            {issues.map((issue) => (
              <li key={issue.id}>
                <button type="button" onClick={() => onOpenIssue(issue.id)}>
                  <code>{issue.identifier}</code>
                  <span>{issue.title}</span>
                  <StatusPill status={issue.status} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="customer-empty">{t("customer.noHistory")}</p>
        )}
      </Section>

      <div className="customer-actions">
        <button
          className="text-button"
          type="button"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(customer.ownerUserId)
              .then(onCopied)
              .catch(() => undefined);
          }}
        >
          <Copy size={13} /> {t("customer.copyId")}
        </button>
      </div>
    </>
  );
}

/** Who the customer is in Zelo, beside the conversation. */
export function ZeloCustomerPanel({
  state,
  issues,
  onOpenIssue,
  onCopied,
}: {
  state: ZeloCustomerState | undefined;
  issues: Issue[];
  onOpenIssue: (issueId: string) => void;
  onCopied: () => void;
}) {
  const { t } = useTranslation("inbox");
  const [chosen, setChosen] = useState(0);
  if (!state) return null;
  if (state.status === "loading")
    return (
      <section className="zelo-customer" aria-busy="true">
        <p className="customer-empty">
          <LoaderCircle className="spin" size={14} /> {t("customer.loading")}
        </p>
      </section>
    );
  if (state.status === "error")
    return (
      <section className="zelo-customer">
        <p className="customer-empty">{t("customer.unavailable")}</p>
      </section>
    );
  const { customers } = state;
  if (!customers.length)
    return (
      <section className="zelo-customer">
        <p className="customer-empty">{t("customer.notFound")}</p>
      </section>
    );
  const customer = customers[Math.min(chosen, customers.length - 1)];
  return (
    <section className="zelo-customer" aria-label={t("customer.title")}>
      {customers.length > 1 && (
        <div className="customer-choices" role="group">
          <small>{t("customer.manyStores")}</small>
          {customers.map((item, index) => (
            <button
              key={item.ownerUserId}
              type="button"
              aria-pressed={item === customer}
              onClick={() => setChosen(index)}
            >
              {item.storeName || t("customer.unnamedStore")}
            </button>
          ))}
        </div>
      )}
      <CustomerDetails
        key={customer.ownerUserId}
        customer={customer}
        issues={issues}
        onOpenIssue={onOpenIssue}
        onCopied={onCopied}
      />
    </section>
  );
}
