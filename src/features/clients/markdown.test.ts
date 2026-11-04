import { describe, expect, it } from "vitest";
import {
  appendSection,
  countLines,
  joinSections,
  parseBlocks,
  parseInline,
  replaceSection,
  splitSections,
} from "./markdown";

const body = [
  "Intro da cliente.",
  "",
  "## 1. Sobre você",
  "",
  "**Pergunta**",
  "Resposta",
  "",
  "## Proposta",
  "",
  "Escopo.",
  "",
].join("\n");

describe("splitSections", () => {
  it("makes an untitled intro and one section per heading", () => {
    const sections = splitSections(body);
    expect(sections.map((section) => section.title)).toEqual([
      null,
      "1. Sobre você",
      "Proposta",
    ]);
    expect(sections[0].content).toBe("Intro da cliente.");
    expect(sections[1].content).toBe("**Pergunta**\nResposta");
  });

  it("round-trips exactly", () => {
    for (const text of [
      body,
      "",
      "só intro",
      "## A\n## B\n\n\ntexto\n\n\n",
      "x\r\n## A\r\n\r\ny",
      "## Título\nsem linha em branco",
      "\n\n## A\n",
    ])
      expect(joinSections(splitSections(text))).toBe(text);
  });

  it("does not split on headings inside code fences", () => {
    const text = "## A\n```\n## nao\n```\n## B\n";
    expect(splitSections(text).map((section) => section.title)).toEqual([
      "A",
      "B",
    ]);
  });

  it("returns no sections for an empty body", () => {
    expect(splitSections("")).toEqual([]);
  });
});

describe("replaceSection", () => {
  it("replaces only the chosen section and keeps its heading and spacing", () => {
    const next = replaceSection(body, 2, "Novo escopo\n\n- item");
    expect(next).toBe(body.replace("Escopo.", "Novo escopo\n\n- item"));
    const sections = splitSections(replaceSection(body, 1, "Outra"));
    expect(sections[1].content).toBe("Outra");
    expect(sections[0].raw).toBe(splitSections(body)[0].raw);
    expect(sections[2].raw).toBe(splitSections(body)[2].raw);
  });

  it("replaces the intro", () => {
    const next = replaceSection(body, 0, "Outra intro");
    expect(next.startsWith("Outra intro\n\n## 1. Sobre você")).toBe(true);
  });

  it("ignores an index that does not exist", () => {
    expect(replaceSection(body, 9, "x")).toBe(body);
  });
});

describe("appendSection", () => {
  it("appends a heading separated by a blank line", () => {
    const next = appendSection("texto", "Reunião");
    expect(next).toBe("texto\n\n## Reunião\n");
    expect(splitSections(next).at(-1)?.title).toBe("Reunião");
  });

  it("works on an empty body and flattens the title", () => {
    expect(appendSection("", "  A\nB  ")).toBe("## A B\n");
  });
});

describe("countLines", () => {
  it("counts non-empty lines", () => {
    expect(countLines("a\n\nb\n")).toBe(2);
    expect(countLines("")).toBe(0);
  });
});

describe("parseInline", () => {
  it("parses bold and keeps other text", () => {
    expect(parseInline("a **b** c")).toEqual([
      { type: "text", value: "a " },
      { type: "strong", value: "b" },
      { type: "text", value: " c" },
    ]);
  });

  it("unescapes backslash characters and ignores unclosed bold", () => {
    expect(parseInline(String.raw`\# titulo`)).toEqual([
      { type: "text", value: "# titulo" },
    ]);
    expect(parseInline("**aberto")).toEqual([
      { type: "text", value: "**aberto" },
    ]);
    expect(parseInline(String.raw`\*\*x\*\*`)).toEqual([
      { type: "text", value: "**x**" },
    ]);
  });

  it("never produces markup for html", () => {
    expect(parseInline("<b>x</b>")).toEqual([
      { type: "text", value: "<b>x</b>" },
    ]);
  });
});

describe("parseBlocks", () => {
  it("groups paragraphs, line breaks and bullet lists", () => {
    expect(
      parseBlocks("Linha 1\nLinha 2\n\nO que mudou:\n- a\n- b\n\nFim"),
    ).toEqual([
      { type: "paragraph", lines: ["Linha 1", "Linha 2"] },
      { type: "paragraph", lines: ["O que mudou:"] },
      { type: "list", items: ["a", "b"] },
      { type: "paragraph", lines: ["Fim"] },
    ]);
  });

  it("returns nothing for blank text", () => {
    expect(parseBlocks("\n  \n")).toEqual([]);
  });
});
