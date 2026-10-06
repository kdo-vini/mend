import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, LoaderCircle, RefreshCw, X } from "lucide-react";
import { associationFields, type FinanceContext } from "../model";
import type { FinanceEditor } from "../useFinanceEditor";
import { useFinanceFormat } from "../format";
import { useFinanceValue } from "./financeValue";

/**
 * Shared frame for every finance form: heading, the record the action applies
 * to (instead of raw identifiers), version-conflict recovery and actions.
 */
export function FinanceEditorFrame({
  editor,
  title,
  submitLabel,
  children,
}: {
  editor: FinanceEditor;
  title: string;
  submitLabel: string;
  children: ReactNode;
}) {
  const { t } = useTranslation("common");
  const display = useFinanceValue();
  const ref = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const { draft, busy, error, conflict, latestChanges, reloaded } = editor;
  const draftId = draft?.record.id;

  useEffect(() => {
    if (!draftId) return;
    const frame = ref.current;
    if (!returnFocus.current && document.activeElement instanceof HTMLElement)
      returnFocus.current = document.activeElement;
    const previousFocus = returnFocus.current;
    frame?.scrollIntoView({
      block: "nearest",
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
    frame
      ?.querySelector<HTMLElement>(
        "input:not([type=hidden]):not(:disabled),select,textarea",
      )
      ?.focus({ preventScroll: true });
    return () => {
      queueMicrotask(() => {
        // StrictMode rehearses effect cleanup while the same form is mounted.
        if (frame?.isConnected) return;
        const target =
          previousFocus instanceof HTMLElement &&
          previousFocus.isConnected &&
          !previousFocus.matches(":disabled")
            ? previousFocus
            : document.getElementById("finance-attention-title");
        target?.focus({ preventScroll: true });
      });
    };
  }, [draftId]);

  if (!draft) return null;
  const changes = Object.entries(latestChanges).filter(
    ([field]) => !associationFields.has(field),
  );
  const errorMessage =
    error && error !== "amount" ? t(`finance.errors.${error}`) : null;

  return (
    <section
      ref={ref}
      className="finance-editor"
      aria-labelledby="finance-editor-title"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) editor.close();
      }}
    >
      <header className="finance-editor-header">
        <h2 id="finance-editor-title">{title}</h2>
        <button
          type="button"
          className="icon-button subtle"
          aria-label={t("finance.closeForm")}
          disabled={busy}
          onClick={editor.close}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      {draft.context && <ContextSummary context={draft.context} />}
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void editor.submit();
        }}
      >
        <fieldset disabled={busy} className="finance-form-body">
          {children}
        </fieldset>
        {reloaded && (
          <p role="status" className="finance-inline-note">
            {t("finance.draftReloaded")}
          </p>
        )}
        {changes.length > 0 && (
          <aside
            className="finance-latest"
            aria-label={t("finance.latestChanges")}
          >
            <p>{t("finance.latestChanges")}</p>
            <dl>
              {changes.map(([field, value]) => (
                <div key={field}>
                  <dt>{t(`finance.fields.${field}`)}</dt>
                  <dd>{display(field, value)}</dd>
                </div>
              ))}
            </dl>
          </aside>
        )}
        {errorMessage && (
          <div role="alert" className="finance-form-error">
            <AlertTriangle size={15} aria-hidden="true" />
            <span>{errorMessage}</span>
            {conflict && (
              <button
                type="button"
                className="button button-ghost"
                disabled={busy}
                onClick={() => void editor.reloadLatest()}
              >
                <RefreshCw size={13} aria-hidden="true" />
                {t("finance.reloadDraft")}
              </button>
            )}
          </div>
        )}
        <div className="finance-form-actions">
          <button
            type="submit"
            className="button button-primary"
            disabled={busy || conflict}
            aria-busy={busy || undefined}
          >
            {busy && (
              <LoaderCircle
                size={14}
                className="finance-spinner"
                aria-hidden="true"
              />
            )}
            {busy ? t("finance.saving") : submitLabel}
          </button>
          <button
            type="button"
            className="button button-ghost"
            disabled={busy}
            onClick={editor.close}
          >
            {t("finance.cancelForm")}
          </button>
        </div>
      </form>
    </section>
  );
}

function ContextSummary({ context }: { context: FinanceContext }) {
  const { t } = useTranslation("common");
  const format = useFinanceFormat();
  const details = [
    context.kind ? t(`finance.kinds.${context.kind}`) : null,
    context.period
      ? t("finance.context.accrual", { month: format.month(context.period) })
      : null,
    context.paidOn
      ? t("finance.context.paidOn", { date: format.date(context.paidOn) })
      : null,
    context.amountCents === null
      ? t("finance.status.unknown")
      : context.amountCents !== undefined
        ? format.money(context.amountCents)
        : null,
  ].filter(Boolean);
  return (
    <div className="finance-context" aria-label={t("finance.context.label")}>
      <strong>{context.description || t("finance.context.untitled")}</strong>
      {details.length > 0 && <span>{details.join(" · ")}</span>}
    </div>
  );
}
