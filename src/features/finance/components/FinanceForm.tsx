// i18n-exempt: dispatcher only; every routed form renders translated copy.
import type { DraftEditor } from "../useFinanceEditor";
import { CoverageReviewForm } from "./forms/CoverageReviewForm";
import { EntryForm } from "./forms/EntryForm";
import { EvidenceForm } from "./forms/EvidenceForm";
import { PaymentForm } from "./forms/PaymentForm";
import { RecurringExpenseForm } from "./forms/RecurringExpenseForm";

/** Routes the open draft to its domain-specific form. */
export function FinanceForm({ editor }: { editor: DraftEditor }) {
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
