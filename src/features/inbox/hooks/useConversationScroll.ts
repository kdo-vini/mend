import { useCallback, useEffect, useRef, useState } from "react";

export function useConversationScroll({
  conversationId,
  messageSignature,
}: {
  conversationId?: string;
  messageSignature?: string;
}) {
  const messageCanvasRef = useRef<HTMLDivElement>(null);
  const previousConversationIdRef = useRef<string | undefined>(undefined);
  const previousMessageSignatureRef = useRef<string | undefined>(undefined);
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
    return () => canvas.removeEventListener("scroll", updateBottomState);
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    const conversationChanged =
      previousConversationIdRef.current !== conversationId;
    const messagesChanged =
      previousMessageSignatureRef.current !== messageSignature;
    previousConversationIdRef.current = conversationId;
    previousMessageSignatureRef.current = messageSignature;
    if (!conversationChanged && !messagesChanged) return;

    if (conversationChanged || isAtMessageBottomRef.current)
      scrollMessagesToBottom(conversationChanged ? "auto" : "smooth");
    else if (messagesChanged) setShowScrollDown(true);
  }, [conversationId, messageSignature, scrollMessagesToBottom]);

  return { messageCanvasRef, showScrollDown, scrollMessagesToBottom };
}
