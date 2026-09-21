import { describe, expect, it } from "vitest";
import { renderWhatsAppMarkup } from "./whatsapp-markup";

describe("renderWhatsAppMarkup", () => {
  it("escapes HTML and formats WhatsApp markers", () => {
    expect(renderWhatsAppMarkup("Use *Produtos* e depois _salvar_")).toBe(
      "Use <strong>Produtos</strong> e depois <em>salvar</em>",
    );
    expect(renderWhatsAppMarkup("a <b>x</b>\n2. passo")).toBe(
      "a &lt;b&gt;x&lt;/b&gt;<br/>2. passo",
    );
  });
});
