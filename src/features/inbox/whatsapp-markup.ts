/**
 * Renders WhatsApp-flavored markup for inbox bubbles.
 * Supports *bold*, _italic_, ~strike~, line breaks and simple lists.
 */
export function renderWhatsAppMarkup(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const withBreaks = escaped.replace(/\r\n|\r|\n/g, "<br/>");
  return withBreaks
    .replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>")
    .replace(/_([^_\n]+)_/g, "<em>$1</em>")
    .replace(/~([^~\n]+)~/g, "<s>$1</s>");
}
