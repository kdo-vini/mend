import { z } from "zod";

export const financePeriod = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/);
const amount = z.number().int().min(1).max(100_000_000_000).nullable();
const text = (max: number) => z.string().trim().min(1).max(max);
const common = { id: z.string().uuid() };
const cost = {
  description: text(200),
  category: text(100),
  source: text(200),
  amount_cents: amount,
  estimated: z.boolean(),
  project: z.string().trim().max(200),
  allocation: z.string().trim().max(500),
};
const cancellation = {
  cancelled: z.boolean(),
  reason: z.string().trim().max(500),
};
const entry = z
  .object({
    ...common,
    ...cost,
    ...cancellation,
    kind: z.enum(["income", "expense", "transfer"]),
    period: financePeriod,
  })
  .strict()
  .refine((v) => !v.cancelled || v.reason.length > 0);
const civilDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T12:00:00Z`);
    return (
      !Number.isNaN(parsed.valueOf()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  });
export const financeRecords = {
  entries: entry,
  settlements: z
    .object({
      ...common,
      ...cancellation,
      entry_id: z.string().uuid(),
      paid_on: civilDate,
      amount_cents: amount.unwrap(),
      source: text(200),
    })
    .strict()
    .refine((v) => !v.cancelled || v.reason.length > 0),
  templates: z
    .object({
      ...common,
      ...cost,
      starts_on: financePeriod,
      ends_on: financePeriod.nullable(),
      active: z.boolean(),
    })
    .strict()
    .refine((v) => v.ends_on === null || v.ends_on >= v.starts_on),
  references: z
    .object({
      ...common,
      entry_id: z.string().uuid(),
      settlement_id: z.string().uuid().nullable(),
      source: text(200),
      external_id: text(200).nullable(),
      note: z.string().trim().max(500),
    })
    .strict(),
  reviews: z
    .object({
      ...common,
      period: financePeriod,
      sources_complete: z.boolean(),
      expenses_complete: z.boolean(),
      taxes_complete: z.boolean(),
      note: z.string().trim().max(500),
    })
    .strict(),
};
export type FinanceEntity = keyof typeof financeRecords;
export type FinanceAttentionFilter = "unknown" | "estimated";
export interface FinancePort {
  allowed(workspaceId: string): Promise<boolean>;
  get(entity: FinanceEntity, id: string): Promise<unknown | null>;
  summary(period: string, project?: string): Promise<unknown>;
  list(
    entity: FinanceEntity,
    period?: string,
    offset?: number,
    attention?: FinanceAttentionFilter,
    project?: string,
  ): Promise<unknown[]>;
  save(
    entity: FinanceEntity,
    record: Record<string, unknown>,
    version: number | null,
  ): Promise<unknown>;
  generate(period: string): Promise<number>;
  history(id: string): Promise<unknown[]>;
}
