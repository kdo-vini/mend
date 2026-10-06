import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { needsProject, textValue as text } from "../../model";
import type { DraftEditor } from "../../useFinanceEditor";
import { CheckboxField, TextField } from "../FinanceFields";

/**
 * Optional cost details (served project and allocation rule) stay folded
 * unless they already hold data or the source requires a project.
 */
export function CostDetails({ editor }: { editor: DraftEditor }) {
  const { t } = useTranslation("common");
  const id = useId();
  const { record } = editor.draft;
  const required = needsProject(record);
  const hasData = Boolean(text(record.project) || text(record.allocation));
  const [open, setOpen] = useState(hasData);
  const expanded = open || required;
  return (
    <div className="finance-disclosure">
      <button
        type="button"
        className="finance-disclosure-toggle"
        aria-expanded={expanded}
        aria-controls={id}
        disabled={required}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronDown size={14} aria-hidden="true" />
        {t("finance.form.costDetails")}
        <small>{t("finance.form.optional")}</small>
      </button>
      {expanded && (
        <div id={id} className="finance-form-grid">
          <TextField
            label={t("finance.fields.project")}
            value={text(record.project)}
            required={required}
            hint={
              required
                ? t("finance.form.projectRequired")
                : t("finance.form.projectHint")
            }
            onChange={(value) => editor.update("project", value)}
          />
          <TextField
            label={t("finance.fields.allocation")}
            value={text(record.allocation)}
            maxLength={500}
            hint={t("finance.form.allocationHint")}
            onChange={(value) => editor.update("allocation", value)}
          />
        </div>
      )}
    </div>
  );
}

/** Cancellation keeps the record and its audit trail; a reason is required. */
export function CancellationFields({ editor }: { editor: DraftEditor }) {
  const { t } = useTranslation("common");
  const { record } = editor.draft;
  const cancelled = Boolean(record.cancelled);
  return (
    <div className="finance-cancellation">
      <CheckboxField
        label={t("finance.fields.cancelled")}
        checked={cancelled}
        hint={t("finance.form.cancelHint")}
        onChange={(value) => editor.update("cancelled", value)}
      />
      {cancelled && (
        <TextField
          label={t("finance.fields.reason")}
          value={text(record.reason)}
          required
          maxLength={500}
          multiline
          onChange={(value) => editor.update("reason", value)}
        />
      )}
    </div>
  );
}
