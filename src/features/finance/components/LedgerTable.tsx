import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { History, Link2 } from "lucide-react";
import { ActionMenu } from "../../../shared/ui/ActionMenu";
import type { FinanceRecord } from "../api";
import { textValue as text, type LedgerView } from "../model";
import { useFinanceFormat } from "../format";

export type LedgerAction =
  | "edit"
  | "settle"
  | "evidence"
  | "history"
  | "remove";

const columns: Record<LedgerView, string[]> = {
  entries: ["description", "kind", "category", "source", "amount", "actions"],
  settlements: ["entry", "date", "source", "amount", "actions"],
  templates: ["description", "source", "recurrence", "amount", "actions"],
  references: ["entry", "target", "source", "external", "actions"],
};

function Badges({ row }: { row: FinanceRecord }) {
  const { t } = useTranslation("common");
  const badges = [
    row.cancelled ? ["cancelled", t("finance.status.cancelled")] : null,
    row.estimated ? ["estimated", t("finance.status.estimated")] : null,
    row.amount_cents === null ? ["unknown", t("finance.status.unknown")] : null,
    row.active === false ? ["paused", t("finance.status.paused")] : null,
  ].filter(Boolean) as Array<[string, string]>;
  if (!badges.length) return null;
  return (
    <span className="finance-badges">
      {badges.map(([tone, label]) => (
        <span key={tone} className="finance-badge" data-tone={tone}>
          {label}
        </span>
      ))}
    </span>
  );
}

/**
 * One table for every ledger view. On narrow screens the same rows are laid
 * out as a stacked list (see finance.css) so there is a single DOM to render.
 */
export function LedgerTable({
  view,
  rows,
  busy,
  onAction,
}: {
  view: LedgerView;
  rows: FinanceRecord[];
  busy: boolean;
  onAction: (action: LedgerAction, row: FinanceRecord) => void;
}) {
  const { t } = useTranslation("common");
  const format = useFinanceFormat();
  const amount = (row: FinanceRecord) =>
    typeof row.amount_cents === "number"
      ? format.money(row.amount_cents)
      : t("finance.status.unknown");

  const cell = (column: string, row: FinanceRecord): ReactNode => {
    const name = text(row.description) || t("finance.context.untitled");
    switch (column) {
      case "description":
        return (
          <>
            <strong className="finance-row-title">{name}</strong>
            <Badges row={row} />
            {text(row.reason) && row.cancelled && (
              <small>{t("finance.table.reason", { reason: row.reason })}</small>
            )}
            {text(row.project) && (
              <small>
                {t("finance.table.project", { project: row.project })}
              </small>
            )}
          </>
        );
      case "entry":
        return (
          <>
            <strong className="finance-row-title">{name}</strong>
            <Badges row={row} />
          </>
        );
      case "kind":
        return t(`finance.kinds.${String(row.kind)}`);
      case "category":
        return text(row.category);
      case "source":
        return view === "templates" ? (
          <>
            {text(row.source)}
            <small>{text(row.category)}</small>
          </>
        ) : (
          text(row.source)
        );
      case "amount":
        return (
          <span
            className="finance-amount"
            data-kind={view === "entries" ? text(row.kind) : undefined}
          >
            {amount(row)}
          </span>
        );
      case "date":
        return text(row.paid_on) ? format.date(text(row.paid_on)) : "";
      case "recurrence":
        return text(row.ends_on)
          ? t("finance.table.range", {
              start: format.shortMonth(text(row.starts_on)),
              end: format.shortMonth(text(row.ends_on)),
            })
          : t("finance.table.openEnded", {
              start: format.shortMonth(text(row.starts_on)),
            });
      case "target":
        return t(
          row.settlement_id
            ? "finance.table.targetSettlement"
            : "finance.table.targetEntry",
        );
      case "external":
        return (
          <>
            {text(row.external_id) ? (
              <code>{text(row.external_id)}</code>
            ) : (
              <span className="finance-muted">
                {t("finance.table.noExternal")}
              </span>
            )}
            {text(row.note) && <small>{text(row.note)}</small>}
          </>
        );
      case "actions":
        return (
          <RowActions
            view={view}
            row={row}
            name={name}
            busy={busy}
            onAction={onAction}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="finance-table-wrap">
      {/* Explicit roles keep table semantics when phones restyle the rows. */}
      <table className="finance-table" data-view={view} role="table">
        <caption className="sr-only">{t(`finance.views.${view}`)}</caption>
        <thead role="rowgroup">
          <tr role="row">
            {columns[view].map((column) => (
              <th
                key={column}
                scope="col"
                role="columnheader"
                data-column={column}
              >
                {column === "actions" ? (
                  <span className="sr-only">
                    {t("finance.table.columns.actions")}
                  </span>
                ) : (
                  t(`finance.table.columns.${column}`)
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((row) => (
            <tr
              key={row.id}
              role="row"
              data-cancelled={row.cancelled || undefined}
            >
              {columns[view].map((column) => (
                <td
                  key={column}
                  role="cell"
                  data-column={column}
                  data-label={t(`finance.table.columns.${column}`)}
                >
                  {cell(column, row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowActions({
  view,
  row,
  name,
  busy,
  onAction,
}: {
  view: LedgerView;
  row: FinanceRecord;
  name: string;
  busy: boolean;
  onAction: (action: LedgerAction, row: FinanceRecord) => void;
}) {
  const { t } = useTranslation("common");
  const settleLabel =
    row.kind === "income"
      ? t("finance.actions.receive")
      : row.kind === "transfer"
        ? t("finance.actions.move")
        : t("finance.actions.pay");
  const canSettle = view === "entries" && !row.cancelled;
  const canEvidence = view === "entries" || view === "settlements";
  return (
    <div className="finance-row-actions">
      {canSettle && (
        <button
          type="button"
          className="button button-ghost"
          disabled={busy}
          aria-label={`${settleLabel}: ${name}`}
          onClick={() => onAction("settle", row)}
        >
          {settleLabel}
        </button>
      )}
      <button
        type="button"
        className="button button-ghost"
        disabled={busy}
        aria-label={`${t("finance.edit")}: ${name}`}
        onClick={() => onAction("edit", row)}
      >
        {t("finance.edit")}
      </button>
      {canEvidence && !row.cancelled && (
        <button
          type="button"
          className="button button-ghost finance-remove-action"
          disabled={busy}
          aria-label={`${t("finance.remove")}: ${name}`}
          onClick={() => onAction("remove", row)}
        >
          {t("finance.remove")}
        </button>
      )}
      <ActionMenu label={name}>
        {canEvidence && (
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => onAction("evidence", row)}
          >
            <Link2 size={14} aria-hidden="true" /> {t("finance.reconcile")}
          </button>
        )}
        <button
          type="button"
          role="menuitem"
          disabled={busy}
          onClick={() => onAction("history", row)}
        >
          <History size={14} aria-hidden="true" /> {t("finance.history.title")}
        </button>
      </ActionMenu>
    </div>
  );
}
