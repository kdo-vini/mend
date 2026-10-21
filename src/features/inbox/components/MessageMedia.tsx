import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Message } from "../../../types";
import { getMessageMediaUrl, type MessageMediaPurpose } from "../api";
import { AudioWavePlayer } from "./AudioWavePlayer";
import { WhatsAppMessageText } from "./WhatsAppText";

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
  const messageIdRef = useRef(message.id);
  const failedUrlRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const sameMessage = messageIdRef.current === message.id;
    messageIdRef.current = message.id;
    const next = message.attachment?.url;
    // Conversation snapshots rebuild messages without the signed URL this
    // bubble already resolved; dropping it unmounted the audio player in the
    // middle of playback. Keep it unless the message changed or it failed.
    setUrl((current) =>
      sameMessage && !next && current !== failedUrlRef.current ? current : next,
    );
  }, [message.attachment?.url, message.id]);

  const handleMediaError = () => {
    failedUrlRef.current = url;
    onError();
  };

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

  // Documents and not-yet-loaded media carry the caption too; dropping it
  // made the text the operator sent vanish from the conversation.
  const caption = message.text ? (
    <span className="media-caption">
      <WhatsAppMessageText text={message.text} />
    </span>
  ) : null;

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
            onError={handleMediaError}
          />
          {message.text && (
            <span className="media-caption">
              <WhatsAppMessageText text={message.text} links={false} />
            </span>
          )}
        </button>
      ) : message.type === "video" && url ? (
        <button
          className="message-bubble media-bubble media-preview-trigger"
          type="button"
          aria-label={t("ui.openMediaViewer")}
          onClick={onOpen}
        >
          <video
            preload="none"
            muted
            playsInline
            src={url}
            onError={handleMediaError}
          />
          {message.text && (
            <span className="media-caption">
              <WhatsAppMessageText text={message.text} links={false} />
            </span>
          )}
        </button>
      ) : message.type === "audio" ? (
        <div className="message-bubble media-bubble">
          {url ? (
            <AudioWavePlayer key={url} src={url} onError={handleMediaError} />
          ) : (
            <span className="media-transcript-status">
              {t("ui.processingMedia")}
            </span>
          )}
          {message.text && (
            <span className="media-caption">
              <WhatsAppMessageText text={message.text} links={false} />
            </span>
          )}
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
        <div className="message-bubble document-bubble">
          <button
            className="attachment-bubble"
            type="button"
            onClick={() => void openDocument()}
          >
            <FileText size={18} />
            <span>
              <strong>{message.attachment?.name ?? t("ui.media")}</strong>
              <small>{message.attachment?.meta ?? t("ui.media")}</small>
            </span>
          </button>
          {caption}
        </div>
      ) : (
        <div className="message-bubble media-bubble">
          <div className="attachment-bubble media-unavailable">
            <span>{message.attachment?.name ?? t("ui.media")}</span>
          </div>
          {caption}
        </div>
      )}
    </div>
  );
}
