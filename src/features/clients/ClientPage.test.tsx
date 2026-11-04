// @vitest-environment jsdom
// i18n-exempt: test renders translated output via the shared i18n instance, not useTranslation().

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import "../../i18n";
import type { ClientDetail } from "./api";

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    currentUserId: vi.fn(async () => "user-1"),
    clientsApi: {
      ...actual.clientsApi,
      get: vi.fn(),
      update: vi.fn(),
      addEntry: vi.fn(),
    },
  };
});

import { clientsApi } from "./api";
import { ClientPage } from "./ClientPage";

const detail: ClientDetail = {
  id: "c1",
  name: "Dra. Helena Teste",
  contact: "Helena",
  email: null,
  phone: "(11) 98765-4321",
  site: null,
  stage: "lead",
  products: ["site"],
  notes: null,
  source: "diagnostico_marca",
  area: "Odontologia",
  specialty: "Ortodontia",
  registration: null,
  referral: null,
  utm: { source: "instagram", medium: "bio" },
  external_id: null,
  archived_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  body: "Resumo da cliente.\n\n## Proposta\n\nEscopo a definir.\n",
  entries: [
    {
      id: "e1",
      client_id: "c1",
      kind: "reuniao",
      title: "Ligação",
      body: "Topou **reunião**.",
      author_id: "user-1",
      author_name: "Vinícius",
      occurred_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    },
  ],
  issues: [
    {
      id: "i1",
      identifier: "MEND-142",
      title: "Enviar exemplos",
      status: "todo",
    },
  ],
};

let container: HTMLDivElement;
let root: Root;

async function render(canEdit = true, override: Partial<ClientDetail> = {}) {
  vi.mocked(clientsApi.get).mockResolvedValue({
    data: { ...detail, ...override },
    permissions: { canEdit, canArchive: canEdit },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/clientes/c1"]}>
        <Routes>
          <Route path="/clientes/:id" element={<ClientPage />} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

const buttonWithText = (text: string) =>
  Array.from(container.querySelectorAll("button")).find((node) =>
    node.textContent?.includes(text),
  ) as HTMLButtonElement | undefined;

describe("ClientPage", () => {
  beforeAll(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("renders the header, properties, sections, timeline and linked issues", async () => {
    await render();
    expect(container.querySelector("h1")?.textContent).toBe(
      "Dra. Helena Teste",
    );
    expect(container.textContent).toContain("Chegou pelo Diagnóstico de marca");
    expect(container.textContent).toContain("utm: instagram / bio");
    const whatsapp = container.querySelector<HTMLAnchorElement>(
      "a[href^='https://wa.me/']",
    );
    expect(whatsapp?.getAttribute("href")).toBe("https://wa.me/5511987654321");
    expect(whatsapp?.getAttribute("rel")).toContain("noopener");

    const triggers = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".disclosure-trigger"),
    );
    expect(triggers.map((node) => node.getAttribute("aria-expanded"))).toEqual([
      "true",
      "false",
    ]);
    expect(
      container.querySelector(".clients-timeline strong")?.textContent,
    ).toBe("reunião");
    expect(
      container
        .querySelector<HTMLAnchorElement>(".clients-issues a")
        ?.getAttribute("href"),
    ).toBe("/issues/MEND-142");
  });

  it("hides the WhatsApp link without a phone", async () => {
    await render(true, { phone: null });
    expect(container.querySelector("a[href^='https://wa.me/']")).toBeNull();
  });

  it("saves one edited section through the body", async () => {
    vi.mocked(clientsApi.update).mockImplementation(async (_id, patch) => ({
      ...detail,
      ...patch,
      body: patch.body ?? detail.body,
    }));
    await render();
    await act(async () => buttonWithText("Editar seção")!.click());
    const textarea = container.querySelector<HTMLTextAreaElement>(
      ".clients-editor-input",
    )!;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!;
    await act(async () => {
      setter.call(textarea, "Resumo novo.");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => buttonWithText("Salvar")!.click());
    expect(clientsApi.update).toHaveBeenCalledWith("c1", {
      body: "Resumo novo.\n\n## Proposta\n\nEscopo a definir.\n",
    });
  });

  it("hides every edit affordance for read-only members", async () => {
    await render(false);
    expect(buttonWithText("Editar seção")).toBeUndefined();
    expect(buttonWithText("Editar tudo em markdown")).toBeUndefined();
    expect(buttonWithText("Nova seção")).toBeUndefined();
    expect(buttonWithText("Ligar chamado")).toBeUndefined();
    expect(container.querySelector(".clients-composer")).toBeNull();
    expect(container.querySelector("[aria-label='Editar Contato']")).toBeNull();
    expect(container.querySelector("[aria-haspopup='menu']")).toBeNull();
    expect(container.querySelector("[role='combobox']")).toBeNull();
  });

  it("explains a missing client", async () => {
    const { LiveActionError } = await import("../../api/transport");
    vi.mocked(clientsApi.get).mockRejectedValue(
      new LiveActionError("nope", 404),
    );
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/clientes/zzz"]}>
          <Routes>
            <Route path="/clientes/:id" element={<ClientPage />} />
          </Routes>
        </MemoryRouter>,
      );
    });
    expect(container.textContent).toContain("Cliente não encontrado");
  });
});
