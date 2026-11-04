import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../../components/ui/dialog";
import { clientStages, clientsApi, type ClientStage } from "./api";
import { clientErrorKey } from "./errors";

interface Draft {
  name: string;
  contact: string;
  phone: string;
  email: string;
  area: string;
  stage: ClientStage;
}

const emptyDraft: Draft = {
  name: "",
  contact: "",
  phone: "",
  email: "",
  area: "",
  stage: "lead",
};

export function NewClientDialog({
  open,
  onOpenChange,
  onCreated,
  returnFocusRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
  returnFocusRef: React.RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation("clients");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  const set = <Key extends keyof Draft>(key: Key, value: Draft[Key]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = draft.name.trim();
    if (saving || !name) return;
    setSaving(true);
    setError("");
    const optional = (value: string) => value.trim() || undefined;
    try {
      const created = await clientsApi.create({
        name,
        contact: optional(draft.contact),
        phone: optional(draft.phone),
        email: optional(draft.email),
        area: optional(draft.area),
        stage: draft.stage,
      });
      setDraft(emptyDraft);
      onOpenChange(false);
      onCreated(created.id);
    } catch (failure) {
      setError(t(`errors.create.${clientErrorKey(failure)}`));
    } finally {
      setSaving(false);
    }
  };

  const text = (
    key: keyof Omit<Draft, "stage">,
    type: "text" | "tel" | "email" = "text",
  ) => (
    <label className="clients-field">
      <span>{t(`fields.${key}`)}</span>
      <input
        ref={key === "name" ? nameRef : undefined}
        required={key === "name"}
        type={type}
        maxLength={key === "email" ? 320 : 200}
        value={draft[key]}
        disabled={saving}
        onChange={(event) => set(key, event.target.value)}
      />
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      {open && (
        <DialogContent
          className="clients-dialog"
          showCloseButton={false}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            nameRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
          onEscapeKeyDown={(event) => saving && event.preventDefault()}
          onPointerDownOutside={(event) => saving && event.preventDefault()}
        >
          <form className="clients-dialog-form" onSubmit={submit}>
            <header className="clients-dialog-header">
              <DialogTitle>{t("create.title")}</DialogTitle>
              <button
                className="icon-button"
                type="button"
                aria-label={t("actions.close")}
                disabled={saving}
                onClick={() => onOpenChange(false)}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </header>
            <DialogDescription className="clients-dialog-description">
              {t("create.description")}
            </DialogDescription>
            {error && (
              <div className="clients-error" role="alert">
                <span>{error}</span>
              </div>
            )}
            {text("name")}
            <div className="clients-dialog-grid">
              {text("contact")}
              {text("phone", "tel")}
              {text("email", "email")}
              {text("area")}
            </div>
            <label className="clients-field">
              <span>{t("fields.stage")}</span>
              <select
                value={draft.stage}
                disabled={saving}
                onChange={(event) =>
                  set("stage", event.target.value as ClientStage)
                }
              >
                {clientStages.map((stage) => (
                  <option key={stage} value={stage}>
                    {t(`stages.${stage}`)}
                  </option>
                ))}
              </select>
            </label>
            <footer className="clients-dialog-footer">
              <button
                className="button button-ghost"
                type="button"
                disabled={saving}
                onClick={() => onOpenChange(false)}
              >
                {t("actions.cancel")}
              </button>
              <button
                className="button button-primary"
                type="submit"
                disabled={saving || !draft.name.trim()}
              >
                {saving ? t("actions.creating") : t("actions.create")}
              </button>
            </footer>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
