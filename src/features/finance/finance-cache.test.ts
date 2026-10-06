import { beforeEach, describe, expect, it } from "vitest";
import type { FinanceSummary } from "./api";
import {
  claimFinanceCache,
  clearFinanceCache,
  financeCache,
} from "./financeCache";

const summary: FinanceSummary = {
  income: 100,
  expenses: 0,
  received: 0,
  paid: 0,
  estimated_count: 0,
  unknown_count: 0,
  reference_pending: 0,
  review: null,
};

describe("finance session cache", () => {
  beforeEach(clearFinanceCache);

  it("stores nothing before an access check claims it", () => {
    financeCache.setSummary("2026-10-01", summary, financeCache.scope());
    expect(financeCache.summary("2026-10-01")).toBeUndefined();
  });

  it("keeps data for the same user and drops it for another account", () => {
    claimFinanceCache("user-a");
    financeCache.setSummary("2026-10-01", summary, financeCache.scope());
    claimFinanceCache("user-a");
    expect(financeCache.summary("2026-10-01")).toEqual(summary);
    claimFinanceCache("user-b");
    expect(financeCache.summary("2026-10-01")).toBeUndefined();
  });

  it("forgets everything on revocation and late responses are ignored", () => {
    claimFinanceCache("user-a");
    const requestScope = financeCache.scope();
    financeCache.setList(
      {
        key: "entries|2026-10-01|0",
        data: [],
        nextOffset: null,
      },
      requestScope,
    );
    clearFinanceCache();
    expect(financeCache.list("entries|2026-10-01|0")).toBeUndefined();
    financeCache.setSummary("2026-10-01", summary, requestScope);
    expect(financeCache.summary("2026-10-01")).toBeUndefined();
  });

  it("rejects a response started before revocation even after another user claims the cache", () => {
    claimFinanceCache("user-a");
    const requestScope = financeCache.scope();
    clearFinanceCache();
    claimFinanceCache("user-b");
    financeCache.setSummary("2026-10-01", summary, requestScope);
    expect(financeCache.summary("2026-10-01")).toBeUndefined();
  });

  it("rejects pre-revocation responses after the same account regains access", () => {
    claimFinanceCache("user-a");
    const requestScope = financeCache.scope();
    clearFinanceCache();
    claimFinanceCache("user-a");
    financeCache.setSummary("2026-10-01", summary, requestScope);
    expect(financeCache.summary("2026-10-01")).toBeUndefined();
  });

  it("does not let pre-mutation responses overwrite the refreshed cache", () => {
    claimFinanceCache("user-a");
    const requestScope = financeCache.scope();
    financeCache.invalidate();
    const updated = { ...summary, income: 200 };
    financeCache.setSummary("2026-10-01", updated, financeCache.scope());
    financeCache.setSummary("2026-10-01", summary, requestScope);
    expect(financeCache.summary("2026-10-01")).toEqual(updated);
  });
});
