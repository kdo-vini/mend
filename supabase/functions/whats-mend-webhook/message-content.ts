/**
 * Keep in sync with server/whatsmiau-message.ts. The edge webhook cannot
 * import the server module, and both paths must classify voice notes the same
 * way before a message is stored.
 */

export type ProviderContentType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "reaction";

export interface ProviderMessageContent {
  messageType: ProviderContentType;
  message: Record<string, unknown>;
  content: Record<string, unknown>;
  text?: string;
  caption?: string;
  mediaUrlCandidates: unknown[];
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  durationSeconds?: number;
  inlineBase64?: string;
}

const WRAPPERS = [
  "ephemeralMessage",
  "viewOnceMessage",
  "viewOnceMessageV2",
  "viewOnceMessageV2Extension",
  "documentWithCaptionMessage",
  "editedMessage",
  "associatedChildMessage",
  "groupStatusMessage",
  "botInvokeMessage",
] as const;

const TYPE_HINTS: Record<string, ProviderContentType> = {
  audio: "audio",
  audiomessage: "audio",
  ptt: "audio",
  pttmessage: "audio",
  image: "image",
  imagemessage: "image",
  sticker: "image",
  stickermessage: "image",
  video: "video",
  videomessage: "video",
  ptv: "video",
  ptvmessage: "video",
  document: "document",
  documentmessage: "document",
  reaction: "reaction",
  reactionmessage: "reaction",
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const firstRecord = (...values: unknown[]): Record<string, unknown> =>
  values.map(asRecord).find((value) => Object.keys(value).length > 0) ?? {};

function stringValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function finiteNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim()
          ? Number(value)
          : Number.NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function unwrapProviderMessage(
  value: Record<string, unknown>,
  depth = 0,
): Record<string, unknown> {
  if (depth > 6) return value;
  for (const wrapper of WRAPPERS) {
    const nested = asRecord(value[wrapper]);
    if (Object.keys(nested).length === 0) continue;
    const inner = asRecord(nested.message ?? nested);
    if (Object.keys(inner).length === 0) continue;
    return unwrapProviderMessage(inner, depth + 1);
  }
  return value;
}

function hintedType(
  value: string | undefined,
): ProviderContentType | undefined {
  if (!value) return undefined;
  return TYPE_HINTS[value.toLowerCase().replace(/[^a-z]/g, "")];
}

function providerContentType(
  message: Record<string, unknown>,
  hint?: string,
): ProviderContentType {
  if (message.imageMessage || message.stickerMessage) return "image";
  if (message.videoMessage || message.ptvMessage) return "video";
  if (message.audioMessage || message.pttMessage) return "audio";
  if (message.documentMessage) return "document";
  if (message.reactionMessage) return "reaction";
  return hintedType(hint) ?? "text";
}

function mediaContent(
  message: Record<string, unknown>,
): Record<string, unknown> {
  return firstRecord(
    message.imageMessage,
    message.stickerMessage,
    message.videoMessage,
    message.ptvMessage,
    message.audioMessage,
    message.pttMessage,
    message.documentMessage,
    message.reactionMessage,
  );
}

export function readProviderMessageContent(
  value: Record<string, unknown>,
): ProviderMessageContent {
  const original = asRecord(value.message);
  const message = unwrapProviderMessage(original);
  const hint = stringValue(value.messageType, original.messageType);
  const content = mediaContent(message);
  const extended = asRecord(message.extendedTextMessage);
  const listResponse = asRecord(
    asRecord(message.listResponseMessage).singleSelectReply,
  );
  const buttonResponse = asRecord(message.buttonsResponseMessage);
  const messageType = providerContentType(message, hint);
  const caption = stringValue(content.caption);
  const text = stringValue(
    message.conversation,
    extended.text,
    caption,
    asRecord(message.reactionMessage).text,
    listResponse.title,
    buttonResponse.selectedDisplayText,
  );
  const inlineBase64 = stringValue(
    original.base64,
    message.base64,
    content.base64,
  );
  return {
    messageType,
    message,
    content,
    ...(text ? { text } : {}),
    ...(caption ? { caption } : {}),
    mediaUrlCandidates: [
      original.mediaUrl,
      message.mediaUrl,
      value.mediaUrl,
      content.url,
      content.directPath,
      content.mediaUrl,
      asRecord(value.media).url,
    ],
    ...(stringValue(content.mimetype, content.mimeType, original.mimetype)
      ? {
          mimeType: stringValue(
            content.mimetype,
            content.mimeType,
            original.mimetype,
          ),
        }
      : {}),
    ...(stringValue(content.fileName, content.filename, original.fileName)
      ? {
          fileName: stringValue(
            content.fileName,
            content.filename,
            original.fileName,
          ),
        }
      : {}),
    ...(finiteNumber(content.fileLength, content.fileSize) !== undefined
      ? { fileSize: finiteNumber(content.fileLength, content.fileSize) }
      : {}),
    ...(finiteNumber(content.seconds, content.duration) !== undefined
      ? {
          durationSeconds: finiteNumber(content.seconds, content.duration),
        }
      : {}),
    ...(inlineBase64 ? { inlineBase64 } : {}),
  };
}

export function publicProviderMediaUrl(
  ...values: unknown[]
): string | undefined {
  for (const value of values) {
    const candidate = typeof value === "string" ? value.trim() : "";
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      const host = url.hostname.toLowerCase();
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        host === "whatsapp.net" ||
        host.endsWith(".whatsapp.net") ||
        url.pathname.toLowerCase().endsWith(".enc")
      )
        continue;
      return url.toString();
    } catch {
      // Try the next provider media field.
    }
  }
  return undefined;
}
