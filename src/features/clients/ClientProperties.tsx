import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  clientProducts,
  type Client,
  type ClientInput,
  type ClientProduct,
} from "./api";
import { formatUtm, productsEqual } from "./model";

type TextField =
  | "name"
  | "contact"
  | "phone"
  | "email"
  | "site"
  | "area"
  | "specialty"
  | "registration"
  | "referral"
  | "notes";

const textFields: {
  key: TextField;
  type?: "text" | "tel" | "email" | "url";
  wide?: boolean;
  multiline?: boolean;
  required?: boolean;
  max: number;
}[] = [
  { key: "name", required: true, max: 200 },
  { key: "contact", max: 200 },
  { key: "phone", type: "tel", max: 40 },
  { key: "email", type: "email", max: 320 },
  { key: "site", type: "url", max: 500 },
  { key: "area", max: 120 },
  { key: "specialty", max: 200 },
  { key: "registration", max: 120 },
  { key: "referral", max: 200 },
];

export function ClientProperties({
  client,
  canEdit,
  onPatch,
}: {
  client: Client;
  canEdit: boolean;
  onPatch: (patch: ClientInput) => Promise<void>;
}) {
  const { t } = useTranslation("clients");
  const utm = formatUtm(client.utm);
  return (
    <section className="clients-card" aria-label={t("properties.label")}>
      <dl className="clients-props">
        {textFields.map((field) => (
          <EditableField
            key={field.key}
            label={t(`fields.${field.key}`)}
            value={client[field.key] ?? ""}
            type={field.type}
            maxLength={field.max}
            required={field.required}
            canEdit={canEdit}
            onSave={(value) => onPatch({ [field.key]: value })}
          />
        ))}
        <ProductsField
          products={client.products}
          canEdit={canEdit}
          onSave={(products) => onPatch({ products })}
        />
        <EditableField
          wide
          multiline
          label={t("fields.notes")}
          value={client.notes ?? ""}
          maxLength={2000}
          canEdit={canEdit}
          onSave={(value) => onPatch({ notes: value })}
        />
      </dl>
      <div className="clients-props-foot">
        <span>{t("properties.origin")}</span>
        <span
          className={`client-tag${client.source === "diagnostico_marca" ? " origin" : ""}`}
        >
          {t(`sources.${client.source}`)}
        </span>
        {utm && (
          <span className="client-tag">{t("properties.utm", { utm })}</span>
        )}
      </div>
    </section>
  );
}

function EditableField({
  label,
  value,
  canEdit,
  type = "text",
  multiline = false,
  wide = false,
  required = false,
  maxLength,
  onSave,
}: {
  label: string;
  value: string;
  canEdit: boolean;
  type?: "text" | "tel" | "email" | "url";
  multiline?: boolean;
  wide?: boolean;
  required?: boolean;
  maxLength: number;
  onSave: (value: string | null) => Promise<void>;
}) {
  const { t } = useTranslation("clients");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const cancelled = useRef(false);
  const refocus = useRef(false);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
    else if (refocus.current) {
      refocus.current = false;
      triggerRef.current?.focus();
    }
  }, [editing]);

  const start = () => {
    cancelled.current = false;
    setDraft(value);
    setError("");
    setEditing(true);
  };

  const commit = async (viaKeyboard: boolean) => {
    if (cancelled.current || pending) return;
    const next = draft.trim();
    if (next === value.trim()) {
      refocus.current = viaKeyboard;
      setEditing(false);
      return;
    }
    if (required && !next) {
      setError(t("properties.required", { field: label }));
      return;
    }
    setPending(true);
    setError("");
    try {
      await onSave(next || null);
      refocus.current = viaKeyboard;
      setEditing(false);
    } catch {
      setError(t("properties.saveError"));
    } finally {
      setPending(false);
    }
  };

  const content = !canEdit ? (
    value ? (
      <span>{value}</span>
    ) : (
      <span className="clients-muted">—</span>
    )
  ) : editing ? (
    <>
      {multiline ? (
        <textarea
          ref={inputRef}
          className="clients-inline-input"
          rows={3}
          maxLength={maxLength}
          value={draft}
          disabled={pending}
          aria-label={label}
          aria-busy={pending}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              cancelled.current = true;
              refocus.current = true;
              setEditing(false);
            } else if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void commit(true);
            }
          }}
        />
      ) : (
        <input
          ref={inputRef}
          className="clients-inline-input"
          type={type}
          maxLength={maxLength}
          value={draft}
          disabled={pending}
          aria-label={label}
          aria-busy={pending}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              cancelled.current = true;
              refocus.current = true;
              setEditing(false);
            } else if (event.key === "Enter") {
              event.preventDefault();
              void commit(true);
            }
          }}
        />
      )}
      {pending && (
        <span className="clients-inline-state" role="status">
          {t("properties.saving")}
        </span>
      )}
      {error && (
        <span className="clients-inline-error" role="alert">
          {error}
        </span>
      )}
    </>
  ) : (
    <button
      ref={triggerRef}
      className={`clients-prop-button${value ? "" : " is-empty"}`}
      type="button"
      aria-label={t("properties.edit", { field: label })}
      onClick={start}
    >
      {value || t("properties.add")}
    </button>
  );

  return (
    <div className={`clients-prop${wide ? " wide" : ""}`}>
      <dt>{label}</dt>
      <dd>{content}</dd>
    </div>
  );
}

function ProductsField({
  products,
  canEdit,
  onSave,
}: {
  products: ClientProduct[];
  canEdit: boolean;
  onSave: (products: ClientProduct[]) => Promise<void>;
}) {
  const { t } = useTranslation("clients");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const toggle = async (product: ClientProduct) => {
    if (pending) return;
    const next = products.includes(product)
      ? products.filter((item) => item !== product)
      : [...products, product];
    if (productsEqual(next, products)) return;
    setPending(true);
    setError("");
    try {
      await onSave(next);
    } catch {
      setError(t("properties.saveError"));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="clients-prop">
      <dt id="clients-products-label">{t("fields.products")}</dt>
      <dd>
        {canEdit ? (
          <div
            className="clients-chips"
            role="group"
            aria-labelledby="clients-products-label"
            aria-busy={pending}
          >
            {clientProducts.map((product) => (
              <button
                key={product}
                type="button"
                className="clients-chip"
                aria-pressed={products.includes(product)}
                disabled={pending}
                onClick={() => void toggle(product)}
              >
                {t(`products.${product}`)}
              </button>
            ))}
          </div>
        ) : products.length ? (
          <span>
            {products.map((product) => t(`products.${product}`)).join(", ")}
          </span>
        ) : (
          <span className="clients-muted">—</span>
        )}
        {error && (
          <span className="clients-inline-error" role="alert">
            {error}
          </span>
        )}
      </dd>
    </div>
  );
}
