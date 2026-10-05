import { parseFinanceAmount } from "./amount";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../../shared/ui/PageHeader";
import {
  financeApi,
  type FinanceEntity,
  type FinanceRecord,
  type FinanceSummary,
} from "./api";
import { LiveActionError } from "../../api/transport";

const editable: Record<FinanceEntity, string[]> = {
  entries: [
    "kind",
    "description",
    "period",
    "amount_cents",
    "category",
    "source",
    "estimated",
    "project",
    "allocation",
    "cancelled",
    "reason",
  ],
  settlements: [
    "entry_id",
    "paid_on",
    "amount_cents",
    "source",
    "cancelled",
    "reason",
  ],
  templates: [
    "description",
    "category",
    "source",
    "amount_cents",
    "estimated",
    "project",
    "allocation",
    "starts_on",
    "ends_on",
    "active",
  ],
  references: ["entry_id", "settlement_id", "source", "external_id", "note"],
  reviews: [
    "period",
    "sources_complete",
    "expenses_complete",
    "taxes_complete",
    "note",
  ],
};
const booleanFields = new Set([
  "estimated",
  "cancelled",
  "active",
  "sources_complete",
  "expenses_complete",
  "taxes_complete",
]);
const monthFields = new Set(["period", "starts_on", "ends_on"]);
function initial(
  entity: FinanceEntity,
  period: string,
  entryId = "",
  settlementId = "",
): Record<string, string | boolean | number | null> {
  const defaults: Record<string, string | boolean | number | null> = {
    id: crypto.randomUUID(),
    kind: "expense",
    period,
    amount_cents: null,
    estimated: false,
    cancelled: false,
    active: true,
    starts_on: period,
    ends_on: null,
    entry_id: entryId,
    settlement_id: settlementId || null,
    external_id: null,
    paid_on: new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
    sources_complete: false,
    expenses_complete: false,
    taxes_complete: false,
  };
  return Object.fromEntries(
    ["id", ...editable[entity]].map((field) => [field, defaults[field] ?? ""]),
  );
}
export function FinancePage({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation("common");
  const [month, setMonth] = useState(() =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
    })
      .format(new Date())
      .slice(0, 7),
  );
  const period = `${month}-01`;
  const [entity, setEntity] = useState<FinanceEntity>("entries");
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [records, setRecords] = useState<FinanceRecord[]>([]);
  const [offset, setOffset] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [latestChanges, setLatestChanges] = useState<
    Record<string, string | boolean | number | null>
  >({});
  const [draft, setDraft] = useState<{
    entity: FinanceEntity;
    record: Record<string, string | boolean | number | null>;
    version: number | null;
    baseline: Record<string, string | boolean | number | null>;
  } | null>(null);
  const [amountText, setAmountText] = useState("");
  const [history, setHistory] = useState<
    Awaited<ReturnType<typeof financeApi.history>>["data"] | null
  >(null);
  const formRef = useRef<HTMLDivElement>(null);
  const money = (cents: number) =>
    new Intl.NumberFormat(i18n.language, {
      style: "currency",
      currency: "BRL",
    }).format(cents / 100);
  const fail = (err: unknown) =>
    setError(
      t(
        err instanceof LiveActionError && err.code === "finance_conflict"
          ? "finance.conflict"
          : "finance.error",
      ),
    );
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setSummary(null);
    setRecords([]);
    void (async () => {
      const access = await financeApi.access();
      if (cancelled) return;
      setAllowed(access.allowed);
      if (!access.allowed) return;
      const [value, list] = await Promise.all([
        financeApi.summary(period),
        compact
          ? Promise.resolve({ data: [], nextOffset: null })
          : financeApi.list(entity, period, offset),
      ]);
      if (!cancelled) {
        setSummary(value);
        setRecords(list.data);
        setNextOffset(list.nextOffset);
      }
    })()
      .catch((err) => {
        if (!cancelled) fail(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Locale changes affect formatting; the server request depends on period/view only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, entity, offset, refresh, compact]);
  function openForm(
    kind: FinanceEntity,
    row?: FinanceRecord,
    entryId = "",
    settlementId = "",
  ) {
    const record = row
      ? Object.fromEntries(
          ["id", ...editable[kind]].map((field) => [
            field,
            row[field] === undefined ? "" : row[field],
          ]),
        )
      : initial(kind, period, entryId, settlementId);
    setDraft({
      entity: kind,
      record,
      baseline: { ...record },
      version: row?.version ?? null,
    });
    setConflict(false);
    setLatestChanges({});
    setAmountText(
      record.amount_cents ? (Number(record.amount_cents) / 100).toFixed(2) : "",
    );
    setHistory(null);
    setError("");
    setTimeout(
      () =>
        formRef.current
          ?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select")
          ?.focus(),
      0,
    );
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft || busy) return;
    setBusy(true);
    setError("");
    try {
      const record = { ...draft.record };
      if ("amount_cents" in record)
        record.amount_cents = parseFinanceAmount(amountText);
      for (const field of ["ends_on", "settlement_id", "external_id"])
        if (field in record && record[field] === "") record[field] = null;
      await financeApi.save(draft.entity, record, draft.version);
      setDraft(null);
      setNotice(t("finance.saved"));
      setRefresh((v) => v + 1);
    } catch (err) {
      fail(err);
      setConflict(
        err instanceof LiveActionError &&
          err.code === "finance_conflict" &&
          draft.version !== null,
      );
    } finally {
      setBusy(false);
    }
  }
  async function reloadDraft() {
    if (!draft || busy) return;
    setBusy(true);
    try {
      const latest = await financeApi.get(
        draft.entity,
        String(draft.record.id),
      );
      const record = { ...draft.record };
      const changes: typeof record = {};
      for (const field of editable[draft.entity]) {
        const local =
          field === "amount_cents"
            ? parseFinanceAmount(amountText)
            : record[field];
        const baseline = draft.baseline[field];
        if (latest[field] !== baseline) changes[field] = latest[field];
        if (local === baseline) {
          record[field] = latest[field];
          if (field === "amount_cents")
            setAmountText(
              latest[field] === null
                ? ""
                : (Number(latest[field]) / 100).toFixed(2),
            );
        }
      }
      setDraft({ ...draft, record, baseline: latest, version: latest.version });
      setLatestChanges(changes);
      setConflict(false);
      setError("");
      setNotice(t("finance.draftReloaded"));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }
  const review = summary?.review;
  const complete = Boolean(
    review?.sources_complete &&
      review?.expenses_complete &&
      review?.taxes_complete &&
      !summary?.estimated_count &&
      !summary?.unknown_count &&
      !summary?.reference_pending,
  );
  return (
    <section className={compact ? "finance-panel" : "page finance-page"}>
      <PageHeader
        title={t(compact ? "finance.overview" : "finance.title")}
        description={t("finance.description")}
      />
      <label className="finance-period">
        {t("finance.month")}
        <input
          type="month"
          value={month}
          onChange={(e) => {
            setMonth(e.target.value);
            setOffset(0);
            setDraft(null);
            setHistory(null);
          }}
          required
        />
      </label>
      {loading && <p role="status">{t("finance.loading")}</p>}
      {error && (
        <p role="alert" className="finance-error">
          {error}{" "}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              conflict ? void reloadDraft() : setRefresh((v) => v + 1)
            }
          >
            {t(conflict ? "finance.reloadDraft" : "finance.retry")}
          </button>
        </p>
      )}
      {allowed === false && <p>{t("finance.restricted")}</p>}
      {notice && <p role="status">{notice}</p>}
      {summary && (
        <>
          <p className="finance-coverage">
            {t(complete ? "finance.complete" : "finance.partial")}
          </p>
          <div className="finance-metrics">
            {(
              ["income", "received", "expenses", "paid", "result"] as const
            ).map((key) => (
              <div key={key}>
                <span>{t(`finance.${key}`)}</span>
                <strong>
                  {money(
                    key === "result"
                      ? summary.income - summary.expenses
                      : summary[key],
                  )}
                </strong>
              </div>
            ))}
          </div>
          <p className="finance-footnote">
            {t("finance.coverage", {
              estimated: summary.estimated_count,
              unknown: summary.unknown_count,
              references: summary.reference_pending,
            })}
          </p>
          <p className="finance-footnote">{t("finance.notBalance")}</p>
          {compact ? (
            <Link to="/financeiro">{t("finance.open")}</Link>
          ) : (
            <>
              <div className="finance-toolbar">
                <div className="finance-tabs">
                  {(
                    [
                      "entries",
                      "settlements",
                      "templates",
                      "references",
                    ] as FinanceEntity[]
                  ).map((tab) => (
                    <button
                      type="button"
                      key={tab}
                      aria-pressed={entity === tab}
                      onClick={() => {
                        setEntity(tab);
                        setOffset(0);
                        setDraft(null);
                        setHistory(null);
                      }}
                    >
                      {t(`finance.${tab}`)}
                    </button>
                  ))}
                </div>
                {entity === "entries" || entity === "templates" ? (
                  <button type="button" onClick={() => openForm(entity)}>
                    {t("finance.add")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEntity("entries");
                      setOffset(0);
                    }}
                  >
                    {t("finance.chooseEntry")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openForm("reviews", review ?? undefined)}
                >
                  {t("finance.review")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const result = await financeApi.generate(period);
                      setNotice(
                        t("finance.generated", { count: result.generated }),
                      );
                      setRefresh((v) => v + 1);
                    } catch (err) {
                      fail(err);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {t("finance.generate")}
                </button>
              </div>
              {entity === "references" && (
                <p>{t("finance.reconciliationHelp")}</p>
              )}
              {draft && (
                <div className="finance-editor" ref={formRef}>
                  <h2>
                    {t("finance.editHeading", {
                      entity: t(`finance.${draft.entity}`),
                    })}
                  </h2>
                  <form onSubmit={submit}>
                    {Object.keys(latestChanges).length > 0 && (
                      <aside>
                        <p>{t("finance.latestChanges")}</p>
                        <dl>
                          {Object.entries(latestChanges).map(
                            ([field, value]) => (
                              <div key={field}>
                                <dt>{t(`finance.fields.${field}`)}</dt>
                                <dd>
                                  {field === "amount_cents"
                                    ? value === null
                                      ? t("finance.unknown")
                                      : money(Number(value))
                                    : typeof value === "boolean"
                                      ? t(value ? "finance.yes" : "finance.no")
                                      : String(value ?? "")}
                                </dd>
                              </div>
                            ),
                          )}
                        </dl>
                      </aside>
                    )}
                    <div className="finance-fields">
                      {editable[draft.entity].map((field) => (
                        <label key={field}>
                          {t(`finance.fields.${field}`)}
                          {booleanFields.has(field) ? (
                            <input
                              type="checkbox"
                              disabled={busy}
                              checked={Boolean(draft.record[field])}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  record: {
                                    ...draft.record,
                                    [field]: e.target.checked,
                                  },
                                })
                              }
                            />
                          ) : field === "kind" ? (
                            <select
                              disabled={busy}
                              value={String(draft.record.kind)}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  record: {
                                    ...draft.record,
                                    kind: e.target.value,
                                  },
                                })
                              }
                            >
                              {["income", "expense", "transfer"].map((kind) => (
                                <option value={kind} key={kind}>
                                  {t(`finance.kinds.${kind}`)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              disabled={busy}
                              type={
                                monthFields.has(field)
                                  ? "month"
                                  : field === "paid_on"
                                    ? "date"
                                    : "text"
                              }
                              inputMode={
                                field === "amount_cents" ? "decimal" : undefined
                              }
                              readOnly={
                                field === "entry_id" ||
                                field === "settlement_id"
                              }
                              list={
                                field === "source"
                                  ? "finance-sources"
                                  : undefined
                              }
                              value={
                                field === "amount_cents"
                                  ? amountText
                                  : monthFields.has(field)
                                    ? String(draft.record[field] ?? "").slice(
                                        0,
                                        7,
                                      )
                                    : String(draft.record[field] ?? "")
                              }
                              required={
                                [
                                  "description",
                                  "category",
                                  "source",
                                  "period",
                                  "starts_on",
                                  "entry_id",
                                  "paid_on",
                                ].includes(field) ||
                                (field === "reason" &&
                                  Boolean(draft.record.cancelled)) ||
                                (field === "amount_cents" &&
                                  draft.entity === "settlements")
                              }
                              maxLength={
                                field === "note" ||
                                field === "reason" ||
                                field === "allocation"
                                  ? 500
                                  : 200
                              }
                              onChange={(e) =>
                                field === "amount_cents"
                                  ? setAmountText(e.target.value)
                                  : setDraft({
                                      ...draft,
                                      record: {
                                        ...draft.record,
                                        [field]:
                                          monthFields.has(field) &&
                                          e.target.value
                                            ? `${e.target.value}-01`
                                            : e.target.value,
                                      },
                                    })
                              }
                            />
                          )}
                        </label>
                      ))}
                    </div>
                    <datalist id="finance-sources">
                      <option value="Lucas Ops" />
                      <option value="Hostinger" />
                      <option value="Supabase" />
                    </datalist>
                    <p>{t("finance.formHelp")}</p>
                    <div className="finance-toolbar">
                      <button type="submit" disabled={busy || conflict}>
                        {t("finance.save")}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setDraft(null)}
                      >
                        {t("finance.close")}
                      </button>
                    </div>
                  </form>
                </div>
              )}
              <div className="finance-records">
                {records.length === 0 ? (
                  <p>{t("finance.empty")}</p>
                ) : (
                  records.map((row) => (
                    <article key={row.id}>
                      <div>
                        <h3>{String(row.description ?? row.source ?? "")}</h3>
                        <p>
                          {row.kind
                            ? t(`finance.kinds.${String(row.kind)}`)
                            : t(`finance.${entity}`)}{" "}
                          ·{" "}
                          {String(
                            row.period ?? row.paid_on ?? row.starts_on ?? "",
                          ).slice(0, 10)}{" "}
                          · {String(row.source ?? "")}
                        </p>
                      </div>
                      <div className="finance-record-value">
                        <strong>
                          {row.amount_cents === null
                            ? t("finance.unknown")
                            : typeof row.amount_cents === "number"
                              ? money(row.amount_cents)
                              : String(row.external_id ?? "")}
                        </strong>
                        {row.estimated && <span>{t("finance.estimated")}</span>}
                        {row.cancelled && <span>{t("finance.cancelled")}</span>}
                        {row.allocation && (
                          <small>
                            {t("finance.fields.allocation")}:{" "}
                            {String(row.allocation)}
                          </small>
                        )}
                      </div>
                      <div className="finance-record-actions">
                        <button
                          type="button"
                          onClick={() => openForm(entity, row)}
                        >
                          {t("finance.edit")}
                        </button>
                        {entity === "entries" && !row.cancelled && (
                          <button
                            type="button"
                            onClick={() =>
                              openForm("settlements", undefined, row.id)
                            }
                          >
                            {t("finance.settle")}
                          </button>
                        )}
                        {(entity === "entries" || entity === "settlements") && (
                          <button
                            type="button"
                            onClick={() =>
                              openForm(
                                "references",
                                undefined,
                                entity === "entries"
                                  ? row.id
                                  : String(row.entry_id),
                                entity === "settlements" ? row.id : "",
                              )
                            }
                          >
                            {t("finance.reconcile")}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              setHistory(
                                (await financeApi.history(row.id)).data,
                              );
                            } catch (err) {
                              fail(err);
                            }
                          }}
                        >
                          {t("finance.history")}
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
              <div className="finance-toolbar">
                <button
                  type="button"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - 50))}
                >
                  {t("finance.previous")}
                </button>
                <button
                  type="button"
                  disabled={nextOffset === null}
                  onClick={() => nextOffset !== null && setOffset(nextOffset)}
                >
                  {t("finance.next")}
                </button>
              </div>
              {history && (
                <div className="finance-history">
                  <h2>{t("finance.history")}</h2>
                  <button type="button" onClick={() => setHistory(null)}>
                    {t("finance.close")}
                  </button>
                  {history.map((event) => (
                    <article key={event.id}>
                      <p>
                        {new Date(event.happened_at).toLocaleString(
                          i18n.language,
                        )}{" "}
                        · {event.actor_id}
                      </p>
                      <dl>
                        {Object.keys(event.after_record ?? {})
                          .filter(
                            (field) =>
                              Object.values(editable).some((fields) =>
                                fields.includes(field),
                              ) &&
                              event.before_record?.[field] !==
                                event.after_record?.[field],
                          )
                          .map((field) => {
                            const display = (value: unknown) =>
                              value === null ||
                              value === undefined ||
                              value === ""
                                ? t("finance.unknown")
                                : field === "amount_cents"
                                  ? money(Number(value))
                                  : typeof value === "boolean"
                                    ? t(value ? "finance.yes" : "finance.no")
                                    : field === "kind"
                                      ? t(`finance.kinds.${String(value)}`)
                                      : String(value);
                            return (
                              <div key={field}>
                                <dt>{t(`finance.fields.${field}`)}</dt>
                                <dd>
                                  {event.before_record && (
                                    <>
                                      {display(event.before_record[field])}{" "}
                                      →{" "}
                                    </>
                                  )}
                                  {display(event.after_record?.[field])}
                                </dd>
                              </div>
                            );
                          })}
                      </dl>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
