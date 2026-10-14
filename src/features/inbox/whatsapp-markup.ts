/**
 * WhatsApp text formatting, parsed the way the WhatsApp apps read it.
 *
 * Inline: *bold*, _italic_, ~strike~, `inline code` and ```monospace```, with
 * nesting (`_*Ana*_`) and WhatsApp's boundary rules: a marker opens only at
 * the start or after a non-letter/digit, must touch non-space text on the
 * inside, and closes only before a non-letter/digit or the end. That keeps
 * `snake_case`, `2*3*4` and `a * b` literal, as on a phone.
 *
 * Blocks: "- " / "* " bullets, "1. " numbered lists, "> " quotes and fenced
 * ``` blocks. Common Markdown that AI replies tend to carry (`**bold**`,
 * `~~strike~~`, `# heading`, `[label](url)`) is read as its WhatsApp
 * equivalent so stored messages do not show raw symbols.
 */

export type WaInline =
  | { type: "text"; value: string }
  | {
      type: "bold" | "italic" | "strike";
      marker: string;
      children: WaInline[];
    }
  | { type: "code" | "mono"; marker: string; value: string }
  | { type: "link"; href: string; label?: string; raw: string };

export type WaBlock =
  | { type: "paragraph"; lines: WaInline[][] }
  | { type: "heading"; content: WaInline[] }
  | { type: "quote"; lines: WaInline[][] }
  | { type: "bullets"; items: WaInline[][] }
  | { type: "numbered"; items: { number: string; content: WaInline[] }[] }
  | { type: "codeblock"; value: string }
  | { type: "gap" };

const WORD = /[\p{L}\p{N}]/u;
const SPACE = /\s/;
const URL_AT = /^(?:https?:\/\/|www\.)[^\s<>"]+/i;
const MD_LINK_AT = /^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/i;

type Emphasis = { marker: string; type: "bold" | "italic" | "strike" };

/** Longest marker first so `**x**` wins over `*x*`. */
const EMPHASIS: Record<string, Emphasis[]> = {
  "*": [
    { marker: "**", type: "bold" },
    { marker: "*", type: "bold" },
  ],
  _: [
    { marker: "__", type: "italic" },
    { marker: "_", type: "italic" },
  ],
  "~": [
    { marker: "~~", type: "strike" },
    { marker: "~", type: "strike" },
  ],
};

function opensAt(text: string, index: number, marker: string) {
  const before = text[index - 1];
  const after = text[index + marker.length];
  if (before !== undefined && WORD.test(before)) return false;
  return after !== undefined && !SPACE.test(after);
}

/** Index of the nearest valid closing marker, or -1. */
function findClose(
  text: string,
  from: number,
  marker: string,
  multiline: boolean,
) {
  for (let index = from; index < text.length; index += 1) {
    if (!multiline && text[index] === "\n") return -1;
    if (!text.startsWith(marker, index) || index === from) continue;
    const before = text[index - 1];
    const after = text[index + marker.length];
    if (before === undefined || SPACE.test(before)) continue;
    if (after !== undefined && (WORD.test(after) || after === marker[0]))
      continue;
    return index;
  }
  return -1;
}

function trimLinkTail(url: string) {
  // Sentence punctuation right after a link is not part of it.
  return url.replace(/[.,;:!?)\]}'"]+$/, "");
}

export function parseWhatsAppInline(text: string): WaInline[] {
  const nodes: WaInline[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) nodes.push({ type: "text", value: buffer });
    buffer = "";
  };

  let index = 0;
  while (index < text.length) {
    const char = text[index]!;
    const before = text[index - 1];
    const rest = text.slice(index);

    if (
      (char === "h" || char === "H" || char === "w" || char === "W") &&
      (before === undefined || !WORD.test(before))
    ) {
      const url = URL_AT.exec(rest)?.[0];
      const raw = url ? trimLinkTail(url) : "";
      if (raw.length > 4) {
        flush();
        nodes.push({
          type: "link",
          href: /^www\./i.test(raw) ? `https://${raw}` : raw,
          raw,
        });
        index += raw.length;
        continue;
      }
    }

    if (char === "[") {
      const link = MD_LINK_AT.exec(rest);
      if (link) {
        flush();
        nodes.push({
          type: "link",
          href: link[2]!,
          label: link[1]!,
          raw: link[0],
        });
        index += link[0].length;
        continue;
      }
    }

    if (char === "`") {
      const marker = text.startsWith("```", index) ? "```" : "`";
      if (opensAt(text, index, marker) || marker === "```") {
        const close = text.indexOf(marker, index + marker.length + 1);
        const value =
          close > -1 ? text.slice(index + marker.length, close) : undefined;
        if (
          value &&
          value.trim() &&
          (marker === "```" || !value.includes("\n"))
        ) {
          flush();
          nodes.push({
            type: marker === "```" ? "mono" : "code",
            marker,
            value,
          });
          index = close + marker.length;
          continue;
        }
      }
    }

    const candidates = EMPHASIS[char];
    if (candidates) {
      let matched = false;
      for (const { marker, type } of candidates) {
        if (!text.startsWith(marker, index) || !opensAt(text, index, marker))
          continue;
        const start = index + marker.length;
        const close = findClose(text, start, marker, false);
        if (close < 0) continue;
        flush();
        nodes.push({
          type,
          marker,
          children: parseWhatsAppInline(text.slice(start, close)),
        });
        index = close + marker.length;
        matched = true;
        break;
      }
      if (matched) continue;
    }

    buffer += char;
    index += 1;
  }
  flush();
  return nodes;
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*(\d{1,3})[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const HEADING = /^#{1,6}\s+(.+?)\s*#*$/;

export function parseWhatsAppBlocks(text: string): WaBlock[] {
  const blocks: WaBlock[] = [];
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const last = () => blocks.at(-1);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;

    // A line that opens a ``` fence without closing it starts a code block.
    if (line.trimStart().startsWith("```")) {
      const opener = line.trimStart().slice(3);
      if (!opener.includes("```")) {
        const end = lines.findIndex(
          (candidate, at) => at > index && candidate.includes("```"),
        );
        if (end > -1) {
          const closing = lines[end]!;
          const body = [
            ...(opener.trim() && !/^[\w+-]+$/.test(opener.trim())
              ? [opener]
              : []),
            ...lines.slice(index + 1, end),
            ...(closing.trim() === "```"
              ? []
              : [closing.slice(0, closing.indexOf("```"))]),
          ].join("\n");
          blocks.push({ type: "codeblock", value: body });
          index = end;
          continue;
        }
      }
    }

    if (!line.trim()) {
      if (blocks.length && last()?.type !== "gap") blocks.push({ type: "gap" });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        content: parseWhatsAppInline(heading[1]!),
      });
      continue;
    }

    const quote = QUOTE.exec(line);
    if (quote) {
      const content = parseWhatsAppInline(quote[1]!);
      const previous = last();
      if (previous?.type === "quote") previous.lines.push(content);
      else blocks.push({ type: "quote", lines: [content] });
      continue;
    }

    const bullet = BULLET.exec(line);
    // "*bold* text" is emphasis, not a bullet: bullets need "* " with a space.
    if (bullet) {
      const content = parseWhatsAppInline(bullet[1]!);
      const previous = last();
      if (previous?.type === "bullets") previous.items.push(content);
      else blocks.push({ type: "bullets", items: [content] });
      continue;
    }

    const numbered = NUMBERED.exec(line);
    if (numbered) {
      const item = {
        number: numbered[1]!,
        content: parseWhatsAppInline(numbered[2]!),
      };
      const previous = last();
      if (previous?.type === "numbered") previous.items.push(item);
      else blocks.push({ type: "numbered", items: [item] });
      continue;
    }

    const content = parseWhatsAppInline(line);
    const previous = last();
    if (previous?.type === "paragraph") previous.lines.push(content);
    else blocks.push({ type: "paragraph", lines: [content] });
  }

  if (last()?.type === "gap") blocks.pop();
  return blocks;
}

/**
 * One-line version for the conversation list: block markers dropped, line
 * breaks collapsed, inline formatting kept (as the WhatsApp chat list does).
 */
export function parseWhatsAppPreview(text: string): WaInline[] {
  const flattened = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s*```\s*$/, "")
        .replace(/^#{1,6}\s+/, "")
        .replace(/^>\s?/, "")
        .replace(/^\s*[-•]\s+/, "")
        .replace(/^\s*\*\s+/, "")
        .trim(),
    )
    .filter(Boolean)
    .join(" ");
  return parseWhatsAppInline(flattened);
}

export type WaFormatMarker = "*" | "_" | "~" | "```";

/**
 * Wraps the selection in a WhatsApp marker, or unwraps it when it is
 * already wrapped (inside or just outside the selection), like the
 * formatting shortcuts of WhatsApp Web. Surrounding spaces stay outside
 * the markers, since `* bold*` would not format.
 */
export function toggleWhatsAppFormat(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  marker: WaFormatMarker,
) {
  const size = marker.length;
  const selected = text.slice(selectionStart, selectionEnd);
  if (
    selected.length > size * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker)
  ) {
    const inner = selected.slice(size, -size);
    return {
      text: text.slice(0, selectionStart) + inner + text.slice(selectionEnd),
      selectionStart,
      selectionEnd: selectionStart + inner.length,
    };
  }
  if (
    text.slice(selectionStart - size, selectionStart) === marker &&
    text.slice(selectionEnd, selectionEnd + size) === marker
  ) {
    return {
      text:
        text.slice(0, selectionStart - size) +
        selected +
        text.slice(selectionEnd + size),
      selectionStart: selectionStart - size,
      selectionEnd: selectionEnd - size,
    };
  }
  const leading = selected.length - selected.trimStart().length;
  const trailing = selected.length - selected.trimEnd().length;
  const start = selectionStart + (selected.trim() ? leading : 0);
  const end = selectionEnd - (selected.trim() ? trailing : 0);
  const core = text.slice(start, end);
  return {
    text: text.slice(0, start) + marker + core + marker + text.slice(end),
    selectionStart: start + size,
    selectionEnd: end + size,
  };
}
