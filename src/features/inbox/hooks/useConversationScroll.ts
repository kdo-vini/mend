import { useCallback, useEffect, useRef, useState } from "react";

// True only when the new signature is the old one with messages added at the
// end: a live message arriving. Hydrating a thread, paging older history in
// and swapping a temp bubble for its saved row all change the head or middle.
export function isAppendedSignature(
  previous: string | undefined,
  next: string | undefined,
) {
  if (!previous || !next || previous === next) return false;
  return next.startsWith(`${previous}|`);
}

export function useConversationScroll({
  conversationId,
  messageSignature,
  viewKey,
}: {
  conversationId?: string;
  messageSignature?: string;
  viewKey?: string;
}) {
  const messageCanvasRef = useRef<HTMLDivElement>(null);
  const previousConversationIdRef = useRef<string | undefined>(undefined);
  const previousMessageSignatureRef = useRef<string | undefined>(undefined);
  const previousViewKeyRef = useRef<string | undefined>(undefined);
  const isAtMessageBottomRef = useRef(true);
  const pendingBottomScrollsRef = useRef(0);
  const [showScrollDown, setShowScrollDown] = useState(false);

  const scrollMessagesToBottom = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const canvas = messageCanvasRef.current;
      if (!canvas) return;
      const scroll = () => {
        if (typeof canvas.scrollTo === "function")
          canvas.scrollTo({ top: canvas.scrollHeight, behavior });
        else canvas.scrollTop = canvas.scrollHeight;
        isAtMessageBottomRef.current = true;
        setShowScrollDown(false);
      };
      if (typeof window !== "undefined" && window.requestAnimationFrame) {
        pendingBottomScrollsRef.current += 1;
        window.requestAnimationFrame(() => {
          pendingBottomScrollsRef.current -= 1;
          scroll();
        });
      } else scroll();
    },
    [],
  );

  // While a jump to the latest message is queued the canvas still sits at
  // the top, which must not read as the operator asking for older history.
  const isBottomScrollPending = useCallback(
    () => pendingBottomScrollsRef.current > 0,
    [],
  );

  useEffect(() => {
    const canvas = messageCanvasRef.current;
    if (!canvas) return;
    const updateBottomState = () => {
      const atBottom =
        canvas.scrollHeight - canvas.scrollTop - canvas.clientHeight <= 48;
      isAtMessageBottomRef.current = atBottom;
      if (atBottom) setShowScrollDown(false);
    };
    updateBottomState();
    canvas.addEventListener("scroll", updateBottomState, { passive: true });

    // The takeover/AI cards sit above the message list. When one changes
    // height, the canvas viewport can shrink without any new message being
    // added. Images and media also grow the content after they load. Keep a
    // conversation that was already at the bottom anchored to the latest
    // message in both cases.
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            if (isAtMessageBottomRef.current) scrollMessagesToBottom("auto");
          })
        : undefined;
    resizeObserver?.observe(canvas);
    if (canvas.firstElementChild)
      resizeObserver?.observe(canvas.firstElementChild);

    return () => {
      canvas.removeEventListener("scroll", updateBottomState);
      resizeObserver?.disconnect();
    };
  }, [conversationId, scrollMessagesToBottom]);

  useEffect(() => {
    if (!conversationId) return;
    const conversationChanged =
      previousConversationIdRef.current !== conversationId;
    const previousSignature = previousMessageSignatureRef.current;
    const messagesChanged = previousSignature !== messageSignature;
    const viewChanged = previousViewKeyRef.current !== viewKey;
    previousConversationIdRef.current = conversationId;
    previousMessageSignatureRef.current = messageSignature;
    previousViewKeyRef.current = viewKey;
    if (!conversationChanged && !messagesChanged && !viewChanged) return;

    const appended =
      !conversationChanged &&
      isAppendedSignature(previousSignature, messageSignature);
    // Only a live message glides into view. A smooth scroll is cancelled by
    // any later scrollTop write (older history landing, media growing), which
    // left a freshly opened thread stuck near its first messages.
    if (conversationChanged || viewChanged || isAtMessageBottomRef.current)
      scrollMessagesToBottom(appended && !viewChanged ? "smooth" : "auto");
    else if (appended) setShowScrollDown(true);
  }, [conversationId, messageSignature, scrollMessagesToBottom, viewKey]);

  return {
    messageCanvasRef,
    showScrollDown,
    scrollMessagesToBottom,
    isBottomScrollPending,
  };
}
