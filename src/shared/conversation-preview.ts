import type { Message } from "../types";
import i18n from "../i18n";

/**
 * Human WhatsApp replies may be stored with the attending intro above the
 * composer body (`_*Name está te atendendo*_\n\n…`). Optimistic bubbles only
 * have the body — strip the intro so snapshot merge can retire `temp:` rows.
 */
export function stripHumanWhatsAppIntro(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const stripped = trimmed
    .replace(/^_\*[^*\n]+?\*_\s*\n+/, "")
    .replace(/^\*[^*\n]+?\*\s+(está te atendendo|is assisting you)\s*\n+/i, "");
  return stripped.trim() || trimmed;
}

export type ConversationPreviewLabels = {
  empty: string;
  audio: string;
  image: string;
  video: string;
  document: string;
};

export function conversationPreviewLabels(
  translate: (key: string) => string = (key) => i18n.t(key),
): ConversationPreviewLabels {
  return {
    empty: translate("inbox:ui.noMessages"),
    audio: translate("inbox:ui.previewAudio"),
    image: translate("inbox:ui.previewImage"),
    video: translate("inbox:ui.previewVideo"),
    document: translate("inbox:ui.previewDocument"),
  };
}

/** Inbox list preview: prefer body/caption, otherwise a typed media label. */
export function conversationPreviewText(
  message: Pick<Message, "type" | "text" | "attachment"> | undefined,
  labels: ConversationPreviewLabels = conversationPreviewLabels(),
): string {
  if (!message) return labels.empty;
  const text = stripHumanWhatsAppIntro(message.text ?? "").trim();
  if (text) return text;
  switch (message.type) {
    case "audio":
      return labels.audio;
    case "image":
      return labels.image;
    case "video":
      return labels.video;
    case "document":
      return message.attachment?.name?.trim() || labels.document;
    default:
      return labels.empty;
  }
}
