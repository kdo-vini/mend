import { useTranslation } from "react-i18next";
import { textValue as text } from "../../model";
import type { DraftEditor } from "../../useFinanceEditor";
import { FinanceEditorFrame } from "../FinanceEditorFrame";
import { AmountField, DateField, TextField } from "../FinanceFields";
import { CancellationFields } from "./shared";

/**
 * Cash movement for the entry chosen in the ledger. The entry association is
 * carried by the draft and never edited here.
 */
export function PaymentForm({ editor }: { editor: DraftEditor }) {
  const { t } = useTranslation("common");
  const { record, version, context } = editor.draft;
  const editing = version !== null;
  const direction =
    context?.kind === "income"
      ? "income"
      : context?.kind === "transfer"
        ? "transfer"
        : "expense";
  return (
    <FinanceEditorFrame
      editor={editor}
      title={
        editing
          ? t("finance.form.editSettlement")
          : t(`finance.form.settle.${direction}`)
      }
      submitLabel={t("finance.save")}
    >
      <div className="finance-form-grid">
        <DateField
          label={t("finance.fields.paid_on")}
          value={text(record.paid_on)}
          onChange={(value) => editor.update("paid_on", value)}
        />
        <AmountField
          label={t("finance.form.paidAmount")}
          value={editor.draft.amountText}
          required
          hint={t("finance.form.partialHint")}
          invalid={editor.error === "amount"}
          onChange={editor.setAmountText}
        />
      </div>
      <TextField
        label={t("finance.form.paymentSource")}
        value={text(record.source)}
        required
        hint={t("finance.form.paymentSourceHint")}
        onChange={(value) => editor.update("source", value)}
      />
      {editing && <CancellationFields editor={editor} />}
    </FinanceEditorFrame>
  );
}
