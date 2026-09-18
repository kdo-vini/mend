import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Message } from "../../../types";
import { getMessageMediaUrl, type MessageMediaPurpose } from "../api";

export function MessageMedia({
  workspaceId,
  message,
  resolveUrl = getMessageMediaUrl,
  onError,
  onOpen,
  onResolved,
}: {
  workspaceId: string;
  message: Message;
  resolveUrl?: (
    workspaceId: string,
    message: Message,
    purpose: MessageMediaPurpose,
  ) => Promise<string>;
  onError: () => void;
  onOpen: () => void;
  onResolved?: (url: string) => void;
}) {
  const { t } = useTranslation("inbox");
  const rootRef = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState(message.attachment?.url);

  useEffect(() => {
    setUrl(message.attachment?.url);
  }, [message.attachment?.url, message.id]);

  useEffect(() => {
    if (url || message.type === "document" || !rootRef.current) return;
    const root = rootRef.current;
    const load = () => {
      const purpose = message.type === "image" ? "preview" : "browser";
      void resolveUrl(workspaceId, message, purpose)
        .then((resolved) => {
          setUrl(resolved);
          onResolved?.(resolved);
        })
        .catch(onError);
    };
    if (typeof IntersectionObserver === "undefined") {
      load();
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      load();
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [message, onError, onResolved, resolveUrl, url, workspaceId]);

  const openDocument = async () => {
    try {
      const resolved =
        url ?? (await resolveUrl(workspaceId, message, "original"));
      setUrl(resolved);
      onResolved?.(resolved);
      window.open(resolved, "_blank", "noopener,noreferrer");
    } catch {
      onError();
    }
  };

  return (
    <div ref={rootRef}>
      {message.type === "image" && url ? (
        <button
          className="message-bubble media-bubble media-preview-trigger"
          type="button"
          aria-label={t("ui.openMediaViewer")}
          onClick={onOpen}
        >
          <img
            src={url}
            loading="lazy"
            alt={message.attachment?.name ?? t("ui.media")}
            onError={onError}
          />
          {message.text && <span>{message.text}</span>}
        </button>
      ) : message.type === "video" && url ? (
        <button
          className="message-bubble media-bubble media-preview-trigger"
          type="button"
          aria-label={t("ui.openMediaViewer")}
          onClick={onOpen}
        >
          <video preload="none" muted playsInline src={url} onError={onError} />
          {message.text && <span>{message.text}</span>}
        </button>
      ) : message.type === "audio" && url ? (
        <div className="message-bubble media-bubble">
          <audio controls preload="none" src={url} onError={onError} />
          {message.text && <span>{message.text}</span>}
          {!message.text && message.transcriptionStatus === "processing" && (
            <span className="media-transcript-status">
              {t("ui.transcriptionProcessing")}
            </span>
          )}
          {!message.text && message.transcriptionStatus === "failed" && (
            <span className="media-transcript-status failed">
              {t("ui.transcriptionUnavailable")}
            </span>
          )}
        </div>
      ) : message.type === "document" ? (
        <button
          className="message-bubble attachment-bubble"
          type="button"
          onClick={() => void openDocument()}
        >
          <FileText size={18} />
          <span>
            <strong>{message.attachment?.name ?? t("ui.media")}</strong>
            <small>{message.attachment?.meta ?? t("ui.media")}</small>
          </span>
        </button>
      ) : (
        <div className="message-bubble attachment-bubble media-unavailable">
          <span>{message.attachment?.name ?? t("ui.media")}</span>
        </div>
      )}
    </div>
  );
}
