import { supabase } from "../../lib/supabase";
import type { FinanceRecord, FinanceSummary } from "./api";

export interface FinanceList {
  key: string;
  data: FinanceRecord[];
  nextOffset: number | null;
}

/**
 * In-memory finance responses for the current browser session, so returning
 * to Finance or the dashboard paints the last figures instantly while they
 * revalidate. Safety rules:
 *
 * - Entries belong to one authenticated user; any auth change (sign-out,
 *   another account, token for another user) clears everything.
 * - Nothing is read from the cache until the mount's authoritative
 *   `/api/finance/access` check succeeds for that same user.
 * - Any denied access or 403 clears the cache (`clearFinanceCache`).
 * - Never persisted: memory only, gone on reload.
 */
const cache = {
  owner: null as string | null,
  generation: 0,
  summaries: new Map<string, FinanceSummary>(),
  lists: new Map<string, FinanceList>(),
};

export function clearFinanceCache() {
  cache.generation++;
  cache.owner = null;
  cache.summaries.clear();
  cache.lists.clear();
}

export interface FinanceCacheScope {
  owner: string | null;
  generation: number;
}
function isCurrent(scope: FinanceCacheScope) {
  return (
    scope.owner !== null &&
    scope.owner === cache.owner &&
    scope.generation === cache.generation
  );
}

supabase?.auth.onAuthStateChange((_event, session) => {
  if ((session?.user.id ?? null) !== cache.owner) clearFinanceCache();
});

/** Identity the cached data is scoped to (signed-in user or demo session). */
export async function currentFinanceOwner() {
  if (!supabase) return "anonymous";
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? "anonymous";
}

/** Called after a successful access check; drops another owner's data. */
export function claimFinanceCache(owner: string) {
  if (cache.owner !== owner) {
    clearFinanceCache();
    cache.owner = owner;
  }
}

export const financeCache = {
  scope: (): FinanceCacheScope => ({
    owner: cache.owner,
    generation: cache.generation,
  }),
  isCurrent,
  summary: (period: string) => cache.summaries.get(period),
  setSummary: (
    period: string,
    value: FinanceSummary,
    scope: FinanceCacheScope,
  ) => isCurrent(scope) && cache.summaries.set(period, value),
  list: (key: string) => cache.lists.get(key),
  setList: (value: FinanceList, scope: FinanceCacheScope) =>
    isCurrent(scope) && cache.lists.set(value.key, value),
  /** Drops every cached response after a mutation, keeping the owner. */
  invalidate: () => {
    cache.generation++;
    cache.summaries.clear();
    cache.lists.clear();
  },
};
