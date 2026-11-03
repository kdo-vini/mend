import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Copy,
  KeyRound,
  NotebookPen,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { LiveActionError } from "../../api/transport";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  ConfirmDialog,
  type ConfirmationRequest,
} from "../../shared/ui/ConfirmDialog";
import { EmptyState, LoadingState } from "../../shared/ui/ResourceState";
import { PageHeader } from "../../shared/ui/PageHeader";
import { appLocale } from "../../i18n/resources";
import { diaryApi, type DiaryEntry, type DiaryToken } from "./api";

const dayMs = 86_400_000;

function dayKey(iso: string) {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function DiaryPage() {
  const { t } = useTranslation("diary");
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DiaryEntry | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(
    null,
  );
  const [connectOpen, setConnectOpen] = useState(false);
  const connectTriggerRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setEntries(await diaryApi.list());
    } catch {
      setLoadError(t("errors.load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => void load(), [load]);

  const groups = useMemo(() => {
    const byDay = new Map<string, DiaryEntry[]>();
    for (const entry of entries) {
      const key = dayKey(entry.created_at);
      byDay.set(key, [...(byDay.get(key) ?? []), entry]);
    }
    return [...byDay.values()];
  }, [entries]);

  const dayLabel = (iso: string) => {
    const key = dayKey(iso);
    if (key === dayKey(new Date().toISOString())) return t("days.today");
    if (key === dayKey(new Date(Date.now() - dayMs).toISOString()))
      return t("days.yesterday");
    return new Intl.DateTimeFormat(appLocale, {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date(iso));
  };

  const requestDelete = (entry: DiaryEntry) => {
    if (deletingId) return;
    setDeletingId(entry.id);
    setDeleteTarget(entry);
    setConfirmation({
      title: t("delete.title"),
      description: t("delete.description", { title: entry.title }),
      confirmLabel: t("delete.confirm"),
      destructive: true,
    });
  };

  const resolveDelete = async (confirmed: boolean) => {
    const entry = deleteTarget;
    setConfirmation(null);
    setDeleteTarget(null);
    if (!confirmed || !entry) {
      setDeletingId(null);
      return;
    }
    try {
      await diaryApi.remove(entry.id);
      setEntries((current) => current.filter((item) => item.id !== entry.id));
    } catch (error) {
      setLoadError(
        error instanceof LiveActionError && error.status === 404
          ? t("errors.deleteMissing")
          : t("errors.delete"),
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <main className="page diary-page">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        actions={
          <button
            ref={connectTriggerRef}
            className="button button-ghost"
            type="button"
            onClick={() => setConnectOpen(true)}
          >
            <KeyRound size={15} aria-hidden="true" /> {t("actions.connect")}
          </button>
        }
      />

      {loadError && (
        <div className="diary-error" role="alert">
          <span>{loadError}</span>
          <button
            className="button button-ghost button-small"
            type="button"
            onClick={() => void load()}
          >
            <RefreshCw size={14} aria-hidden="true" /> {t("actions.retry")}
          </button>
        </div>
      )}

      {loading ? (
        <LoadingState label={t("loading")} />
      ) : loadError && entries.length === 0 ? null : entries.length === 0 ? (
        <section className="diary-empty-surface">
          <EmptyState
            title={t("empty.title")}
            description={t("empty.description")}
          />
        </section>
      ) : (
        <div className="diary-days">
          {groups.map((group) => (
            <section
              key={dayKey(group[0].created_at)}
              className="diary-day"
              aria-label={dayLabel(group[0].created_at)}
            >
              <h2 className="diary-day-title">
                {dayLabel(group[0].created_at)}
              </h2>
              <ol className="diary-entries">
                {group.map((entry) => (
                  <DiaryEntryCard
                    key={entry.id}
                    entry={entry}
                    busy={deletingId !== null}
                    onDelete={() => requestDelete(entry)}
                  />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      <ConnectClaudeDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        returnFocusRef={connectTriggerRef}
      />
      {confirmation && (
        <ConfirmDialog
          request={confirmation}
          onResolve={(confirmed) => void resolveDelete(confirmed)}
        />
      )}
    </main>
  );
}

function DiaryEntryCard({
  entry,
  busy,
  onDelete,
}: {
  entry: DiaryEntry;
  busy: boolean;
  onDelete: () => void;
}) {
  const { t } = useTranslation("diary");
  const time = new Intl.DateTimeFormat(appLocale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(entry.created_at));
  const daysLeft = Math.max(
    1,
    Math.ceil((new Date(entry.expires_at).getTime() - Date.now()) / dayMs),
  );
  return (
    <li className="diary-entry">
      <header className="diary-entry-top">
        <span className="diary-entry-mark">
          <NotebookPen size={16} aria-hidden="true" />
        </span>
        <div className="diary-entry-heading">
          <h3>{entry.title}</h3>
          <p className="diary-entry-meta">
            <span>{entry.author_name}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={entry.created_at}>{time}</time>
            {entry.project && (
              <span className="diary-entry-project">{entry.project}</span>
            )}
          </p>
        </div>
        {entry.deletable && (
          <button
            className="icon-button"
            type="button"
            disabled={busy}
            aria-label={t("actions.deleteEntry", { title: entry.title })}
            onClick={onDelete}
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        )}
      </header>
      <p className="diary-entry-body">{entry.body}</p>
      <footer className="diary-entry-expiry">
        {t("expiry", { count: daysLeft })}
      </footer>
    </li>
  );
}

function ConnectClaudeDialog({
  open,
  onOpenChange,
  returnFocusRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useTranslation("diary");
  const [tokens, setTokens] = useState<DiaryToken[]>([]);
  const [label, setLabel] = useState("");
  const [secret, setSecret] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const labelRef = useRef<HTMLInputElement>(null);

  const loadTokens = useCallback(async () => {
    try {
      setTokens(await diaryApi.listTokens());
    } catch {
      setError(t("errors.tokens"));
    }
  }, [t]);

  useEffect(() => {
    if (!open) return;
    setSecret("");
    setCopied(false);
    setError("");
    void loadTokens();
  }, [open, loadTokens]);

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await diaryApi.createToken(label.trim());
      setSecret(result.secret);
      setLabel("");
      await loadTokens();
    } catch (failure) {
      setError(
        failure instanceof LiveActionError && failure.status === 409
          ? t("errors.tokenLimit")
          : t("errors.tokenCreate"),
      );
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (token: DiaryToken) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await diaryApi.revokeToken(token.id);
      await loadTokens();
    } catch {
      setError(t("errors.tokenRevoke"));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const active = tokens.filter((token) => !token.revoked_at);
  const dateFormat = new Intl.DateTimeFormat(appLocale, {
    day: "numeric",
    month: "short",
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      {open && (
        <DialogContent
          className="diary-dialog"
          showCloseButton={false}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            labelRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
        >
          <header className="diary-dialog-header">
            <DialogTitle>{t("connect.title")}</DialogTitle>
            <button
              className="icon-button"
              type="button"
              aria-label={t("actions.close")}
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </header>
          <DialogDescription className="diary-dialog-description">
            {t("connect.description")}
          </DialogDescription>

          {error && (
            <div className="diary-error" role="alert">
              <span>{error}</span>
            </div>
          )}

          {secret ? (
            <div className="diary-secret">
              <p>{t("connect.secretHint")}</p>
              <div className="diary-secret-row">
                <input
                  readOnly
                  aria-label={t("connect.secretLabel")}
                  value={secret}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button
                  className="button button-ghost button-small"
                  type="button"
                  onClick={() => void copy()}
                >
                  <Copy size={14} aria-hidden="true" />{" "}
                  {copied ? t("actions.copied") : t("actions.copy")}
                </button>
              </div>
              <p className="diary-secret-env">{t("connect.envHint")}</p>
            </div>
          ) : (
            <form className="diary-token-form" onSubmit={create}>
              <label className="diary-field">
                <span>{t("connect.labelField")}</span>
                <input
                  ref={labelRef}
                  required
                  maxLength={120}
                  placeholder={t("connect.labelPlaceholder")}
                  value={label}
                  disabled={busy}
                  onChange={(event) => setLabel(event.target.value)}
                />
              </label>
              <button
                className="button button-primary"
                type="submit"
                disabled={busy || !label.trim()}
              >
                {busy ? t("actions.creating") : t("actions.createToken")}
              </button>
            </form>
          )}

          <section aria-labelledby="diary-tokens-title">
            <h3 id="diary-tokens-title" className="diary-tokens-title">
              {t("connect.activeTitle")}
            </h3>
            {active.length === 0 ? (
              <p className="diary-tokens-empty">{t("connect.noTokens")}</p>
            ) : (
              <ul className="diary-tokens">
                {active.map((token) => (
                  <li key={token.id}>
                    <div>
                      <strong>{token.label}</strong>
                      <span>
                        {token.last_used_at
                          ? t("connect.lastUsed", {
                              date: dateFormat.format(
                                new Date(token.last_used_at),
                              ),
                            })
                          : t("connect.neverUsed")}
                      </span>
                    </div>
                    <button
                      className="button button-ghost button-small"
                      type="button"
                      disabled={busy}
                      aria-label={t("actions.revokeToken", {
                        label: token.label,
                      })}
                      onClick={() => void revoke(token)}
                    >
                      {t("actions.revoke")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </DialogContent>
      )}
    </Dialog>
  );
}
