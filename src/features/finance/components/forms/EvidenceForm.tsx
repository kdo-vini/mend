import { useTranslation } from "react-i18next";
import { textValue as text } from "../../model";
import type { DraftEditor } from "../../useFinanceEditor";
import { FinanceEditorFrame } from "../FinanceEditorFrame";
import { TextField } from "../FinanceFields";

/**
 * Bank/gateway evidence for an existing entry or cash movement. Evidence never
 * changes totals; the entry/settlement association comes from the chosen row.
 */
export function EvidenceForm({ editor }: { editor: DraftEditor }) {
  const { t } = useTranslation("common");
  const { record, version } = editor.draft;
  return (
    <FinanceEditorFrame
      editor={editor}
      title={t(
        version === null
          ? record.settlement_id
            ? "finance.form.newEvidenceSettlement"
            : "finance.form.newEvidence"
          : "finance.form.editEvidence",
      )}
      submitLabel={t("finance.save")}
    >
      <p className="finance-inline-note">{t("finance.reconciliationHelp")}</p>
      <div className="finance-form-grid">
        <TextField
          label={t("finance.form.evidenceSource")}
          value={text(record.source)}
          required
          hint={t("finance.form.evidenceSourceHint")}
          onChange={(value) => editor.update("source", value)}
        />
        <TextField
          label={t("finance.fields.external_id")}
          value={text(record.external_id)}
          hint={t("finance.form.externalHint")}
          onChange={(value) => editor.update("external_id", value)}
        />
      </div>
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
