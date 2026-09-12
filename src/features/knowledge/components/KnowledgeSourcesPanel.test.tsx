// @vitest-environment jsdom
// i18n-exempt: tests render translated output through the shared i18n instance.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import i18n from "../../../i18n";
import type { KnowledgeProduct, KnowledgeSourceSummary } from "../../../types";
import { KnowledgeSourcesPanel } from "./KnowledgeSourcesPanel";

const product: KnowledgeProduct = {
  id: "product-zelo-pdv",
  key: "zelopdv",
  name: "ZeloPDV",
  description: "PDV",
  aliases: [],
  status: "active",
};

const currentSource: KnowledgeSourceSummary = {
  id: "source-zelo-pdv",
  repositoryId: "repository-zelo-pdv",
  repositoryName: "zelopdv",
  productIds: [product.id],
  refName: "main",
  observedSha: "912304a06186b76c118af41381eef9a70876b3ee",
  indexedSha: "912304a06186b76c118af41381eef9a70876b3ee",
  activeSha: "912304a06186b76c118af41381eef9a70876b3ee",
  freshness: "current",
  syncState: "ready",
};

describe("KnowledgeSourcesPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage("pt-BR");
  });

  beforeEach(() => {
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
  });

  async function render(source: KnowledgeSourceSummary) {
    await act(async () => {
      root.render(
        <KnowledgeSourcesPanel
          products={[product]}
          repositories={[]}
          sources={[source]}
          busy={false}
          confirm={vi.fn(async () => true)}
          onCreate={vi.fn()}
          onSync={vi.fn()}
          onActivate={vi.fn()}
        />,
      );
    });
  }

  it("keeps equal revisions current while a background refresh is running", async () => {
    await render({ ...currentSource, syncState: "running" });

    expect(container.textContent).toContain("zelopdvAtualizado");
    expect(container.textContent).not.toContain("Atualização disponível");
    const button = container.querySelector<HTMLButtonElement>("article button");
    expect(button?.textContent).toContain("Atualizando");
    expect(button?.disabled).toBe(true);
  });

  it("offers a clear check action when the source is idle", async () => {
    await render(currentSource);

    const button = container.querySelector<HTMLButtonElement>("article button");
    expect(button?.textContent).toContain("Buscar atualizações");
    expect(button?.disabled).toBe(false);
    expect(container.textContent).toContain(
      "O conhecimento da IA corresponde à versão em produção.",
    );
  });
});
