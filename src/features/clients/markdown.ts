/**
 * Tiny markdown helpers for a client's body. Only the subset the product uses:
 * `## ` sections, paragraphs, `**bold**`, `- ` lists, line breaks, `\#` escapes.
 */

export interface BodySection {
  /** `null` for the intro: text before the first `## ` heading. */
  title: string | null;
  /** Section text without its heading line, trimmed of surrounding blank lines. */
  content: string;
  /** Exact source text, heading included. Joining every `raw` rebuilds the body. */
  raw: string;
}

const headingPattern = /^## +(.*?)\s*$/;

function splitLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

function trimBlankLines(text: string) {
  return text.replace(/^(?:[ \t]*\r?\n)+/, "").replace(/\s+$/, "");
}

function build(title: string | null, lines: string[]): BodySection {
  const raw = lines.join("");
  const rest = title === null ? raw : lines.slice(1).join("");
  return { title, content: trimBlankLines(rest), raw };
}

/** Splits a body into an optional intro and one section per `## ` heading. */
export function splitSections(body: string): BodySection[] {
  const sections: BodySection[] = [];
  let title: string | null = null;
  let lines: string[] = [];
  let fenced = false;
  const flush = () => {
    if (lines.length) sections.push(build(title, lines));
  };
  for (const line of splitLines(body)) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    const heading = fenced ? null : headingPattern.exec(line);
    if (heading) {
      flush();
      title = heading[1];
      lines = [line];
    } else {
      lines.push(line);
    }
  }
  flush();
  return sections;
}

export function joinSections(sections: BodySection[]): string {
  return sections.map((section) => section.raw).join("");
}

function cleanTitle(title: string) {
  return title.replace(/\s+/g, " ").trim();
}

/** Returns the body with section `index` holding `content`; the heading stays. */
export function replaceSection(
  body: string,
  index: number,
  content: string,
): string {
  const sections = splitSections(body);
  const section = sections[index];
  if (!section) return body;
  const trailing = /\s*$/.exec(section.raw)?.[0] ?? "";
  const isLast = index === sections.length - 1;
  const gap = trailing || (isLast ? "\n" : "\n\n");
  const text = content.trim();
  const heading =
    section.title === null ? "" : `## ${cleanTitle(section.title)}\n`;
  const rebuilt =
    section.title === null
      ? `${text}${text ? gap : ""}`
      : `${heading}${text ? `\n${text}` : ""}${gap}`;
  return joinSections(
    sections.map((item, position) =>
      position === index ? { ...item, raw: rebuilt } : item,
    ),
  );
}

/** Appends a new `## title` section after the existing body. */
export function appendSection(
  body: string,
  title: string,
  content = "",
): string {
  const base = body.replace(/\s+$/, "");
  const text = content.trim();
  return `${base ? `${base}\n\n` : ""}## ${cleanTitle(title)}\n${text ? `\n${text}\n` : ""}`;
}

/** Non-empty lines in a section, for the Disclosure summary. */
export function countLines(content: string): number {
  return content.split("\n").filter((line) => line.trim()).length;
}

export type InlineNode =
  | { type: "text"; value: string }
  | { type: "strong"; value: string };

const escapable = /[\\#*_`>[\]()!.+-]/;

function unescape(text: string) {
  let out = "";
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\\" && escapable.test(text[index + 1] ?? "")) {
      out += text[index + 1];
      index += 1;
    } else {
      out += text[index];
    }
  }
  return out;
}

/** `**bold**` and backslash escapes; anything else is literal text. */
export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let buffer = "";
  const pushText = () => {
    if (buffer) nodes.push({ type: "text", value: unescape(buffer) });
    buffer = "";
  };
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === "\\" && escapable.test(text[index + 1] ?? "")) {
      buffer += char + text[index + 1];
      index += 2;
      continue;
    }
    if (char === "*" && text[index + 1] === "*") {
      let end = index + 2;
      while (end < text.length) {
        if (text[end] === "\\") {
          end += 2;
          continue;
        }
        if (text[end] === "*" && text[end + 1] === "*") break;
        end += 1;
      }
      if (end < text.length && end > index + 2) {
        pushText();
        nodes.push({
          type: "strong",
          value: unescape(text.slice(index + 2, end)),
        });
        index = end + 2;
        continue;
      }
    }
    buffer += char;
    index += 1;
  }
  pushText();
  return nodes;
}

export type Block =
  | { type: "paragraph"; lines: string[] }
  | { type: "list"; items: string[] };

const bulletPattern = /^\s*[-*] +(.*)$/;

/** Groups lines into paragraphs (kept as lines, rendered with breaks) and bullet lists. */
export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      blocks.push({ type: "paragraph", lines: [] });
      continue;
    }
    const bullet = bulletPattern.exec(line);
    const last = blocks[blocks.length - 1];
    if (bullet) {
      if (last?.type === "list") last.items.push(bullet[1]);
      else blocks.push({ type: "list", items: [bullet[1]] });
    } else if (last?.type === "paragraph") {
      last.lines.push(line.trim());
    } else {
      blocks.push({ type: "paragraph", lines: [line.trim()] });
    }
  }
  return blocks.filter(
    (block) => block.type === "list" || block.lines.length > 0,
  );
}
