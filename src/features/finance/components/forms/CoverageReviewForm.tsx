import { useTranslation } from "react-i18next";
import { textValue as text } from "../../model";
import type { DraftEditor } from "../../useFinanceEditor";
import { useFinanceFormat } from "../../format";
import { FinanceEditorFrame } from "../FinanceEditorFrame";
import { CheckboxField, TextField } from "../FinanceFields";

const checks = ["sources_complete", "expenses_complete", "taxes_complete"];

/** Operator confirmation that the month's sources, costs and taxes are in. */
export function CoverageReviewForm({ editor }: { editor: DraftEditor }) {
  const { t } = useTranslation("common");
  const format = useFinanceFormat();
  const { record } = editor.draft;
  return (
    <FinanceEditorFrame
      editor={editor}
      title={t("finance.form.review", {
        month: format.month(text(record.period)),
      })}
      submitLabel={t("finance.form.saveReview")}
    >
      <p className="finance-inline-note">{t("finance.form.reviewHint")}</p>
      {checks.map((field) => (
        <CheckboxField
          key={field}
          label={t(`finance.fields.${field}`)}
          checked={Boolean(record[field])}
          hint={t(`finance.form.${field}Hint`)}
          onChange={(value) => editor.update(field, value)}
        />
      ))}
      <TextField
        label={t("finance.fields.note")}
        value={text(record.note)}
        maxLength={500}
        multiline
        onChange={(value) => editor.update("note", value)}
      />
    </FinanceEditorFrame>
  );
}
