import { describe, expect, it } from "vitest";
import {
  resolveProductsFromScores,
  resolveSupportProducts,
  type SupportProduct,
} from "./knowledge-products.js";

const products: SupportProduct[] = [
  {
    id: "pdv",
    workspaceId: "w",
    key: "zelopdv",
    name: "ZeloPDV",
    description: "",
    aliases: ["pdv", "caixa"],
    status: "active",
  },
  {
    id: "chat",
    workspaceId: "w",
    key: "zelochat",
    name: "ZeloChat",
    description: "",
    aliases: ["chat", "WhatsApp"],
    status: "active",
  },
  {
    id: "menu",
    workspaceId: "w",
    key: "zelomenu",
    name: "ZeloMenu",
    description: "",
    aliases: ["menu", "cardápio digital"],
    status: "active",
  },
];

describe("support product resolution", () => {
  it("resolves every explicitly named product", () => {
    expect(
      resolveSupportProducts("Uso ZeloPDV e ZeloMenu", products),
    ).toMatchObject({ productIds: ["pdv", "menu"], ambiguous: false });
  });

  it("does not resolve the generic brand word", () => {
    expect(
      resolveSupportProducts("Estou com problema no Zelo", products),
    ).toMatchObject({ productIds: [], ambiguous: true });
  });

  it("normalizes configured aliases and accents", () => {
    expect(
      resolveSupportProducts("Meu cardapio digital sumiu", products),
    ).toMatchObject({ productIds: ["menu"], primaryProductId: "menu" });
  });

  it("keeps close retrieval scores ambiguous", () => {
    expect(resolveProductsFromScores({ pdv: 0.4, menu: 0.38 })).toMatchObject({
      productIds: ["pdv", "menu"],
      ambiguous: true,
    });
  });
});
