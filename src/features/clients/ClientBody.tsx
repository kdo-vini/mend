import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Disclosure } from "../../shared/ui/Disclosure";
import {
  appendSection,
  countLines,
  replaceSection,
  splitSections,
} from "./markdown";
import { MarkdownView } from "./MarkdownView";

function TextEditor({
  label,
  initial,
  rows,
  mono = false,
  busy,
  error,
  hint,
  onSave,
  onCancel,
}: {
  label: string;
  initial: string;
  rows: number;
  mono?: boolean;
  busy: boolean;
  error: string;
  hint?: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("clients");
  const [draft, setDraft] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="clients-editor">
      <textarea
        ref={ref}
        className={`clients-editor-input${mono ? " is-mono" : ""}`}
        rows={rows}
        value={draft}
        disabled={busy}
        aria-label={label}
        aria-busy={busy}
        maxLength={100000}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
          else if (event.key === "Enter" && (event.ctrlKey || event.metaKey))
            onSave(draft);
        }}
      />
      {hint && <p className="clients-editor-hint">{hint}</p>}
      {error && (
        <div className="clients-error" role="alert">
          <span>{error}</span>
        </div>
      )}
      <div className="clients-editor-actions">
        <button
          className="button button-primary button-small"
          type="button"
          disabled={busy}
          onClick={() => onSave(draft)}
        >
          {busy ? t("actions.saving") : t("actions.save")}
        </button>
        <button
          className="button button-ghost button-small"
          type="button"
          disabled={busy}
          onClick={onCancel}
        >
          {t("actions.cancel")}
        </button>
      </div>
    </div>
  );
}

export function ClientBody({
  body,
  canEdit,
  onSaveBody,
}: {
  body: string;
  canEdit: boolean;
  onSaveBody: (next: string) => Promise<void>;
}) {
  const { t } = useTranslation("clients");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingAll, setEditingAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  const sections = splitSections(body);
  // An intro with nothing in it only exists to keep the body round-trippable.
  const visible = sections
    .map((section, index) => ({ section, index }))
    .filter(({ section }) => section.title !== null || section.content);
  const firstOpen = visible[0]?.index;

  useEffect(() => {
    if (adding) titleRef.current?.focus();
  }, [adding]);

  const run = async (next: string, done: () => void) => {
    setBusy(true);
    setError("");
    try {
      await onSaveBody(next);
      done();
    } catch {
      setError(t("body.saveError"));
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    setEditingIndex(null);
    setEditingAll(false);
    setAdding(false);
    setNewTitle("");
    setError("");
  };

  const addSection = async (event: React.FormEvent) => {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title || busy) return;
    const index = sections.length;
    await run(appendSection(body, title), () => {
      setAdding(false);
      setNewTitle("");
      setOpenIndex(index);
      setEditingIndex(index);
    });
  };

  return (
    <div className="clients-body">
      <div className="clients-body-head">
        <h2>{t("body.title")}</h2>
        {canEdit && !editingAll && (
          <button
            className="button button-ghost button-small"
            type="button"
            disabled={busy}
            onClick={() => {
              cancel();
              setEditingAll(true);
            }}
          >
            {t("body.editAll")}
          </button>
        )}
      </div>

      {editingAll ? (
        <TextEditor
          label={t("body.editAllLabel")}
          initial={body}
          rows={18}
          mono
          busy={busy}
          error={error}
          hint={t("body.markdownHint")}
          onSave={(value) => void run(value, cancel)}
          onCancel={cancel}
        />
      ) : (
        <>
          {visible.length === 0 && (
            <p className="clients-body-empty">{t("body.empty")}</p>
          )}
          {visible.map(({ section, index }) => {
            const editing = editingIndex === index;
            return (
              <Disclosure
                key={index}
                defaultOpen={index === firstOpen || index === openIndex}
                title={section.title ?? t("body.intro")}
                summary={
                  section.content
                    ? t("body.lines", { count: countLines(section.content) })
                    : t("body.emptySummary")
                }
              >
                {editing ? (
                  <TextEditor
                    label={t("body.sectionLabel", {
                      title: section.title ?? t("body.intro"),
                    })}
                    initial={section.content}
                    rows={8}
                    busy={busy}
                    error={error}
                    onSave={(value) =>
                      void run(replaceSection(body, index, value), cancel)
                    }
                    onCancel={cancel}
                  />
                ) : (
                  <>
                    {section.content ? (
                      <MarkdownView text={section.content} />
                    ) : (
                      <p className="clients-body-empty">
                        {t("body.sectionEmpty")}
                      </p>
                    )}
                    {canEdit && (
                      <div className="clients-section-actions">
                        <button
                          className="button button-ghost button-small"
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            cancel();
                            setEditingIndex(index);
                          }}
                        >
                          {t("body.editSection")}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </Disclosure>
            );
          })}

          {canEdit &&
            (adding ? (
              <form className="clients-add-form" onSubmit={addSection}>
                <label className="clients-field">
                  <span>{t("body.newSectionTitle")}</span>
                  <input
                    ref={titleRef}
                    required
                    maxLength={120}
                    value={newTitle}
                    disabled={busy}
                    onChange={(event) => setNewTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") cancel();
                    }}
                  />
                </label>
                {error && (
                  <div className="clients-error" role="alert">
                    <span>{error}</span>
                  </div>
                )}
                <div className="clients-editor-actions">
                  <button
                    className="button button-primary button-small"
                    type="submit"
                    disabled={busy || !newTitle.trim()}
                  >
                    {busy ? t("actions.saving") : t("body.addSectionConfirm")}
                  </button>
                  <button
                    className="button button-ghost button-small"
                    type="button"
                    disabled={busy}
                    onClick={cancel}
                  >
                    {t("actions.cancel")}
                  </button>
                </div>
              </form>
            ) : (
              <button
                className="button button-ghost clients-add-section"
                type="button"
                disabled={busy}
                onClick={() => {
                  cancel();
                  setAdding(true);
                }}
              >
                <Plus size={14} aria-hidden="true" /> {t("body.addSection")}
              </button>
            ))}
        </>
      )}
    </div>
  );
}
