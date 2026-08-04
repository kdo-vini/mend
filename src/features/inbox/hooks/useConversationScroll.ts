import { useCallback, useEffect, useRef, useState } from "react";

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
      if (typeof window !== "undefined" && window.requestAnimationFrame)
        window.requestAnimationFrame(scroll);
      else scroll();
    },
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
    // added. Keep a conversation that was already at the bottom anchored to
    // the latest message in that case.
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            if (isAtMessageBottomRef.current) scrollMessagesToBottom("auto");
          })
        : undefined;
    resizeObserver?.observe(canvas);

    return () => {
      canvas.removeEventListener("scroll", updateBottomState);
      resizeObserver?.disconnect();
    };
  }, [conversationId, scrollMessagesToBottom]);

  useEffect(() => {
    if (!conversationId) return;
    const conversationChanged =
      previousConversationIdRef.current !== conversationId;
    const messagesChanged =
      previousMessageSignatureRef.current !== messageSignature;
    const viewChanged = previousViewKeyRef.current !== viewKey;
    previousConversationIdRef.current = conversationId;
    previousMessageSignatureRef.current = messageSignature;
    previousViewKeyRef.current = viewKey;
    if (!conversationChanged && !messagesChanged && !viewChanged) return;

    if (conversationChanged || viewChanged || isAtMessageBottomRef.current)
      scrollMessagesToBottom(
        conversationChanged || viewChanged ? "auto" : "smooth",
      );
    else if (messagesChanged) setShowScrollDown(true);
  }, [conversationId, messageSignature, scrollMessagesToBottom, viewKey]);

  return { messageCanvasRef, showScrollDown, scrollMessagesToBottom };
}
