import { useCallback, useState } from "react";
import { LiveActionError } from "../../api/transport";
import { financeApi } from "./api";
import {
  draftToRecord,
  mergeLatest,
  type FinanceDraft,
  type FinanceFields,
  type FinanceValue,
} from "./model";
import { isForbidden } from "./useFinanceData";

export type FinanceEditorError =
  | "amount"
  | "conflict"
  | "duplicate"
  | "invalid"
  | "generic";

function classify(err: unknown, editing: boolean): FinanceEditorError {
  if (err instanceof Error && err.message === "invalid_amount") return "amount";
  if (err instanceof LiveActionError) {
    if (err.code === "finance_conflict" || err.status === 409)
      return editing ? "conflict" : "duplicate";
    if (
      err.status === 400 ||
      err.code === "invalid_input" ||
      err.code === "finance_invalid_record"
    )
      return "invalid";
  }
  return "generic";
}

/**
 * Draft lifecycle for every finance form: optimistic-version save, conflict
 * recovery that keeps the operator's edits, and revocation handling.
 */
export function useFinanceEditor({
  onSaved,
  onForbidden,
}: {
  onSaved: (draft: FinanceDraft) => void;
  onForbidden: () => void;
}) {
  const [draft, setDraft] = useState<FinanceDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<FinanceEditorError | null>(null);
  const [conflict, setConflict] = useState(false);
  const [latestChanges, setLatestChanges] = useState<FinanceFields>({});
  const [reloaded, setReloaded] = useState(false);

  const open = useCallback((next: FinanceDraft) => {
    setDraft(next);
    setError(null);
    setConflict(false);
    setLatestChanges({});
    setReloaded(false);
  }, []);

  const close = useCallback(() => {
    setDraft(null);
    setError(null);
    setConflict(false);
    setLatestChanges({});
    setReloaded(false);
  }, []);

  const update = useCallback((field: string, value: FinanceValue) => {
    setDraft((current) =>
      current
        ? { ...current, record: { ...current.record, [field]: value } }
        : current,
    );
  }, []);

  const setAmountText = useCallback((amountText: string) => {
    setDraft((current) => (current ? { ...current, amountText } : current));
    setError((current) => (current === "amount" ? null : current));
  }, []);

  const submit = useCallback(async () => {
    if (!draft || busy || conflict) return;
    let record;
    try {
      record = draftToRecord(draft);
    } catch (err) {
      setError(classify(err, draft.version !== null));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await financeApi.save(draft.entity, record, draft.version);
      const saved = draft;
      close();
      onSaved(saved);
    } catch (err) {
      if (isForbidden(err)) {
        close();
        onForbidden();
        return;
      }
      const kind = classify(err, draft.version !== null);
      setError(kind);
      setConflict(kind === "conflict");
    } finally {
      setBusy(false);
    }
  }, [draft, busy, conflict, close, onSaved, onForbidden]);

  const reloadLatest = useCallback(async () => {
    if (!draft || busy) return;
    setBusy(true);
    try {
      const latest = await financeApi.get(
        draft.entity,
        String(draft.record.id),
      );
      const merged = mergeLatest(draft, latest);
      setDraft(merged.draft);
      setLatestChanges(merged.changes);
      setConflict(false);
      setError(null);
      setReloaded(true);
    } catch (err) {
      if (isForbidden(err)) {
        close();
        onForbidden();
        return;
      }
      setError("generic");
    } finally {
      setBusy(false);
    }
  }, [draft, busy, close, onForbidden]);

  return {
    draft,
    busy,
    error,
    conflict,
    latestChanges,
    reloaded,
    open,
    close,
    update,
    setAmountText,
    submit,
    reloadLatest,
  };
}

export type FinanceEditor = ReturnType<typeof useFinanceEditor>;
/** Editor narrowed to an open draft, as received by the domain forms. */
export type DraftEditor = FinanceEditor & {
  draft: NonNullable<FinanceEditor["draft"]>;
};
