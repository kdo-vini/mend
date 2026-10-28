import { useEffect, useState } from "react";
import type { ZeloCustomer } from "../../../types";
import { loadLiveZeloCustomer } from "../api";

/** Plan and health change slowly; a revisit within this window reuses the read. */
const CACHE_MS = 2 * 60 * 1000;
const cache = new Map<string, { at: number; customers: ZeloCustomer[] }>();

export type ZeloCustomerState =
  | { status: "loading" }
  | { status: "ready"; customers: ZeloCustomer[] }
  | { status: "error" };

/** The Zelo store(s) behind the open thread's phone, read on the server. */
export function useZeloCustomer(
  workspaceId: string | null | undefined,
  conversationId: string | undefined,
  enabled: boolean,
): ZeloCustomerState | undefined {
  const [state, setState] = useState<{
    conversationId?: string;
    value?: ZeloCustomerState;
  }>({});

  useEffect(() => {
    if (!enabled || !workspaceId || !conversationId) return;
    const cached = cache.get(conversationId);
    if (cached && Date.now() - cached.at < CACHE_MS) {
      setState({
        conversationId,
        value: { status: "ready", customers: cached.customers },
      });
      return;
    }
    let cancelled = false;
    setState({ conversationId, value: { status: "loading" } });
    loadLiveZeloCustomer({ workspaceId, conversationId })
      .then((customers) => {
        cache.set(conversationId, { at: Date.now(), customers });
        if (!cancelled)
          setState({ conversationId, value: { status: "ready", customers } });
      })
      .catch(() => {
        if (!cancelled)
          setState({ conversationId, value: { status: "error" } });
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, enabled, workspaceId]);

  return state.conversationId === conversationId ? state.value : undefined;
}
