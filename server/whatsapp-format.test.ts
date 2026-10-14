import { describe, expect, it } from "vitest";
import { markdownToWhatsApp } from "./whatsapp-format.js";

describe("markdownToWhatsApp", () => {
  it("rewrites Markdown that WhatsApp would show raw", () => {
    expect(
      markdownToWhatsApp(
        "# Zelo Franquias: como funciona\n**Pergunta**: ~~velho~~ e __nota__\nVeja [o site](https://zelo.com).",
      ),
    ).toBe(
      "*Zelo Franquias: como funciona*\n*Pergunta*: ~velho~ e _nota_\nVeja o site (https://zelo.com).",
    );
  });

  it("keeps WhatsApp markup, snake_case and code untouched", () => {
    const text =
      "*ok* _sim_ ~não~ snake__case\n- item\n1. passo\n`**x**`\n```\n# não\n```";
    expect(markdownToWhatsApp(text)).toBe(text);
  });

  it("does not double-wrap a bold heading", () => {
    expect(markdownToWhatsApp("## **Título**")).toBe("*Título*");
  });
});
