import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { financeApi } from "../api";
import { associationFields, financeFields } from "../model";
import { useFinanceFormat } from "../format";
import { isForbidden } from "../useFinanceData";
import { useFinanceValue } from "./financeValue";

type HistoryEvent = Awaited<
  ReturnType<typeof financeApi.history>
>["data"][number];

const auditedFields = [...new Set(Object.values(financeFields).flat())].filter(
  (field) => !associationFields.has(field),
);

/** Audit trail (author, time, before → after) for one finance record. */
export function HistoryPanel({
  recordId,
  title,
  onClose,
  onForbidden,
}: {
  recordId: string;
  title: string;
  onClose: () => void;
  onForbidden: () => void;
}) {
  const { t } = useTranslation("common");
  const format = useFinanceFormat();
  const display = useFinanceValue();
  const ref = useRef<HTMLElement>(null);
  const [loaded, setLoaded] = useState<{
    recordId: string;
    events: HistoryEvent[];
  } | null>(null);
  const events = loaded?.recordId === recordId ? loaded.events : null;
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setFailed(false);
    financeApi
      .history(recordId)
      .then(
        (response) => active && setLoaded({ recordId, events: response.data }),
      )
      .catch((err) => {
        if (!active) return;
        if (isForbidden(err)) onForbidden();
        else setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [recordId, attempt, onForbidden]);

  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    ref.current?.querySelector<HTMLElement>("h2")?.focus();
  }, [recordId]);

  return (
    <section
      ref={ref}
      className="finance-editor finance-history"
      aria-labelledby="finance-history-title"
      onKeyDown={(event) => event.key === "Escape" && onClose()}
    >
      <header className="finance-editor-header">
        <h2 id="finance-history-title" tabIndex={-1}>
          {t("finance.history.heading", { name: title })}
        </h2>
        <button
          type="button"
          className="icon-button subtle"
          aria-label={t("finance.history.close")}
          onClick={onClose}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      {failed ? (
        <div role="alert" className="finance-form-error">
          <span>{t("finance.errors.load")}</span>
          <button
            type="button"
            className="button button-ghost"
            onClick={() => setAttempt((value) => value + 1)}
          >
            {t("finance.retry")}
          </button>
        </div>
      ) : events === null ? (
        <p role="status" className="finance-inline-note">
          {t("finance.history.loading")}
        </p>
      ) : events.length === 0 ? (
        <p className="finance-inline-note">{t("finance.history.none")}</p>
      ) : (
        <ol className="finance-history-list">
          {events.map((event) => {
            const fields = auditedFields.filter((field) =>
              event.before_record
                ? event.before_record[field] !== event.after_record?.[field]
                : event.after_record?.[field] !== undefined &&
                  event.after_record?.[field] !== "" &&
                  event.after_record?.[field] !== null,
            );
            return (
              <li key={event.id}>
                <p className="finance-history-meta">
                  <strong>
                    {t(
                      event.before_record
                        ? "finance.history.changed"
                        : "finance.history.created",
                    )}
                  </strong>
                  <span>
                    {format.dateTime(event.happened_at)} ·{" "}
                    {t("finance.history.actor", {
                      id: event.actor_id.slice(0, 8),
                    })}
                  </span>
                </p>
                {fields.length > 0 && (
                  <dl>
                    {fields.map((field) => (
                      <div key={field}>
                        <dt>{t(`finance.fields.${field}`)}</dt>
                        <dd>
                          {event.before_record && (
                            <>
                              <del>
                                {display(field, event.before_record[field])}
                              </del>
                              <span aria-hidden="true"> → </span>
                              <span className="sr-only">
                                {t("finance.history.to")}
                              </span>
                            </>
                          )}
                          <ins>
                            {display(field, event.after_record?.[field])}
                          </ins>
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
