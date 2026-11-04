import {
  clientSources,
  clientStages,
  type ClientSource,
  type ClientStage,
  type ClientSummary,
} from "./api";

export interface ClientFilters {
  q: string;
  stage: ClientStage | "";
  area: string;
  source: ClientSource | "";
  archived: boolean;
}

export const emptyFilters: ClientFilters = {
  q: "",
  stage: "",
  area: "",
  source: "",
  archived: false,
};

const weekMs = 7 * 86_400_000;

function fold(text: string | null | undefined) {
  return (text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function digits(text: string | null | undefined) {
  return (text ?? "").replace(/\D/g, "");
}

export function matchesSearch(client: ClientSummary, query: string) {
  const needle = fold(query).trim();
  if (!needle) return true;
  const hay = [client.name, client.contact, client.email, client.phone].map(
    fold,
  );
  if (hay.some((value) => value.includes(needle))) return true;
  const needleDigits = digits(query);
  return (
    needleDigits.length >= 3 && digits(client.phone).includes(needleDigits)
  );
}

export function filterClients(
  clients: ClientSummary[],
  filters: ClientFilters,
): ClientSummary[] {
  return clients
    .filter((client) => filters.archived || !client.archived_at)
    .filter((client) => !filters.stage || client.stage === filters.stage)
    .filter((client) => !filters.area || client.area === filters.area)
    .filter((client) => !filters.source || client.source === filters.source)
    .filter((client) => matchesSearch(client, filters.q))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

/** Active (not archived) clients per stage. */
export function stageCounts(
  clients: ClientSummary[],
): Record<ClientStage, number> {
  const counts: Record<ClientStage, number> = {
    lead: 0,
    proposta: 0,
    ativo: 0,
    churn: 0,
  };
  for (const client of clients)
    if (!client.archived_at && client.stage in counts)
      counts[client.stage] += 1;
  return counts;
}

/** Leads created in the last 7 days that came from the brand diagnostic. */
export function recentDiagnosticLeads(
  clients: ClientSummary[],
  now = Date.now(),
) {
  return clients.filter(
    (client) =>
      !client.archived_at &&
      client.stage === "lead" &&
      client.source === "diagnostico_marca" &&
      now - new Date(client.created_at).getTime() <= weekMs,
  ).length;
}

/** Distinct, sorted area names present in the data. */
export function areaOptions(clients: ClientSummary[]): string[] {
  const areas = new Set<string>();
  for (const client of clients) {
    const area = client.area?.trim();
    if (area) areas.add(area);
  }
  return [...areas].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function filtersFromParams(params: URLSearchParams): ClientFilters {
  const stage = params.get("estagio") ?? "";
  const source = params.get("origem") ?? "";
  return {
    q: params.get("q") ?? "",
    stage: (clientStages as readonly string[]).includes(stage)
      ? (stage as ClientStage)
      : "",
    area: params.get("area") ?? "",
    source: (clientSources as readonly string[]).includes(source)
      ? (source as ClientSource)
      : "",
    archived: params.get("arquivados") === "1",
  };
}

export function filtersToParams(filters: ClientFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q);
  if (filters.stage) params.set("estagio", filters.stage);
  if (filters.area) params.set("area", filters.area);
  if (filters.source) params.set("origem", filters.source);
  if (filters.archived) params.set("arquivados", "1");
  return params;
}

/** `https://wa.me/<digits>`, with Brazil's 55 added to 10 or 11 digit numbers. */
export function whatsappUrl(phone: string | null | undefined): string | null {
  const all = digits(phone);
  if (!all) return null;
  const full = all.length === 10 || all.length === 11 ? `55${all}` : all;
  return `https://wa.me/${full}`;
}

/** Keeps `?demo=1` on in-app links, since the demo has no session to remember it. */
export function demoSearch(search: string): string {
  return new URLSearchParams(search).get("demo") === "1" ? "?demo=1" : "";
}

export function formatUtm(utm: ClientSummary["utm"]): string {
  if (!utm) return "";
  return [utm.source, utm.medium, utm.campaign]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" / ");
}

export function productsEqual(a: string[], b: string[]) {
  return a.length === b.length && a.every((item) => b.includes(item));
}
