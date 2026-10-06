import { useTranslation } from "react-i18next";
import { textValue as text, type EntryKind } from "../../model";
import type { DraftEditor } from "../../useFinanceEditor";
import { FinanceEditorFrame } from "../FinanceEditorFrame";
import {
  AmountField,
  CheckboxField,
  MonthField,
  TextField,
} from "../FinanceFields";
import { CancellationFields, CostDetails } from "./shared";

const kinds: EntryKind[] = ["income", "expense", "transfer"];

/** Revenue, expense or internal transfer that belongs to an accrual month. */
export function EntryForm({ editor }: { editor: DraftEditor }) {
  const { t } = useTranslation("common");
  const { record, version } = editor.draft;
  const kind = (record.kind as EntryKind) ?? "expense";
  const editing = version !== null;
  return (
    <FinanceEditorFrame
      editor={editor}
      title={
        editing ? t("finance.form.editEntry") : t(`finance.form.new.${kind}`)
      }
      submitLabel={t("finance.save")}
    >
      <fieldset className="finance-segmented">
        <legend>{t("finance.fields.kind")}</legend>
        {kinds.map((option) => (
          <label key={option} data-selected={option === kind || undefined}>
            <input
              type="radio"
              name="finance-entry-kind"
              value={option}
              checked={option === kind}
              onChange={() => editor.update("kind", option)}
            />
            {t(`finance.kinds.${option}`)}
          </label>
        ))}
      </fieldset>
      {kind === "transfer" && (
        <p className="finance-inline-note">{t("finance.form.transferHint")}</p>
      )}
      <TextField
        label={t("finance.fields.description")}
        value={text(record.description)}
        required
        onChange={(value) => editor.update("description", value)}
      />
      <div className="finance-form-grid">
        <AmountField
          label={t("finance.fields.amount_cents")}
          value={editor.draft.amountText}
          hint={t("finance.form.amountUnknownHint")}
          invalid={editor.error === "amount"}
          onChange={editor.setAmountText}
        />
        <MonthField
          label={t("finance.fields.period")}
          value={text(record.period)}
          required
          hint={t("finance.form.periodHint")}
          onChange={(value) => editor.update("period", value ?? "")}
        />
      </div>
      <CheckboxField
        label={t("finance.fields.estimated")}
        checked={Boolean(record.estimated)}
        hint={t("finance.form.estimatedHint")}
        onChange={(value) => editor.update("estimated", value)}
      />
      <div className="finance-form-grid">
        <TextField
          label={t("finance.fields.category")}
          value={text(record.category)}
          required
          maxLength={100}
          onChange={(value) => editor.update("category", value)}
        />
        <TextField
          label={t("finance.fields.source")}
          value={text(record.source)}
          required
          suggestions="sources"
          onChange={(value) => editor.update("source", value)}
        />
      </div>
      <CostDetails editor={editor} />
      {editing && <CancellationFields editor={editor} />}
    </FinanceEditorFrame>
  );
}
