import { apiRequest } from "../../api/transport";

export type FinanceEntity =
  | "entries"
  | "settlements"
  | "templates"
  | "references"
  | "reviews";
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
export const financeApi = {
  access: () => apiRequest<{ allowed: boolean }>("/api/finance/access"),
  summary: (period: string) =>
    apiRequest<FinanceSummary>(`/api/finance/summary?period=${period}`),
  list: (entity: FinanceEntity, period: string, offset: number) =>
    apiRequest<{ data: FinanceRecord[]; nextOffset: number | null }>(
      `/api/finance/${entity}?period=${period}&offset=${offset}`,
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
