import { apiRequest } from "../../api/transport";

export type FinanceEntity =
  | "entries"
  | "settlements"
  | "templates"
  | "references"
  | "reviews";
export type FinanceAttentionFilter = "unknown" | "estimated";
export interface FinanceRecord {
  id: string;
  version: number;
  [field: string]: string | number | boolean | null;
}
export interface FinanceSummary {
  income: number;
  expenses: number;
  received: number;
  paid: number;
  estimated_count: number;
  unknown_count: number;
  reference_pending: number;
  review: FinanceRecord | null;
}
export type ZeloProviderState =
  | "ok"
  | "not_configured"
  | "unavailable"
  | "partial";
export interface ZeloPayment {
  id: string;
  externalId: string;
  provider: "abacatepay" | "stripe";
  currency: string;
  status:
    | "paid"
    | "pending"
    | "failed"
    | "expired"
    | "cancelled"
    | "uncollectible";
  createdAt: string;
  paidAt: string | null;
  billedCents: number;
  receivedCents: number | null;
}
export interface ZeloFinanceFeed {
  period: string;
  checkedAt: string;
  providers: { abacatepay: ZeloProviderState; stripe: ZeloProviderState };
  rows: ZeloPayment[];
  totals: Array<{
    currency: string;
    billedCents: number;
    receivedCents: number;
    pendingCents: number;
  }>;
}
export const financeApi = {
  zelo: (period: string) =>
    apiRequest<ZeloFinanceFeed>(`/api/finance/zelo?period=${period}`),
  access: () => apiRequest<{ allowed: boolean }>("/api/finance/access"),
  get: (entity: FinanceEntity, id: string) =>
    apiRequest<FinanceRecord>(`/api/finance/${entity}/${id}`),
  summary: (period: string) =>
    apiRequest<FinanceSummary>(`/api/finance/summary?period=${period}`),
  list: (
    entity: FinanceEntity,
    period: string,
    offset: number,
    attention?: FinanceAttentionFilter,
  ) =>
    apiRequest<{ data: FinanceRecord[]; nextOffset: number | null }>(
      `/api/finance/${entity}?period=${period}&offset=${offset}${attention ? `&attention=${attention}` : ""}`,
    ),
  save: (
    entity: FinanceEntity,
    record: Omit<FinanceRecord, "version">,
    version: number | null,
  ) =>
    apiRequest<FinanceRecord>(`/api/finance/${entity}`, {
      method: "POST",
      body: JSON.stringify({ record, version }),
    }),
  generate: (period: string) =>
    apiRequest<{ generated: number }>("/api/finance/generate", {
      method: "POST",
      body: JSON.stringify({ period }),
    }),
  history: (id: string) =>
    apiRequest<{
      data: Array<{
        id: number;
        actor_id: string;
        happened_at: string;
        before_record: Record<string, unknown> | null;
        after_record: Record<string, unknown>;
      }>;
    }>(`/api/finance/history/${id}`),
};
