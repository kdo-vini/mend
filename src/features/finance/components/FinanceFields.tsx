import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

/** Known operation sources offered as suggestions; any value is accepted. */
const sourceSuggestions = ["Lucas Ops", "Hostinger", "Supabase"];

function Hint({ id, children }: { id: string; children?: ReactNode }) {
  return children ? (
    <small id={id} className="finance-field-hint">
      {children}
    </small>
  ) : null;
}

export function TextField({
  label,
  value,
  onChange,
  required,
  maxLength = 200,
  disabled,
  hint,
  suggestions,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  maxLength?: number;
  disabled?: boolean;
  hint?: ReactNode;
  suggestions?: "sources";
  multiline?: boolean;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const listId = `${id}-list`;
  const shared = {
    id,
    value,
    required,
    maxLength,
    disabled,
    "aria-describedby": hint ? hintId : undefined,
  };
  return (
    <div className="finance-field">
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea
          {...shared}
          rows={2}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          {...shared}
          type="text"
          list={suggestions ? listId : undefined}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {suggestions && (
        <datalist id={listId}>
          {sourceSuggestions.map((source) => (
            <option key={source} value={source} />
          ))}
        </datalist>
      )}
      <Hint id={hintId}>{hint}</Hint>
    </div>
  );
}

export function AmountField({
  label,
  value,
  onChange,
  required,
  disabled,
  hint,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  hint?: ReactNode;
  invalid?: boolean;
}) {
  const { t } = useTranslation("common");
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div className="finance-field">
      <label htmlFor={id}>{label}</label>
      <div className="finance-amount-input">
        <span aria-hidden="true">{t("finance.currencySymbol")}</span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder={t("finance.amountPlaceholder")}
          value={value}
          required={required}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={
            [hint ? hintId : "", invalid ? errorId : ""].join(" ").trim() ||
            undefined
          }
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      {invalid && (
        <small id={errorId} className="finance-field-error" role="alert">
          {t("finance.errors.amount")}
        </small>
      )}
      <Hint id={hintId}>{hint}</Hint>
    </div>
  );
}

export function MonthField({
  label,
  value,
  onChange,
  required,
  disabled,
  hint,
}: {
  label: string;
  value: string | null;
  onChange: (period: string | null) => void;
  required?: boolean;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="finance-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="month"
        value={String(value ?? "").slice(0, 7)}
        required={required}
        disabled={disabled}
        aria-describedby={hint ? hintId : undefined}
        onChange={(event) =>
          onChange(event.target.value ? `${event.target.value}-01` : null)
        }
      />
      <Hint id={hintId}>{hint}</Hint>
    </div>
  );
}

export function DateField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="finance-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="date"
        value={value}
        required
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function CheckboxField({
  label,
  checked,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="finance-check">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-describedby={hint ? hintId : undefined}
        onChange={(event) => onChange(event.target.checked)}
      />
      <div>
        <label htmlFor={id}>{label}</label>
        <Hint id={hintId}>{hint}</Hint>
      </div>
    </div>
  );
}
