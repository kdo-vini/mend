import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { financeApi, type ProviderBalances } from "../api";
import { isForbidden } from "../useFinanceData";
const zeroDecimal = new Set([
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

export function ProviderBalancesPanel({
  onForbidden,
}: {
  onForbidden: () => void;
}) {
  const { t, i18n } = useTranslation("common");
  const [data, setData] = useState<ProviderBalances | null>(null);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setFailed(false);
    setData(null);
    financeApi
      .providerBalances()
      .then((value) => {
        if (active) setData(value);
      })
      .catch((error) => {
        if (!active) return;
        if (isForbidden(error)) onForbidden();
        else setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [revision, onForbidden]);
  const money = (amount: number, currency: string) =>
    new Intl.NumberFormat(i18n.language, {
      style: "currency",
      currency,
    }).format(amount / (zeroDecimal.has(currency) ? 1 : 100));
  return (
    <section
      className="provider-balances"
      aria-label={t("finance.providerBalances.title")}
    >
      <header>
        <div>
          <h2>{t("finance.providerBalances.title")}</h2>
          <p>{t("finance.providerBalances.scope")}</p>
        </div>
        <button
          type="button"
          className="button button-ghost"
          disabled={!data && !failed}
          onClick={() => setRevision((n) => n + 1)}
        >
          {t("finance.zelo.refresh")}
        </button>
      </header>
      {failed ? (
        <p role="alert">{t("finance.providerBalances.failed")}</p>
      ) : !data ? (
        <p role="status">{t("finance.zelo.loading")}</p>
      ) : (
        <>
          <p className="provider-checked">
            {t("finance.zelo.checkedAt", {
              time: new Intl.DateTimeFormat(i18n.language, {
                dateStyle: "short",
                timeStyle: "short",
              }).format(new Date(data.checkedAt)),
            })}
          </p>
          <div className="provider-balance-grid">
            {(["abacatepay", "stripe"] as const).map((provider) => {
              const item = data.providers[provider];
              return (
                <article key={provider}>
                  <header>
                    <h3>{t(`finance.zelo.providers.${provider}`)}</h3>
                    <span>{t(`finance.zelo.states.${item.status}`)}</span>
                  </header>
                  {item.balances ? (
                    item.balances.map((balance) => (
                      <dl key={balance.currency}>
                        <div>
                          <dt>{t("finance.providerBalances.available")}</dt>
                          <dd>
                            {money(balance.availableMinor, balance.currency)}
                          </dd>
                        </div>
                        <div>
                          <dt>{t("finance.providerBalances.pending")}</dt>
                          <dd>
                            {money(balance.pendingMinor, balance.currency)}
                          </dd>
                        </div>
                      </dl>
                    ))
                  ) : (
                    <p>{t("finance.providerBalances.unknown")}</p>
                  )}
                  <h4>{t("finance.providerBalances.payouts")}</h4>
                  {item.payouts.length ? (
                    <ul>
                      {item.payouts.map((payout) => (
                        <li key={payout.id}>
                          <strong>
                            {money(
                              payout.netMinor ?? payout.amountMinor,
                              payout.currency,
                            )}
                          </strong>
                          {payout.netMinor === null && (
                            <small>
                              {t("finance.providerBalances.netUnconfirmed")}
                            </small>
                          )}
                          <span>
                            {payout.arrivalAt
                              ? t("finance.providerBalances.arrival", {
                                  date: new Intl.DateTimeFormat(i18n.language, {
                                    dateStyle: "medium",
                                    timeZone: "UTC",
                                  }).format(new Date(payout.arrivalAt)),
                                })
                              : t("finance.providerBalances.noDate")}
                          </span>
                          {payout.feeMinor !== null && (
                            <small>
                              {t("finance.providerBalances.fee", {
                                amount: money(payout.feeMinor, payout.currency),
                              })}
                            </small>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      {t(
                        item.status === "ok"
                          ? "finance.providerBalances.noPayouts"
                          : "finance.providerBalances.unknown",
                      )}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
