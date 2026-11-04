import {
  apiRequest,
  isDemoModeRequested,
  LiveActionError,
} from "../../api/transport";
import { supabase } from "../../lib/supabase";

export const clientStages = ["lead", "proposta", "ativo", "churn"] as const;
export type ClientStage = (typeof clientStages)[number];

export const clientProducts = ["site", "sistema", "integracao"] as const;
export type ClientProduct = (typeof clientProducts)[number];

export const clientSources = [
  "manual",
  "diagnostico_marca",
  "agente",
  "importacao",
] as const;
export type ClientSource = (typeof clientSources)[number];

export type ClientEntryKind = "nota" | "reuniao" | "diagnostico" | "estagio";

export interface ClientUtm {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
}

export interface ClientSummary {
  id: string;
  name: string;
  contact: string | null;
  email: string | null;
  phone: string | null;
  site: string | null;
  stage: ClientStage;
  products: ClientProduct[];
  notes: string | null;
  source: ClientSource;
  area: string | null;
  specialty: string | null;
  registration: string | null;
  referral: string | null;
  utm: ClientUtm | null;
  external_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Client extends ClientSummary {
  body: string;
}

export interface ClientEntry {
  id: string;
  client_id: string;
  kind: ClientEntryKind;
  title: string | null;
  body: string;
  author_id: string | null;
  author_name: string;
  occurred_at: string;
  created_at: string;
}

export interface ClientIssue {
  id: string;
  identifier: string;
  title: string;
  status: string;
}

export interface ClientDetail extends Client {
  entries: ClientEntry[];
  issues: ClientIssue[];
}

export interface ClientPermissions {
  canEdit: boolean;
  canArchive: boolean;
}

/** Fields the app may write; `archived` toggles `archived_at`. */
export interface ClientInput {
  name?: string;
  contact?: string | null;
  email?: string | null;
  phone?: string | null;
  site?: string | null;
  stage?: ClientStage;
  products?: ClientProduct[];
  notes?: string | null;
  body?: string;
  area?: string | null;
  specialty?: string | null;
  registration?: string | null;
  referral?: string | null;
}

export type ClientPatch = ClientInput & { archived?: boolean };

export interface EntryInput {
  kind: "nota" | "reuniao";
  title?: string;
  body: string;
}

const day = 86_400_000;
const hour = 3_600_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const demoPermissions: ClientPermissions = {
  canEdit: true,
  canArchive: true,
};

function demoClient(
  id: string,
  name: string,
  overrides: Partial<Client> & { age: number },
): Client {
  const { age, ...rest } = overrides;
  return {
    id,
    name,
    contact: null,
    email: null,
    phone: null,
    site: null,
    stage: "lead",
    products: [],
    notes: null,
    body: "",
    source: "manual",
    area: null,
    specialty: null,
    registration: null,
    referral: null,
    utm: null,
    external_id: null,
    archived_at: null,
    created_at: ago(age),
    updated_at: ago(age),
    ...rest,
  };
}

/** In-memory data for `?demo=1`, which has no API behind it. */
let demoClients: Client[] = [
  demoClient("demo-client-1", "Dra. Helena Exemplo", {
    age: 3 * hour,
    contact: "Helena",
    phone: "(11) 98765-4321",
    area: "Odontologia",
    specialty: "Ortodontia",
    registration: "CRO-SP 000000",
    referral: "indicacao-exemplo",
    source: "diagnostico_marca",
    utm: { source: "instagram", medium: "bio", campaign: "diag-exemplo" },
    notes: "Quer site novo antes de abrir o segundo consultório.",
    body: [
      "Ortodontista que atende adultos e adolescentes. Quer ser lembrada como a profissional que explica tudo.",
      "",
      "## 1. Sobre você",
      "",
      "**Como os pacientes descrevem você?**",
      "Paciente, didática.",
      "",
      "**O que te diferencia?**",
      "- Alinhadores invisíveis",
      "- Plano de tratamento em vídeo",
      "",
      "## Proposta",
      "",
      "Escreva aqui escopo, valores e prazos.",
      "",
    ].join("\n"),
  }),
  demoClient("demo-client-2", "Rafael Exemplo", {
    age: 1.2 * day,
    contact: "Rafa",
    phone: "(21) 99812-0034",
    area: "Psicologia",
    specialty: "Clínica",
    source: "diagnostico_marca",
    referral: "carla-exemplo",
    body: "Atende em consultório próprio e online.\n",
  }),
  demoClient("demo-client-3", "Clínica Bem-Estar Exemplo", {
    age: 3 * day,
    stage: "proposta",
    contact: "Dr. Paulo",
    phone: "(31) 3222-1180",
    area: "Fisioterapia",
    products: ["site"],
    referral: "indicacao",
  }),
  demoClient("demo-client-4", "Dra. Marina Exemplo", {
    age: 7 * day,
    stage: "ativo",
    contact: "Marina",
    phone: "(41) 99701-5566",
    area: "Nutrição",
    specialty: "Esportiva",
    products: ["site", "integracao"],
  }),
  demoClient("demo-client-5", "Dr. André Exemplo", {
    age: 15 * day,
    stage: "ativo",
    contact: "André",
    email: "andre@exemplo.test",
    phone: "(11) 97444-2211",
    area: "Medicina",
    specialty: "Dermatologia",
    products: ["site", "sistema"],
    source: "diagnostico_marca",
  }),
  demoClient("demo-client-6", "Studio Fono Exemplo", {
    age: 60 * day,
    stage: "churn",
    contact: "Beatriz",
    phone: "(51) 98100-7788",
    area: "Fonoaudiologia",
    products: ["site"],
  }),
  demoClient("demo-client-7", "Dr. Caio Exemplo", {
    age: 20 * day,
    stage: "lead",
    area: "Odontologia",
    specialty: "Implantes",
    source: "agente",
    archived_at: ago(2 * day),
  }),
];

let demoEntries: ClientEntry[] = [
  {
    id: "demo-entry-1",
    client_id: "demo-client-1",
    kind: "reuniao",
    title: "Ligação de apresentação",
    body: "Topou reunião na quinta para ver exemplos de sites.",
    author_id: "demo-user",
    author_name: "Vinícius",
    occurred_at: ago(2 * hour),
    created_at: ago(2 * hour),
  },
  {
    id: "demo-entry-2",
    client_id: "demo-client-1",
    kind: "diagnostico",
    title: "Diagnóstico de marca recebido",
    body: "",
    author_id: null,
    author_name: "Site Diagium",
    occurred_at: ago(3 * hour),
    created_at: ago(3 * hour),
  },
];

const demoIssuePool: ClientIssue[] = [
  {
    id: "demo-issue-142",
    identifier: "MEND-142",
    title: "Enviar exemplos de sites",
    status: "todo",
  },
  {
    id: "demo-issue-150",
    identifier: "MEND-150",
    title: "Revisar proposta comercial",
    status: "in_progress",
  },
];
let demoLinks: Record<string, string[]> = {
  "demo-client-1": ["demo-issue-142"],
};

// Demo-only copy: the live API writes its own stage entries.
const demoStageNames: Record<ClientStage, string> = {
  lead: "Lead",
  proposta: "Proposta",
  ativo: "Ativo",
  churn: "Churn",
};

/**
 * `?demo=1` has no API behind it: the dev server answers with no JSON, or an
 * HTML 404/405 for writes. A real API error carries its own message.
 */
const noApiAnswer = (error: unknown) =>
  !(error instanceof LiveActionError && error.status) ||
  ((error.status === 404 || error.status === 405) &&
    error.message.startsWith("Mend API request failed"));

function demoSummary(client: Client): ClientSummary {
  const { body, ...summary } = client;
  void body;
  return { ...summary, products: [...summary.products] };
}

function demoDetail(id: string): ClientDetail {
  const client = demoClients.find((item) => item.id === id);
  if (!client) throw new LiveActionError("Not found", 404, "client_not_found");
  const issues = (demoLinks[id] ?? [])
    .map((issueId) => demoIssuePool.find((issue) => issue.id === issueId))
    .filter((issue): issue is ClientIssue => Boolean(issue));
  const entries = demoEntries
    .filter((entry) => entry.client_id === id)
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  return {
    ...client,
    products: [...client.products],
    entries: entries.map((entry) => ({ ...entry })),
    issues: issues.map((issue) => ({ ...issue })),
  };
}

function applyDemoPatch(id: string, patch: ClientPatch): Client {
  const index = demoClients.findIndex((item) => item.id === id);
  if (index === -1)
    throw new LiveActionError("Not found", 404, "client_not_found");
  const { archived, ...fields } = patch;
  const current = demoClients[index];
  if (fields.stage && fields.stage !== current.stage) {
    demoEntries.push({
      id: `demo-entry-${crypto.randomUUID()}`,
      client_id: id,
      kind: "estagio",
      title: `Estágio: ${demoStageNames[fields.stage]}`,
      body: "",
      author_id: "demo-user",
      author_name: "Você",
      occurred_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });
  }
  const next: Client = {
    ...current,
    ...fields,
    archived_at:
      archived === undefined
        ? current.archived_at
        : archived
          ? new Date().toISOString()
          : null,
    updated_at: new Date().toISOString(),
  };
  demoClients[index] = next;
  return next;
}

async function request<T>(
  path: string,
  init: RequestInit | undefined,
  demo: () => T,
  { expectBody = true } = {},
): Promise<T> {
  try {
    const result = await apiRequest<T>(path, init);
    // No JSON at all (the dev server's HTML page) is no answer in demo mode.
    if (expectBody && result === undefined && isDemoModeRequested())
      return demo();
    return result;
  } catch (error) {
    if (isDemoModeRequested() && noApiAnswer(error)) return demo();
    throw error;
  }
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}

function assertList(
  result: { data?: unknown; permissions?: unknown } | undefined,
): asserts result is { data: ClientSummary[]; permissions: ClientPermissions } {
  if (!result || !Array.isArray(result.data))
    throw new LiveActionError("Invalid clients response.");
}

/** Best effort: the signed-in user decides which timeline entries they can delete. */
export async function currentUserId(): Promise<string | null> {
  if (isDemoModeRequested() && !supabase) return "demo-user";
  try {
    const session = await supabase?.auth.getSession();
    return session?.data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

export const clientsApi = {
  list: async (
    archived = false,
  ): Promise<{ data: ClientSummary[]; permissions: ClientPermissions }> => {
    const result = await request<
      { data: ClientSummary[]; permissions: ClientPermissions } | undefined
    >(`/api/clients${archived ? "?archived=1" : ""}`, undefined, () => ({
      data: demoClients
        .filter((client) => archived || !client.archived_at)
        .map(demoSummary),
      permissions: demoPermissions,
    }));
    assertList(result);
    return {
      data: result.data,
      permissions: {
        canEdit: Boolean(result.permissions?.canEdit),
        canArchive: Boolean(result.permissions?.canArchive),
      },
    };
  },
  get: async (
    id: string,
  ): Promise<{ data: ClientDetail; permissions: ClientPermissions }> => {
    const result = await request<
      { data: ClientDetail; permissions: ClientPermissions } | undefined
    >(`/api/clients/${encodeURIComponent(id)}`, undefined, () => ({
      data: demoDetail(id),
      permissions: demoPermissions,
    }));
    if (!result?.data || typeof result.data.id !== "string")
      throw new LiveActionError("Invalid client response.");
    return {
      data: {
        ...result.data,
        products: result.data.products ?? [],
        entries: result.data.entries ?? [],
        issues: result.data.issues ?? [],
      },
      permissions: {
        canEdit: Boolean(result.permissions?.canEdit),
        canArchive: Boolean(result.permissions?.canArchive),
      },
    };
  },
  create: async (input: ClientInput): Promise<Client> => {
    const result = await request<{ data: Client } | undefined>(
      "/api/clients",
      jsonInit("POST", input),
      () => {
        const created = demoClient(`demo-client-${crypto.randomUUID()}`, "", {
          age: 0,
        });
        const client: Client = {
          ...created,
          ...input,
          name: input.name ?? "",
          products: input.products ?? [],
          body: input.body ?? "",
        } as Client;
        demoClients = [client, ...demoClients];
        return { data: client };
      },
    );
    if (!result?.data) throw new LiveActionError("Invalid client response.");
    return result.data;
  },
  update: async (id: string, patch: ClientPatch): Promise<Client> => {
    const result = await request<{ data: Client } | undefined>(
      `/api/clients/${encodeURIComponent(id)}`,
      jsonInit("PATCH", patch),
      () => ({ data: applyDemoPatch(id, patch) }),
    );
    if (!result?.data) throw new LiveActionError("Invalid client response.");
    return result.data;
  },
  remove: async (id: string): Promise<void> => {
    await request<void>(
      `/api/clients/${encodeURIComponent(id)}`,
      { method: "DELETE" },
      () => {
        demoClients = demoClients.filter((client) => client.id !== id);
      },
      { expectBody: false },
    );
  },
  addEntry: async (id: string, input: EntryInput): Promise<ClientEntry> => {
    const result = await request<{ data: ClientEntry } | undefined>(
      `/api/clients/${encodeURIComponent(id)}/entries`,
      jsonInit("POST", input),
      () => {
        const entry: ClientEntry = {
          id: `demo-entry-${crypto.randomUUID()}`,
          client_id: id,
          kind: input.kind,
          title: input.title?.trim() || null,
          body: input.body,
          author_id: "demo-user",
          author_name: "Você",
          occurred_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        };
        demoEntries = [...demoEntries, entry];
        return { data: entry };
      },
    );
    if (!result?.data) throw new LiveActionError("Invalid entry response.");
    return result.data;
  },
  removeEntry: async (id: string, entryId: string): Promise<void> => {
    await request<void>(
      `/api/clients/${encodeURIComponent(id)}/entries/${encodeURIComponent(entryId)}`,
      { method: "DELETE" },
      () => {
        demoEntries = demoEntries.filter((entry) => entry.id !== entryId);
      },
      { expectBody: false },
    );
  },
  linkIssue: async (id: string, identifier: string): Promise<void> => {
    await request<unknown>(
      `/api/clients/${encodeURIComponent(id)}/issues`,
      jsonInit("POST", { identifier }),
      () => {
        const normalized = identifier.trim().toUpperCase();
        let issue = demoIssuePool.find(
          (item) => item.identifier === normalized,
        );
        if (!issue) {
          if (!/^[A-Z]+-\d+$/.test(normalized))
            throw new LiveActionError("Not found", 404, "issue_not_found");
          issue = {
            id: `demo-issue-${normalized}`,
            identifier: normalized,
            title: normalized,
            status: "todo",
          };
          demoIssuePool.push(issue);
        }
        const links = demoLinks[id] ?? [];
        if (!links.includes(issue.id))
          demoLinks = { ...demoLinks, [id]: [...links, issue.id] };
      },
      { expectBody: false },
    );
  },
  unlinkIssue: async (id: string, issueId: string): Promise<void> => {
    await request<void>(
      `/api/clients/${encodeURIComponent(id)}/issues/${encodeURIComponent(issueId)}`,
      { method: "DELETE" },
      () => {
        demoLinks = {
          ...demoLinks,
          [id]: (demoLinks[id] ?? []).filter((item) => item !== issueId),
        };
      },
      { expectBody: false },
    );
  },
};
