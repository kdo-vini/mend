import { Save, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function KnowledgeProductDialog({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (input: {
    key: string;
    name: string;
    description: string;
    aliases: string[];
  }) => Promise<void>;
}) {
  const { t } = useTranslation("knowledge");
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [aliases, setAliases] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="knowledge-product-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="page-kicker">{t("products.catalog")}</span>
            <h2 id="knowledge-product-title">{t("products.create")}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label={t("products.close")}
          >
            <X size={17} />
          </button>
        </div>
        <div className="modal-body">
          <label>
            {t("products.name")}
            <input
              autoFocus
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (!key)
                  setKey(
                    event.target.value
                      .toLowerCase()
                      .normalize("NFKD")
                      .replace(/[\u0300-\u036f]/g, "")
                      .replace(/[^a-z0-9]+/g, "-"),
                  );
              }}
            />
          </label>
          <label>
            {t("products.key")}
            <input
              value={key}
              onChange={(event) =>
                setKey(
                  event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                )
              }
            />
          </label>
          <label>
            {t("products.description")}
            <textarea
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label>
            {t("products.aliases")}
            <input
              value={aliases}
              onChange={(event) => setAliases(event.target.value)}
              placeholder={t("products.aliasesPlaceholder")}
            />
          </label>
        </div>
        <div className="modal-footer">
          <button
            className="button button-ghost"
            type="button"
            onClick={onClose}
          >
            {t("actions.cancel", { ns: "common" })}
          </button>
          <button
            className="button button-primary"
            type="button"
            disabled={saving || !name.trim() || key.length < 2}
            onClick={() => {
              setSaving(true);
              void onSave({
                key,
                name: name.trim(),
                description: description.trim(),
                aliases: aliases
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
              }).finally(() => setSaving(false));
            }}
          >
            <Save size={14} /> {t("products.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
