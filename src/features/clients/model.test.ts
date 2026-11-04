import { describe, expect, it } from "vitest";
import type { ClientSummary } from "./api";
import {
  areaOptions,
  emptyFilters,
  filterClients,
  filtersFromParams,
  filtersToParams,
  formatUtm,
  recentDiagnosticLeads,
  stageCounts,
  whatsappUrl,
} from "./model";

const now = Date.parse("2026-11-04T12:00:00Z");
const days = (n: number) => new Date(now - n * 86_400_000).toISOString();

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
    created_at: days(30),
    updated_at: days(30),
    ...overrides,
  };
}

const clients = [
  client({
    name: "Helena",
    stage: "lead",
    source: "diagnostico_marca",
    area: "Odontologia",
    phone: "(11) 98765-4321",
    created_at: days(1),
    updated_at: days(1),
  }),
  client({
    name: "Rafael",
    stage: "lead",
    source: "diagnostico_marca",
    area: "Psicologia",
    created_at: days(10),
    updated_at: days(2),
  }),
  client({ name: "Marina", stage: "ativo", area: "Nutrição", contact: "Mari" }),
  client({ name: "André", stage: "churn", area: "Medicina" }),
  client({
    name: "Arquivado",
    stage: "lead",
    source: "diagnostico_marca",
    created_at: days(1),
    archived_at: days(0),
  }),
];

describe("stageCounts", () => {
  it("counts non-archived clients per stage", () => {
    expect(stageCounts(clients)).toEqual({
      lead: 2,
      proposta: 0,
      ativo: 1,
      churn: 1,
    });
  });
});

describe("recentDiagnosticLeads", () => {
  it("counts only recent, non-archived diagnostic leads", () => {
    expect(recentDiagnosticLeads(clients, now)).toBe(1);
  });
});

describe("filterClients", () => {
  it("hides archived clients unless asked and sorts by last update", () => {
    expect(filterClients(clients, emptyFilters).map((c) => c.name)).toEqual([
      "Helena",
      "Rafael",
      "Marina",
      "André",
    ]);
    expect(
      filterClients(clients, { ...emptyFilters, archived: true }),
    ).toHaveLength(5);
  });

  it("filters by stage, area and source", () => {
    expect(
      filterClients(clients, { ...emptyFilters, stage: "lead" }),
    ).toHaveLength(2);
    expect(
      filterClients(clients, { ...emptyFilters, area: "Nutrição" }).map(
        (c) => c.name,
      ),
    ).toEqual(["Marina"]);
    expect(
      filterClients(clients, { ...emptyFilters, source: "diagnostico_marca" }),
    ).toHaveLength(2);
  });

  it("searches name, contact, email and phone ignoring accents and case", () => {
    const search = (q: string) =>
      filterClients(clients, { ...emptyFilters, q }).map((c) => c.name);
    expect(search("andre")).toEqual(["André"]);
    expect(search("MARI")).toEqual(["Marina"]);
    expect(search("98765")).toEqual(["Helena"]);
    expect(search("11 98765")).toEqual(["Helena"]);
    expect(search("zzz")).toEqual([]);
  });
});

describe("areaOptions", () => {
  it("derives sorted distinct areas", () => {
    expect(areaOptions(clients)).toEqual([
      "Medicina",
      "Nutrição",
      "Odontologia",
      "Psicologia",
    ]);
  });
});

describe("filters in the URL", () => {
  it("round-trips and ignores unknown values", () => {
    const filters = {
      q: "ana",
      stage: "ativo" as const,
      area: "Medicina",
      source: "agente" as const,
      archived: true,
    };
    expect(filtersFromParams(filtersToParams(filters))).toEqual(filters);
    expect(
      filtersFromParams(new URLSearchParams("estagio=x&origem=y")),
    ).toEqual(emptyFilters);
    expect(filtersToParams(emptyFilters).toString()).toBe("");
  });
});

describe("whatsappUrl", () => {
  it("adds 55 to 10 and 11 digit numbers", () => {
    expect(whatsappUrl("(11) 98765-4321")).toBe("https://wa.me/5511987654321");
    expect(whatsappUrl("(31) 3222-1180")).toBe("https://wa.me/553132221180");
  });

  it("keeps numbers that already carry a country code and skips empty ones", () => {
    expect(whatsappUrl("+55 11 98765-4321")).toBe(
      "https://wa.me/5511987654321",
    );
    expect(whatsappUrl("")).toBeNull();
    expect(whatsappUrl(null)).toBeNull();
  });
});

describe("formatUtm", () => {
  it("joins the filled parts", () => {
    expect(
      formatUtm({ source: "instagram", medium: "bio", campaign: "" }),
    ).toBe("instagram / bio");
    expect(formatUtm(null)).toBe("");
  });
});
