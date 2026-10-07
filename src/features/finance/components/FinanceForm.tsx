// i18n-exempt: dispatcher only; every routed form renders translated copy.
import type { DraftEditor } from "../useFinanceEditor";
import { CoverageReviewForm } from "./forms/CoverageReviewForm";
import { EntryForm } from "./forms/EntryForm";
import { EvidenceForm } from "./forms/EvidenceForm";
import { PaymentForm } from "./forms/PaymentForm";
import { RecurringExpenseForm } from "./forms/RecurringExpenseForm";
import { useTranslation } from "react-i18next";
import { FinanceEditorFrame } from "./FinanceEditorFrame";
import { TextField } from "./FinanceFields";

/** Routes the open draft to its domain-specific form. */
export function FinanceForm({
  editor,
  removing = false,
}: {
  editor: DraftEditor;
  removing?: boolean;
}) {
  const { t } = useTranslation("common");
  if (removing)
    return (
      <FinanceEditorFrame
        editor={editor}
        title={t("finance.removeTitle")}
        submitLabel={t("finance.removeConfirm")}
      >
        <p>{t("finance.removeHint")}</p>
        <strong>{String(editor.draft.record.description ?? "")}</strong>
        <TextField
          label={t("finance.fields.reason")}
          value={String(editor.draft.record.reason ?? "")}
          required
          maxLength={500}
          multiline
          onChange={(value) => editor.update("reason", value)}
        />
      </FinanceEditorFrame>
    );
  switch (editor.draft.entity) {
    case "entries":
      return <EntryForm editor={editor} />;
    case "templates":
      return <RecurringExpenseForm editor={editor} />;
    case "settlements":
      return <PaymentForm editor={editor} />;
    case "references":
      return <EvidenceForm editor={editor} />;
    case "reviews":
      return <CoverageReviewForm editor={editor} />;
  }
}
