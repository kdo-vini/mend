import { useCallback, useEffect, useState } from "react";
import { financeApi, type ZeloFinanceFeed } from "./api";
import { financeCache } from "./financeCache";
import { isForbidden } from "./useFinanceData";

// Coalesce mount/StrictMode reads within the same authorized cache generation.
const requests = new Map<string, Promise<ZeloFinanceFeed>>();
function loadZelo(period: string) {
  const scope = financeCache.scope();
  const key = `${scope.owner}|${scope.generation}|${period}`;
  let request = requests.get(key);
  if (!request) {
    request = financeApi.zelo(period).finally(() => requests.delete(key));
    requests.set(key, request);
  }
  return request;
}

/**
 * Read-only Zelo provider feed for one month.
 *
 * Mount only after `useFinanceData` confirmed access: that check claims the
 * finance cache for the signed-in user, so the cached snapshot read here is
 * already scoped. Responses are dropped when the cache scope moved on (revoke,
 * account change, invalidation), so a late answer never repopulates it.
 * The last snapshot stays visible while a newer request is in flight; callers
 * compare `feed.period` with the requested period to label it honestly.
 */
export function useZeloFinance({
  period,
  onForbidden,
}: {
  period: string;
  onForbidden: () => void;
}) {
  const [feed, setFeed] = useState<{
    period: string;
    data: ZeloFinanceFeed;
  } | null>(null);
  const [failedPeriod, setFailedPeriod] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    const scope = financeCache.scope();
    const cached = financeCache.zelo(period);
    if (cached) setFeed({ period, data: cached });
    setFailedPeriod(null);
    setPending(true);
    loadZelo(period)
      .then((data) => {
        if (!active) return;
        if (!financeCache.isCurrent(scope)) {
          // Same user, cache invalidated by a mutation: ask again instead of
          // caching an answer from the previous generation.
          // Another (or no) owner now: drop what this user saw.
          const now = financeCache.scope();
          if (now.owner !== null && now.owner === scope.owner)
            setRevision((value) => value + 1);
          else setFeed(null);
          return;
        }
        financeCache.setZelo(period, data, scope);
        setFeed({ period, data });
      })
      .catch((err) => {
        if (!active || !financeCache.isCurrent(scope)) return;
        if (isForbidden(err)) onForbidden();
        else setFailedPeriod(period);
      })
      .finally(() => active && setPending(false));
    return () => {
      active = false;
    };
    // `onForbidden` must be stable (the parent's `revoke`), so a re-render or
    // language switch never triggers another request.
  }, [period, revision, onForbidden]);

  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  return {
    feed,
    pending,
    failed: failedPeriod === period,
    refresh,
  };
}
