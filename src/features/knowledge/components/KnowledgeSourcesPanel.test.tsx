// @vitest-environment jsdom
// i18n-exempt: tests render translated output through the shared i18n instance.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
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

const menuProduct: KnowledgeProduct = {
  id: "product-zelo-menu",
  key: "zelomenu",
  name: "ZeloMenu",
  description: "Cardápio",
  aliases: ["cardápio digital"],
  status: "active",
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
        <MemoryRouter>
          <KnowledgeSourcesPanel
            products={[product]}
            repositories={[]}
            githubRepositories={[]}
            sources={[source]}
            selectedProductId="all"
            busy={false}
            confirm={vi.fn(async () => true)}
            onCreate={vi.fn(async () => true)}
            onSync={vi.fn()}
            onActivate={vi.fn()}
            onRemove={vi.fn()}
          />
        </MemoryRouter>,
      );
    });
  }

  it("keeps equal revisions current while a background refresh is running", async () => {
    await render({ ...currentSource, syncState: "running" });

    expect(container.textContent).toContain("zelopdvCarregando conhecimento");
    expect(container.textContent).toContain(
      "Você pode sair desta página; o Mend continuará em segundo plano.",
    );
    expect(container.textContent).not.toContain("Atualização disponível");
    expect(
      container
        .querySelector('[role="progressbar"]')
        ?.getAttribute("aria-valuetext"),
    ).toBe("Lendo e indexando o repositório");
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

  it("explains when a connected source has not started its first load", async () => {
    await render({
      ...currentSource,
      observedSha: undefined,
      indexedSha: undefined,
      activeSha: undefined,
      freshness: "empty",
      syncState: "idle",
    });

    expect(container.textContent).toContain(
      "A fonte está conectada, mas a primeira carga ainda não começou.",
    );
    expect(
      container.querySelector<HTMLButtonElement>("article button")?.textContent,
    ).toContain("Iniciar primeira carga");
  });

  it("distinguishes an indexed revision that is waiting for activation", async () => {
    await render({
      ...currentSource,
      activeSha: undefined,
      freshness: "empty",
      syncState: "ready",
    });

    expect(container.textContent).toContain("Pronto para ativar");
    expect(container.textContent).toContain(
      "A primeira carga terminou. Ative esta versão",
    );
    expect(container.textContent).toContain("Usar esta versão");
    expect(container.textContent).not.toContain("Iniciar primeira carga");
  });

  it("suggests the product repository before exposing unrelated repositories", async () => {
    const onCreate = vi.fn(async () => true);
    await act(async () => {
      root.render(
        <MemoryRouter>
          <KnowledgeSourcesPanel
            products={[product, menuProduct]}
            repositories={[]}
            githubRepositories={[
              { owner: "kdo-vini", repo: "mend", defaultBranch: "main" },
              { owner: "kdo-vini", repo: "zelomenu", defaultBranch: "main" },
            ]}
            sources={[currentSource]}
            selectedProductId={menuProduct.id}
            busy={false}
            confirm={vi.fn(async () => true)}
            onCreate={onCreate}
            onSync={vi.fn()}
            onActivate={vi.fn()}
            onRemove={vi.fn()}
          />
        </MemoryRouter>,
      );
    });

    const repositorySelect = container.querySelectorAll("[role=combobox]")[1];
    await act(async () => (repositorySelect as HTMLButtonElement).click());
    expect(container.textContent).toContain("kdo-vini/zelomenu");
    expect(
      container.querySelector('[role="option"]')?.parentElement?.textContent,
    ).not.toContain("kdo-vini/mend");

    const menuOption = [...container.querySelectorAll('[role="option"]')].find(
      (option) => option.textContent?.includes("kdo-vini/zelomenu"),
    );
    await act(async () => (menuOption as HTMLButtonElement).click());
    expect(container.textContent).toContain(
      "O Mend usará kdo-vini/zelomenu para responder clientes sobre ZeloMenu.",
    );

    const connect = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Conectar ao produto"),
    );
    await act(async () => (connect as HTMLButtonElement).click());
    expect(onCreate).toHaveBeenCalledWith({
      githubOwner: "kdo-vini",
      githubRepo: "zelomenu",
      productId: menuProduct.id,
      refName: "main",
    });
  });
});
