import { describe, expect, it } from "vitest";
import type { FinanceRecord, FinanceSummary } from "./api";
import {
  coverageGaps,
  draftToRecord,
  editDraft,
  financeFields,
  matchesFilter,
  mergeLatest,
  newEntryDraft,
  newReferenceDraft,
  newSettlementDraft,
  newTemplateDraft,
  reviewDraft,
  shiftMonth,
} from "./model";

const entryId = "11111111-1111-4111-8111-111111111111";
const entry: FinanceRecord = {
  id: entryId,
  version: 3,
  kind: "expense",
  description: "Hostinger Diagium",
  period: "2026-10-01",
  amount_cents: 1990,
  category: "Infra",
  source: "Hostinger",
  estimated: false,
  project: "",
  allocation: "",
  cancelled: false,
  reason: "",
  workspace_id: "should-not-be-sent",
};

const keys = (record: object) => Object.keys(record).sort();

describe("finance drafts match the strict API record shapes", () => {
  it("serializes every entity with exactly id + its schema fields", () => {
    const drafts = [
      newEntryDraft("income", "2026-10-01"),
      newTemplateDraft("2026-10-01"),
      newSettlementDraft(entry, "2026-10-05"),
      newReferenceDraft({ entity: "entries", row: entry }),
      reviewDraft("2026-10-01", null),
      editDraft("entries", entry),
    ];
    for (const draft of drafts) {
      const record = draftToRecord({
        ...draft,
        amountText: "amount_cents" in draft.record ? "10" : "",
      });
      expect(keys(record)).toEqual(
        ["id", ...financeFields[draft.entity]].sort(),
      );
    }
  });

  it("keeps BRL cent precision and empty-as-unknown amounts", () => {
    const draft = newEntryDraft("expense", "2026-10-01");
    expect(draftToRecord({ ...draft, amountText: "19,90" }).amount_cents).toBe(
      1990,
    );
    expect(draftToRecord({ ...draft, amountText: "" }).amount_cents).toBeNull();
    expect(() => draftToRecord({ ...draft, amountText: "19,999" })).toThrow(
      "invalid_amount",
    );
  });

  it("starts payments from the entry with its amount, explicit date and hidden association", () => {
    const draft = newSettlementDraft(entry, "2026-10-05");
    expect(draft.record).toMatchObject({
      entry_id: entryId,
      paid_on: "2026-10-05",
      amount_cents: 1990,
      cancelled: false,
    });
    expect(draft.amountText).toBe("19.90");
    expect(draft.version).toBeNull();
    expect(draft.context).toMatchObject({
      description: "Hostinger Diagium",
      kind: "expense",
    });
  });

  it("links evidence to the settlement and its entry, or the entry alone", () => {
    const settlement: FinanceRecord = {
      id: "22222222-2222-4222-8222-222222222222",
      version: 1,
      entry_id: entryId,
      paid_on: "2026-10-05",
      amount_cents: 1000,
      description: "Hostinger Diagium",
    };
    expect(
      draftToRecord(
        newReferenceDraft({ entity: "settlements", row: settlement }),
      ),
    ).toMatchObject({ entry_id: entryId, settlement_id: settlement.id });
    expect(
      draftToRecord(newReferenceDraft({ entity: "entries", row: entry })),
    ).toMatchObject({
      entry_id: entryId,
      settlement_id: null,
      external_id: null,
    });
  });

  it("creates recurring expenses active from the month without an end", () => {
    expect(draftToRecord(newTemplateDraft("2026-10-01"))).toMatchObject({
      starts_on: "2026-10-01",
      ends_on: null,
      active: true,
    });
  });

  it("edits a coverage review with its current version", () => {
    const review = {
      id: "33333333-3333-4333-8333-333333333333",
      version: 2,
      period: "2026-10-01",
      sources_complete: true,
      expenses_complete: false,
      taxes_complete: false,
      note: "",
    };
    expect(reviewDraft("2026-10-01", review).version).toBe(2);
  });
});

describe("conflict recovery", () => {
  it("keeps the operator's edits, adopts untouched fields and reports remote changes", () => {
    const draft = editDraft("entries", entry);
    const edited = { ...draft, amountText: "25.99" };
    const latest = {
      ...entry,
      version: 4,
      description: "Hostinger updated",
      amount_cents: 3000,
    };
    const { draft: merged, changes } = mergeLatest(edited, latest);
    expect(merged.amountText).toBe("25.99");
    expect(merged.record.description).toBe("Hostinger updated");
    expect(merged.version).toBe(4);
    expect(changes).toEqual({
      description: "Hostinger updated",
      amount_cents: 3000,
    });
    expect(draftToRecord(merged)).toMatchObject({
      amount_cents: 2599,
      description: "Hostinger updated",
    });
  });

  it("treats an unparsable amount as an edit to keep", () => {
    const draft = { ...editDraft("entries", entry), amountText: "abc" };
    const { draft: merged } = mergeLatest(draft, {
      ...entry,
      version: 4,
      amount_cents: 3000,
    });
    expect(merged.amountText).toBe("abc");
  });

  it("keeps a cancellation draft while adopting other remote edits", () => {
    const draft = editDraft("entries", entry);
    draft.record.cancelled = true;
    draft.record.reason = "Duplicate accrual";
    const { draft: merged } = mergeLatest(draft, {
      ...entry,
      version: 4,
      category: "Hosting",
    });
    expect(merged.record).toMatchObject({
      cancelled: true,
      reason: "Duplicate accrual",
      category: "Hosting",
    });
  });
});

describe("month navigation, coverage and filtering", () => {
  it("shifts months across year boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-10", 0)).toBe("2026-10");
  });

  it("is complete only when reviewed with nothing pending", () => {
    const base: FinanceSummary = {
      income: 0,
      expenses: 0,
      received: 0,
      paid: 0,
      estimated_count: 0,
      unknown_count: 0,
      reference_pending: 0,
      review: null,
    };
    expect(coverageGaps(base)).toEqual(["review"]);
    const review = {
      id: "r",
      version: 1,
      sources_complete: true,
      expenses_complete: true,
      taxes_complete: true,
    };
    expect(coverageGaps({ ...base, review })).toEqual([]);
    expect(
      coverageGaps({
        ...base,
        review,
        estimated_count: 1,
        unknown_count: 2,
        reference_pending: 3,
      }),
    ).toEqual(["estimated", "unknown", "references"]);
  });

  it("filters the loaded page by human fields", () => {
    expect(matchesFilter(entry, "hostinger")).toBe(true);
    expect(matchesFilter(entry, "infra")).toBe(true);
    expect(matchesFilter(entry, "supabase")).toBe(false);
    expect(matchesFilter(entry, "  ")).toBe(true);
  });
});
