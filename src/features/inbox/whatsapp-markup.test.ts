import { describe, expect, it } from "vitest";
import {
  parseWhatsAppBlocks,
  parseWhatsAppInline,
  parseWhatsAppPreview,
  toggleWhatsAppFormat,
  type WaInline,
} from "./whatsapp-markup";

/** Compact notation: *b*, _i_, ~s~, `c`, ```m```, [link]. */
function show(nodes: WaInline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
          return node.value;
        case "bold":
          return `<b>${show(node.children)}</b>`;
        case "italic":
          return `<i>${show(node.children)}</i>`;
        case "strike":
          return `<s>${show(node.children)}</s>`;
        case "code":
          return `<c>${node.value}</c>`;
        case "mono":
          return `<m>${node.value}</m>`;
        case "link":
          return `<a ${node.href}>${node.label ?? node.raw}</a>`;
      }
    })
    .join("");
}

const inline = (text: string) => show(parseWhatsAppInline(text));

describe("parseWhatsAppInline", () => {
  it("formats WhatsApp markers", () => {
    expect(inline("Use *Produtos* e depois _salvar_")).toBe(
      "Use <b>Produtos</b> e depois <i>salvar</i>",
    );
    expect(inline("~antigo~ `codigo` ```mono```")).toBe(
      "<s>antigo</s> <c>codigo</c> <m>mono</m>",
    );
  });

  it("nests markers like the human intro line", () => {
    expect(inline("_*Ana está te atendendo*_")).toBe(
      "<i><b>Ana está te atendendo</b></i>",
    );
  });

  it("keeps markers literal where WhatsApp does", () => {
    expect(inline("snake_case_name")).toBe("snake_case_name");
    expect(inline("2*3*4")).toBe("2*3*4");
    expect(inline("a * b * c")).toBe("a * b * c");
    expect(inline("* solto*")).toBe("* solto*");
    expect(inline("*sem fim")).toBe("*sem fim");
    expect(inline("*a\nb*")).toBe("*a\nb*");
    expect(inline("<b>x</b>")).toBe("<b>x</b>");
  });

  it("accepts Markdown doubling and links", () => {
    expect(inline("**Pergunta** e ~~velho~~")).toBe(
      "<b>Pergunta</b> e <s>velho</s>",
    );
    expect(inline("veja [o site](https://mend.dev).")).toBe(
      "veja <a https://mend.dev>o site</a>.",
    );
  });

  it("links URLs without swallowing punctuation or formatting them", () => {
    expect(inline("Acesse https://a.com/x_y_z, ok")).toBe(
      "Acesse <a https://a.com/x_y_z>https://a.com/x_y_z</a>, ok",
    );
    expect(inline("www.mend.dev")).toBe(
      "<a https://www.mend.dev>www.mend.dev</a>",
    );
  });
});

describe("parseWhatsAppBlocks", () => {
  it("groups lists, quotes, headings and code fences", () => {
    const blocks = parseWhatsAppBlocks(
      [
        "# Zelo Franquias",
        "Linha *um*",
        "linha dois",
        "",
        "- item a",
        "* item b",
        "1. passo",
        "2. outro",
        "> citado",
        "```",
        "x = *1*",
        "```",
      ].join("\n"),
    );
    expect(blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "gap",
      "bullets",
      "numbered",
      "quote",
      "codeblock",
    ]);
    expect(blocks[1]).toMatchObject({ type: "paragraph" });
    expect(
      blocks[4]?.type === "numbered" && blocks[4].items.map((i) => i.number),
    ).toEqual(["1", "2"]);
    expect(blocks[6]).toEqual({ type: "codeblock", value: "x = *1*" });
  });

  it("does not read a bold line as a bullet", () => {
    expect(parseWhatsAppBlocks("*Atenção* aqui")[0]?.type).toBe("paragraph");
  });
});

describe("parseWhatsAppPreview", () => {
  it("drops block markers and keeps inline formatting on one line", () => {
    expect(
      show(
        parseWhatsAppPreview(
          "# Zelo Franquias: como funciona\n\n**Pergunta** - aqui\n- item",
        ),
      ),
    ).toBe("Zelo Franquias: como funciona <b>Pergunta</b> - aqui item");
  });
});

describe("toggleWhatsAppFormat", () => {
  it("wraps the trimmed selection", () => {
    expect(toggleWhatsAppFormat("oi mundo ", 3, 9, "*")).toEqual({
      text: "oi *mundo* ",
      selectionStart: 4,
      selectionEnd: 9,
    });
  });

  it("unwraps markers around or inside the selection", () => {
    expect(toggleWhatsAppFormat("oi *mundo*", 4, 9, "*")).toEqual({
      text: "oi mundo",
      selectionStart: 3,
      selectionEnd: 8,
    });
    expect(toggleWhatsAppFormat("oi ```x```", 3, 10, "```")).toEqual({
      text: "oi x",
      selectionStart: 3,
      selectionEnd: 4,
    });
  });

  it("inserts an empty pair at the caret", () => {
    expect(toggleWhatsAppFormat("oi ", 3, 3, "_")).toEqual({
      text: "oi __",
      selectionStart: 4,
      selectionEnd: 4,
    });
  });
});
