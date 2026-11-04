import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { useConfirmation } from "../../shared/ui/useConfirmation";
import type { ClientEntry, EntryInput } from "./api";
import { formatMoment } from "./format";
import { MarkdownView } from "./MarkdownView";

type ComposerKind = EntryInput["kind"];

export function ClientTimeline({
  clientName,
  entries,
  canEdit,
  canArchive,
  userId,
  onAdd,
  onRemove,
}: {
  clientName: string;
  entries: ClientEntry[];
  canEdit: boolean;
  canArchive: boolean;
  userId: string | null;
  onAdd: (input: EntryInput) => Promise<void>;
  onRemove: (entry: ClientEntry) => Promise<void>;
}) {
  const { t } = useTranslation("clients");
  const { confirm, confirmationDialog } = useConfirmation();
  const [kind, setKind] = useState<ComposerKind>("nota");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sorted = [...entries].sort((a, b) =>
    b.occurred_at.localeCompare(a.occurred_at),
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !body.trim()) return;
    setBusy(true);
    setError("");
    try {
      await onAdd({
        kind,
        body: body.trim(),
        ...(title.trim() ? { title: title.trim() } : {}),
      });
      setBody("");
      setTitle("");
    } catch {
      setError(t("timeline.addError"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (entry: ClientEntry) => {
    const confirmed = await confirm({
      title: t("timeline.deleteTitle"),
      description: t("timeline.deleteDescription"),
      confirmLabel: t("timeline.deleteConfirm"),
      destructive: true,
    });
    if (!confirmed) return;
    setError("");
    try {
      await onRemove(entry);
    } catch {
      setError(t("timeline.deleteError"));
    }
  };

  const entryTitle = (entry: ClientEntry) =>
    entry.title ||
    (entry.kind === "diagnostico"
      ? t("timeline.diagnosticTitle")
      : entry.kind === "estagio"
        ? t("timeline.stageTitle")
        : t(`timeline.kinds.${entry.kind}`));

  return (
    <section className="clients-card clients-side-card">
      <div className="clients-side-head">
        <h2>{t("timeline.title")}</h2>
        <span className="clients-muted">{entries.length}</span>
      </div>

      {canEdit && (
        <form className="clients-composer" onSubmit={submit}>
          <input
            className="clients-composer-title"
            value={title}
            maxLength={200}
            disabled={busy}
            placeholder={t("timeline.titlePlaceholder")}
            aria-label={t("timeline.titleLabel")}
            onChange={(event) => setTitle(event.target.value)}
          />
          <textarea
            value={body}
            rows={2}
            disabled={busy}
            maxLength={100000}
            placeholder={t("timeline.bodyPlaceholder", { name: clientName })}
            aria-label={t("timeline.bodyLabel")}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey))
                void submit(event);
            }}
          />
          <div className="clients-composer-row">
            <div
              className="clients-seg"
              role="group"
              aria-label={t("timeline.kindLabel")}
            >
              {(["nota", "reuniao"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={kind === option}
                  onClick={() => setKind(option)}
                >
                  {t(`timeline.kinds.${option}`)}
                </button>
              ))}
            </div>
            <button
              className="button button-primary button-small"
              type="submit"
              disabled={busy || !body.trim()}
            >
              {busy ? t("actions.saving") : t("actions.save")}
            </button>
          </div>
        </form>
      )}
      {error && (
        <div className="clients-error" role="alert">
          <span>{error}</span>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="clients-body-empty">{t("timeline.empty")}</p>
      ) : (
        <ul className="clients-timeline">
          {sorted.map((entry) => {
            const deletable =
              (entry.kind === "nota" || entry.kind === "reuniao") &&
              (canArchive || (userId !== null && entry.author_id === userId));
            return (
              <li
                key={entry.id}
                className={entry.kind === "diagnostico" ? "is-diagnostic" : ""}
              >
                <div className="clients-timeline-top">
                  <div className="clients-timeline-title">
                    {entryTitle(entry)}
                  </div>
                  {deletable && (
                    <button
                      className="icon-button subtle"
                      type="button"
                      aria-label={t("timeline.deleteEntry", {
                        title: entryTitle(entry),
                      })}
                      onClick={() => void remove(entry)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>
                {entry.body && <MarkdownView text={entry.body} />}
                <div className="clients-timeline-meta">
                  {t("timeline.meta", {
                    kind: t(`timeline.kinds.${entry.kind}`),
                    author: entry.author_name,
                    date: formatMoment(entry.occurred_at),
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {confirmationDialog}
    </section>
  );
}
