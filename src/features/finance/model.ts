import { parseFinanceAmount } from "./amount";
import type { FinanceEntity, FinanceRecord, FinanceSummary } from "./api";

/**
 * Pure finance UI model: draft construction, serialization to the existing
 * `/api/finance/:entity` record shapes and conflict merging. Field lists mirror
 * the strict server schemas in `server/finance-service.ts`; the API rejects
 * unknown keys, so every draft is built from these lists only.
 */
export type FinanceValue = string | number | boolean | null;
export type FinanceFields = Record<string, FinanceValue>;

export const financeFields: Record<FinanceEntity, readonly string[]> = {
  entries: [
    "kind",
    "description",
    "period",
    "amount_cents",
    "category",
    "source",
    "estimated",
    "project",
    "allocation",
    "cancelled",
    "reason",
  ],
  settlements: [
    "entry_id",
    "paid_on",
    "amount_cents",
    "source",
    "cancelled",
    "reason",
  ],
  templates: [
    "description",
    "category",
    "source",
    "amount_cents",
    "estimated",
    "project",
    "allocation",
    "starts_on",
    "ends_on",
    "active",
  ],
  references: ["entry_id", "settlement_id", "source", "external_id", "note"],
  reviews: [
    "period",
    "sources_complete",
    "expenses_complete",
    "taxes_complete",
    "note",
  ],
};

/** Association fields are preserved in drafts but never rendered as inputs. */
export const associationFields = new Set(["entry_id", "settlement_id"]);
const nullableWhenEmpty = ["ends_on", "settlement_id", "external_id"];

export type EntryKind = "income" | "expense" | "transfer";
export type LedgerView = Exclude<FinanceEntity, "reviews">;
export const ledgerViews: readonly LedgerView[] = [
  "entries",
  "settlements",
  "templates",
  "references",
];
export const FINANCE_PAGE_SIZE = 50;

/** Context shown above payment/evidence forms instead of raw identifiers. */
export interface FinanceContext {
  description: string;
  kind?: EntryKind;
  period?: string;
  amountCents?: number | null;
  paidOn?: string;
}

export interface FinanceDraft {
  entity: FinanceEntity;
  record: FinanceFields;
  baseline: FinanceFields;
  version: number | null;
  amountText: string;
  context?: FinanceContext;
}

const saoPauloDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function todayCivil(now = new Date()) {
  return saoPauloDate.format(now);
}

export function currentMonth(now = new Date()) {
  return todayCivil(now).slice(0, 7);
}

/** `YYYY-MM` shifted by whole months, without timezone drift. */
export function shiftMonth(month: string, delta: number) {
  const [year, value] = month.split("-").map(Number);
  const index = year * 12 + (value - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export function monthPeriod(month: string) {
  return `${month}-01`;
}

export const textValue = (value: unknown) =>
  typeof value === "string" ? value : "";

export function amountToText(cents: FinanceValue | undefined) {
  return typeof cents === "number" ? (cents / 100).toFixed(2) : "";
}

function pick(entity: FinanceEntity, source: Record<string, unknown>) {
  return Object.fromEntries(
    ["id", ...financeFields[entity]].map((field) => {
      const value = source[field];
      return [
        field,
        value === undefined ? "" : (value as FinanceValue | undefined),
      ];
    }),
  ) as FinanceFields;
}

function draftFrom(
  entity: FinanceEntity,
  record: FinanceFields,
  version: number | null,
  context?: FinanceContext,
): FinanceDraft {
  return {
    entity,
    record,
    baseline: { ...record },
    version,
    amountText: amountToText(record.amount_cents),
    context,
  };
}

export function newEntryDraft(
  kind: EntryKind,
  period: string,
  id = crypto.randomUUID(),
) {
  return draftFrom(
    "entries",
    pick("entries", {
      id,
      kind,
      period,
      amount_cents: null,
      estimated: false,
      cancelled: false,
    }),
    null,
  );
}

export function newTemplateDraft(period: string, id = crypto.randomUUID()) {
  return draftFrom(
    "templates",
    pick("templates", {
      id,
      amount_cents: null,
      estimated: false,
      starts_on: period,
      ends_on: null,
      active: true,
    }),
    null,
  );
}

export function entryContext(row: FinanceRecord): FinanceContext {
  return {
    description: String(row.description ?? ""),
    kind: row.kind as EntryKind,
    period: typeof row.period === "string" ? row.period : undefined,
    amountCents: typeof row.amount_cents === "number" ? row.amount_cents : null,
  };
}

/**
 * A payment always starts from the chosen accrual entry. The amount starts at
 * the entry value so the common full payment is one click, and stays editable
 * for partial payments; the effective date is explicit and defaults to today.
 */
export function newSettlementDraft(
  entry: FinanceRecord,
  today = todayCivil(),
  id = crypto.randomUUID(),
) {
  return draftFrom(
    "settlements",
    pick("settlements", {
      id,
      entry_id: entry.id,
      paid_on: today,
      amount_cents:
        typeof entry.amount_cents === "number" ? entry.amount_cents : null,
      cancelled: false,
    }),
    null,
    entryContext(entry),
  );
}

/** Evidence attaches to an entry, or to a settlement and its entry. */
export function newReferenceDraft(
  from: { entity: "entries" | "settlements"; row: FinanceRecord },
  id = crypto.randomUUID(),
) {
  const { entity, row } = from;
  return draftFrom(
    "references",
    pick("references", {
      id,
      entry_id: entity === "entries" ? row.id : row.entry_id,
      settlement_id: entity === "settlements" ? row.id : null,
      external_id: null,
    }),
    null,
    entity === "entries"
      ? entryContext(row)
      : {
          description: String(row.description ?? ""),
          amountCents:
            typeof row.amount_cents === "number" ? row.amount_cents : null,
          paidOn: typeof row.paid_on === "string" ? row.paid_on : undefined,
        },
  );
}

export function reviewDraft(
  period: string,
  existing: FinanceRecord | null | undefined,
  id = crypto.randomUUID(),
) {
  if (existing) return editDraft("reviews", existing);
  return draftFrom(
    "reviews",
    pick("reviews", {
      id,
      period,
      sources_complete: false,
      expenses_complete: false,
      taxes_complete: false,
    }),
    null,
  );
}

export function editDraft(entity: FinanceEntity, row: FinanceRecord) {
  const context: FinanceContext | undefined =
    entity === "settlements"
      ? {
          description: String(row.description ?? ""),
          amountCents:
            typeof row.amount_cents === "number" ? row.amount_cents : null,
          paidOn: typeof row.paid_on === "string" ? row.paid_on : undefined,
        }
      : entity === "references"
        ? { description: String(row.description ?? "") }
        : undefined;
  return draftFrom(entity, pick(entity, row), row.version ?? null, context);
}

/** Serializes a draft to the exact record shape accepted by the API. */
export function draftToRecord(draft: FinanceDraft) {
  const record: FinanceFields = { ...draft.record };
  if ("amount_cents" in record)
    record.amount_cents = parseFinanceAmount(draft.amountText);
  for (const field of nullableWhenEmpty)
    if (field in record && record[field] === "") record[field] = null;
  for (const field of ["description", "category", "source", "reason"])
    if (typeof record[field] === "string")
      record[field] = (record[field] as string).trim();
  return record as FinanceFields & { id: string };
}

/** Whether the optional cost details need to be visible for this draft. */
export function needsProject(record: FinanceFields) {
  return String(record.source ?? "")
    .toLowerCase()
    .includes("supabase");
}

function parseOrUndefined(text: string) {
  try {
    return parseFinanceAmount(text);
  } catch {
    return undefined;
  }
}

/**
 * Conflict recovery: fields the operator did not touch adopt the latest saved
 * value; touched fields keep the draft. Every field changed by someone else is
 * returned so the form can show it next to the preserved draft.
 */
export function mergeLatest(draft: FinanceDraft, latest: FinanceRecord) {
  const record = { ...draft.record };
  const changes: FinanceFields = {};
  let amountText = draft.amountText;
  for (const field of financeFields[draft.entity]) {
    // An unparsable amount counts as an edit, so the typed text is kept.
    const local =
      field === "amount_cents"
        ? parseOrUndefined(draft.amountText)
        : record[field];
    const baseline = draft.baseline[field];
    const next = latest[field] === undefined ? "" : latest[field];
    if (next !== baseline) changes[field] = next;
    if (local === baseline) {
      record[field] = next;
      if (field === "amount_cents") amountText = amountToText(next);
    }
  }
  return {
    draft: {
      ...draft,
      record,
      amountText,
      baseline: pick(draft.entity, latest),
      version: latest.version,
    } satisfies FinanceDraft,
    changes,
  };
}

export type CoverageGap = "estimated" | "unknown" | "references" | "review";

/** Coverage is complete only when reviewed and nothing is pending. */
export function coverageGaps(summary: FinanceSummary): CoverageGap[] {
  const review = summary.review;
  const gaps: CoverageGap[] = [];
  if (
    !review?.sources_complete ||
    !review?.expenses_complete ||
    !review?.taxes_complete
  )
    gaps.push("review");
  if (summary.estimated_count) gaps.push("estimated");
  if (summary.unknown_count) gaps.push("unknown");
  if (summary.reference_pending) gaps.push("references");
  return gaps;
}

export function matchesFilter(row: FinanceRecord, query: string) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [
    row.description,
    row.category,
    row.source,
    row.project,
    row.external_id,
    row.note,
  ].some((value) =>
    typeof value === "string"
      ? value.toLocaleLowerCase().includes(needle)
      : false,
  );
}
