/**
 * Rewrites common Markdown into WhatsApp markup before a text leaves Mend,
 * so the customer's phone shows the same formatting the Inbox renders.
 * WhatsApp already understands *bold*, _italic_, ~strike~, `code`,
 * ```monospace```, "- " lists, "1. " lists and "> " quotes; what it shows
 * raw is the Markdown doubling (`**bold**`), `# headings` and
 * `[label](url)` links, which AI replies and pasted text often carry.
 * Code spans and fences are left untouched.
 */
export function markdownToWhatsApp(text: string): string {
  return text
    .split(/(```[\s\S]*?```|`[^`\n]+`)/)
    .map((part, index) => (index % 2 ? part : convertProse(part)))
    .join("");
}

function convertProse(text: string) {
  return text
    .split("\n")
    .map((line) => {
      const heading = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
      const body = convertInline(heading ? heading[1]! : line);
      if (!heading) return body;
      const plain = body.replace(/^\*(.+)\*$/, "$1");
      return `*${plain}*`;
    })
    .join("\n");
}

function convertInline(line: string) {
  return line
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) =>
      label === url ? url : `${label} (${url})`,
    )
    .replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, "*$1*")
    .replace(
      /(^|[^\p{L}\p{N}_])__(?=\S)([^_\n]*?\S)__(?![\p{L}\p{N}])/gu,
      "$1_$2_",
    )
    .replace(/~~(?=\S)([^~\n]*?\S)~~/g, "~$1~");
}
