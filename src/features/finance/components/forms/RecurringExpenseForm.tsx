import { useTranslation } from "react-i18next";
import { textValue as text } from "../../model";
import type { DraftEditor } from "../../useFinanceEditor";
import { FinanceEditorFrame } from "../FinanceEditorFrame";
import {
  AmountField,
  CheckboxField,
  MonthField,
  TextField,
} from "../FinanceFields";
import { CostDetails } from "./shared";

/** Template used by the manual "generate this month's expenses" action. */
export function RecurringExpenseForm({ editor }: { editor: DraftEditor }) {
  const { t } = useTranslation("common");
  const { record, version } = editor.draft;
  return (
    <FinanceEditorFrame
      editor={editor}
      title={t(
        version === null
          ? "finance.form.newTemplate"
          : "finance.form.editTemplate",
      )}
      submitLabel={t("finance.save")}
    >
      <p className="finance-inline-note">{t("finance.form.templateHint")}</p>
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
        <CheckboxField
          label={t("finance.fields.estimated")}
          checked={Boolean(record.estimated)}
          hint={t("finance.form.estimatedHint")}
          onChange={(value) => editor.update("estimated", value)}
        />
      </div>
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
      <div className="finance-form-grid">
        <MonthField
          label={t("finance.fields.starts_on")}
          value={text(record.starts_on)}
          required
          onChange={(value) => editor.update("starts_on", value ?? "")}
        />
        <MonthField
          label={t("finance.fields.ends_on")}
          value={text(record.ends_on)}
          hint={t("finance.form.endsHint")}
          onChange={(value) => editor.update("ends_on", value)}
        />
      </div>
      <CheckboxField
        label={t("finance.fields.active")}
        checked={Boolean(record.active)}
        hint={t("finance.form.activeHint")}
        onChange={(value) => editor.update("active", value)}
      />
      <CostDetails editor={editor} />
    </FinanceEditorFrame>
  );
}
