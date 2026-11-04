// @vitest-environment jsdom
// i18n-exempt: test renders translated output via the shared i18n instance, not useTranslation().

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import "../../i18n";
import type { ClientSummary } from "./api";

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    clientsApi: { ...actual.clientsApi, list: vi.fn(), create: vi.fn() },
  };
});

import { clientsApi } from "./api";
import { ClientsPage } from "./ClientsPage";

const daysAgo = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toISOString();

function client(overrides: Partial<ClientSummary>): ClientSummary {
  return {
    id: overrides.name ?? "x",
    name: "Cliente",
    contact: null,
    email: null,
    phone: null,
    site: null,
    stage: "lead",
    products: [],
    notes: null,
    source: "manual",
    area: null,
    specialty: null,
    registration: null,
    referral: null,
    utm: null,
    external_id: null,
    archived_at: null,
    created_at: daysAgo(30),
    updated_at: daysAgo(30),
    ...overrides,
  };
}

const data = [
  client({
    id: "h",
    name: "Helena Teste",
    contact: "Helena",
    stage: "lead",
    source: "diagnostico_marca",
    area: "Odontologia",
    created_at: daysAgo(1),
    updated_at: daysAgo(1),
  }),
  client({ id: "r", name: "Rafael Teste", stage: "lead", area: "Psicologia" }),
  client({ id: "m", name: "Marina Teste", stage: "ativo", area: "Nutrição" }),
];

let container: HTMLDivElement;
let root: Root;
let location = "";

function LocationProbe() {
  const current = useLocation();
  location = `${current.pathname}${current.search}`;
  return null;
}

async function render(canEdit = true, initial = "/clientes") {
  vi.mocked(clientsApi.list).mockResolvedValue({
    data,
    permissions: { canEdit, canArchive: canEdit },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[initial]}>
        <ClientsPage />
        <LocationProbe />
      </MemoryRouter>,
    );
  });
}

const buttonWithText = (text: string) =>
  Array.from(container.querySelectorAll("button")).find((node) =>
    node.textContent?.includes(text),
  ) as HTMLButtonElement | undefined;

describe("ClientsPage", () => {
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

  it("shows the lead funnel as the hero and every client as a keyboard link", async () => {
    await render();
    expect(container.querySelector(".clients-deep-hero")?.textContent).toBe(
      "2",
    );
    expect(container.querySelector(".clients-deep-sub")?.textContent).toContain(
      "1 chegou esta semana",
    );
    const links = Array.from(
      container.querySelectorAll<HTMLAnchorElement>(".clients-name-link"),
    );
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/clientes/h",
      "/clientes/r",
      "/clientes/m",
    ]);
    expect(container.textContent).toContain("3 clientes");
  });

  it("filters by stage from the funnel and keeps the filter in the URL", async () => {
    await render();
    const funnel = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".clients-funnel button"),
    );
    expect(funnel.map((node) => node.getAttribute("aria-pressed"))).toEqual([
      "false",
      "false",
      "false",
      "false",
    ]);
    await act(async () => funnel[2].click());
    expect(location).toBe("/clientes?estagio=ativo");
    expect(
      container
        .querySelectorAll<HTMLButtonElement>(".clients-funnel button")[2]
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(container.querySelectorAll(".clients-name-link")).toHaveLength(1);
    expect(container.textContent).toContain("1 cliente");
  });

  it("restores filters from the URL and offers to clear an empty result", async () => {
    await render(true, "/clientes?q=zzz");
    expect(container.textContent).toContain("Nenhum cliente encontrado");
    await act(async () => buttonWithText("Limpar filtros")!.click());
    expect(location).toBe("/clientes");
    expect(container.querySelectorAll(".clients-name-link")).toHaveLength(3);
  });

  it("only offers a new client to people who can edit", async () => {
    await render(true);
    expect(buttonWithText("Novo cliente")).toBeDefined();
    await act(async () => root.unmount());
    container.remove();
    await render(false);
    expect(buttonWithText("Novo cliente")).toBeUndefined();
  });

  it("shows a retry state when the list cannot load", async () => {
    vi.mocked(clientsApi.list).mockRejectedValue(new Error("down"));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/clientes"]}>
          <ClientsPage />
        </MemoryRouter>,
      );
    });
    expect(container.textContent).toContain(
      "Não foi possível carregar os clientes",
    );
    expect(
      container.querySelector(".resource-state-error button"),
    ).not.toBeNull();
  });
});
