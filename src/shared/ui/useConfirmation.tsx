import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConfirmDialog,
  type Confirm,
  type ConfirmationRequest,
  type ConfirmOptions,
} from "./ConfirmDialog";

// i18n-exempt: this primitive receives translated dialog copy from callers.

export function useConfirmation() {
  const [request, setRequest] = useState<ConfirmationRequest | null>(null);
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>((options: ConfirmOptions) => {
    return new Promise((resolve) => {
      resolverRef.current?.(false);
      resolverRef.current = resolve;
      setRequest(options);
    });
  }, []);

  const resolve = useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setRequest(null);
  }, []);

  useEffect(() => {
    return () => {
      resolverRef.current?.(false);
      resolverRef.current = null;
    };
  }, []);

  return {
    confirm,
    confirmationDialog: request ? (
      <ConfirmDialog request={request} onResolve={resolve} />
    ) : null,
  };
}
