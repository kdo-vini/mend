import { describe, it, expect } from "vitest";
import { financeRecords } from "./finance-service.js";
const entry = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "expense",
  description: "Infrastructure",
  period: "2026-10-01",
  amount_cents: 9900,
  category: "Hosting",
  source: "Hostinger",
  estimated: false,
  project: "",
  allocation: "",
  cancelled: false,
  reason: "",
};
describe("financial input boundary", () => {
  it("requires whole cents and first-of-month accrual periods", () => {
    expect(financeRecords.entries.safeParse(entry).success).toBe(true);
    expect(
      financeRecords.entries.safeParse({ ...entry, amount_cents: 1.99 })
        .success,
    ).toBe(false);
    expect(
      financeRecords.entries.safeParse({ ...entry, period: "2026-10-15" })
        .success,
    ).toBe(false);
    expect(
      financeRecords.entries.safeParse({ ...entry, amount_cents: null })
        .success,
    ).toBe(true);
    expect(
      financeRecords.entries.safeParse({ ...entry, amount_cents: 0 }).success,
    ).toBe(false);
  });
  it("keeps the project optional for Supabase and requires a cancellation reason", () => {
    expect(
      financeRecords.entries.safeParse({ ...entry, source: "Supabase" })
        .success,
    ).toBe(true);
    expect(
      financeRecords.entries.safeParse({ ...entry, cancelled: true }).success,
    ).toBe(false);
    expect(
      financeRecords.entries.safeParse({
        ...entry,
        source: "Supabase",
        project: "Mend",
        cancelled: true,
        reason: "Duplicate",
      }).success,
    ).toBe(true);
  });
  it("rejects forged authors, versions and workspace selection", () => {
    for (const field of [
      "actor_id",
      "workspace_id",
      "version",
      "template_id",
    ]) {
      expect(
        financeRecords.entries.safeParse({ ...entry, [field]: entry.id })
          .success,
      ).toBe(false);
    }
  });
  it("validates real civil dates for cash movements", () => {
    const settlement = {
      id: entry.id,
      entry_id: entry.id,
      amount_cents: 1,
      source: "Bank",
      paid_on: "2026-02-28",
      cancelled: false,
      reason: "",
    };
    expect(financeRecords.settlements.safeParse(settlement).success).toBe(true);
    expect(
      financeRecords.settlements.safeParse({
        ...settlement,
        paid_on: "2026-02-30",
      }).success,
    ).toBe(false);
    expect(
      financeRecords.settlements.safeParse({
        ...settlement,
        amount_cents: null,
      }).success,
    ).toBe(false);
  });
});
