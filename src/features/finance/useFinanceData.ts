import { useCallback, useEffect, useState } from "react";
import { LiveActionError } from "../../api/transport";
import {
  financeApi,
  type FinanceAttentionFilter,
  type FinanceEntity,
  type FinanceSummary,
} from "./api";
import {
  claimFinanceCache,
  clearFinanceCache,
  currentFinanceOwner,
  financeCache,
  type FinanceList,
} from "./financeCache";

export type { FinanceList };

export function isForbidden(error: unknown) {
  return (
    error instanceof LiveActionError &&
    (error.status === 401 ||
      error.status === 403 ||
      error.code === "finance_forbidden")
  );
}

const listKey = (
  entity: FinanceEntity,
  period: string,
  offset: number,
  attention?: FinanceAttentionFilter,
) => `${entity}|${period}|${offset}${attention ? `|${attention}` : ""}`;

/**
 * Loads finance data for a mounted page or dashboard block.
 *
 * - Access is checked once per mount against the server. Cached figures (see
 *   `financeCache.ts`) are only shown after that check succeeds for the same
 *   signed-in user, and every later request is still authorized server-side.
 * - Any denial or 403 wipes displayed and cached data immediately, so revoked
 *   access never leaves figures on screen.
 * - Already displayed data stays visible while a newer request is in flight;
 *   consumers compare `summary.period`/`list.key` with what they asked for to
 *   mark the content as refreshing instead of blanking it.
 */
export function useFinanceData({
  period,
  entity,
  offset,
  enabled = true,
  attention,
}: {
  period: string;
  entity: FinanceEntity | null;
  offset: number;
  enabled?: boolean;
  attention?: FinanceAttentionFilter;
}) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [summary, setSummary] = useState<{
    period: string;
    data: FinanceSummary;
  } | null>(null);
  const [list, setList] = useState<FinanceList | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);
  const [accessAttempt, setAccessAttempt] = useState(0);
  const [pending, setPending] = useState({ summary: false, list: false });

  const revoke = useCallback(() => {
    clearFinanceCache();
    setSummary(null);
    setList(null);
    setAllowed(false);
  }, []);

  const handleError = useCallback(
    (err: unknown) => {
      if (isForbidden(err)) revoke();
      else setError(err);
    },
    [revoke],
  );

  useEffect(() => {
    let active = true;
    setError(null);
    Promise.all([financeApi.access(), currentFinanceOwner()])
      .then(([access, owner]) => {
        if (!active) return;
        if (!access.allowed) return revoke();
        claimFinanceCache(owner);
        setAllowed(true);
      })
      .catch((err) => active && handleError(err));
    return () => {
      active = false;
    };
  }, [accessAttempt, handleError, revoke]);

  useEffect(() => {
    if (!allowed || !enabled) return;
    let active = true;
    const scope = financeCache.scope();
    const cached = financeCache.summary(period);
    if (cached) setSummary({ period, data: cached });
    setPending((current) => ({ ...current, summary: true }));
    financeApi
      .summary(period)
      .then((data) => {
        if (!active || !financeCache.isCurrent(scope)) return;
        financeCache.setSummary(period, data, scope);
        setSummary({ period, data });
        setError(null);
      })
      .catch(
        (err) => active && financeCache.isCurrent(scope) && handleError(err),
      )
      .finally(
        () =>
          active && setPending((current) => ({ ...current, summary: false })),
      );
    return () => {
      active = false;
    };
  }, [allowed, enabled, period, revision, handleError]);

  useEffect(() => {
    if (!allowed || !entity || !enabled) return;
    let active = true;
    const scope = financeCache.scope();
    const key = listKey(entity, period, offset, attention);
    const cached = financeCache.list(key);
    if (cached) setList(cached);
    setPending((current) => ({ ...current, list: true }));
    financeApi
      .list(entity, period, offset, attention)
      .then((response) => {
        if (!active || !financeCache.isCurrent(scope)) return;
        const next = { key, ...response };
        financeCache.setList(next, scope);
        setList(next);
        setError(null);
      })
      .catch(
        (err) => active && financeCache.isCurrent(scope) && handleError(err),
      )
      .finally(
        () => active && setPending((current) => ({ ...current, list: false })),
      );
    return () => {
      active = false;
    };
  }, [
    allowed,
    enabled,
    entity,
    period,
    offset,
    attention,
    revision,
    handleError,
  ]);

  /** Drops cached pages after a mutation and refetches what is on screen. */
  const invalidate = useCallback(() => {
    financeCache.invalidate();
    setRevision((value) => value + 1);
  }, []);

  const retry = useCallback(() => {
    setError(null);
    if (allowed) setRevision((value) => value + 1);
    else setAccessAttempt((value) => value + 1);
  }, [allowed]);

  return {
    allowed,
    summary,
    list,
    requestedListKey: entity
      ? listKey(entity, period, offset, attention)
      : null,
    pending,
    error,
    invalidate,
    retry,
    revoke,
  };
}
