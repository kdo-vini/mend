import type { Message } from "../../types";
import { stripHumanWhatsAppIntro } from "../../shared/conversation-preview";

/** WhatsApp lets the sender edit a message for 15 minutes. */
export const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;

const savedMessageId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only messages WhatsApp already holds can be quoted or edited. */
function isSaved(message: Message) {
  return (
    savedMessageId.test(message.id) &&
    Boolean(message.providerMessageId) &&
    !message.deleted &&
    message.status !== "failed" &&
    message.status !== "sending"
  );
}

export function canReplyToMessage(message: Message) {
  return isSaved(message);
}

export function canEditMessage(message: Message, now = Date.now()) {
  if (
    !isSaved(message) ||
    message.direction !== "outbound" ||
    message.type !== "text"
  )
    return false;
  const sentAt = Date.parse(message.createdAt ?? "");
  return Number.isFinite(sentAt) && now - sentAt <= MESSAGE_EDIT_WINDOW_MS;
}

/**
 * The text a bubble shows after an edit: the operator rewrote only the body,
 * so an attending intro the customer already saw stays in front of it.
 */
export function replaceVisibleBody(original: string, body: string) {
  const trimmed = original.trim();
  const visible = stripHumanWhatsAppIntro(trimmed);
  const intro =
    visible !== trimmed && trimmed.endsWith(visible)
      ? trimmed.slice(0, trimmed.length - visible.length)
      : "";
  return `${intro}${body.trim()}`;
}
