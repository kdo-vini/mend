import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiRouteModuleContext } from "./api-router.js";
import { ApiHttpError } from "./api-router.js";
import { issueIdentifierSchema } from "./issue-service.js";

/**
 * Clientes: the Diagium client panel (contract in docs/engineering/CLIENTES.md).
 * The user-scoped port runs under RLS; the agent store and the ingestion
 * endpoint use the service role and scope every query by workspace themselves.
 */
export const clientStages = ["lead", "proposta", "ativo", "churn"] as const;
export const clientProducts = ["site", "sistema", "integracao"] as const;
export const clientEntryKinds = [
  "nota",
  "reuniao",
  "diagnostico",
  "estagio",
] as const;
export type ClientStage = (typeof clientStages)[number];
export type ClientProduct = (typeof clientProducts)[number];
export type ClientEntryKind = (typeof clientEntryKinds)[number];

export interface Client {
  id: string;
  workspace_id: string;
  name: string;
  contact: string | null;
  email: string | null;
  phone: string | null;
  site: string | null;
  stage: ClientStage;
  products: ClientProduct[];
  notes: string | null;
  body: string;
  source: "manual" | "diagnostico_marca" | "agente" | "importacao";
  area: string | null;
  specialty: string | null;
  registration: string | null;
  referral: string | null;
  utm: Record<string, unknown>;
  external_id: string | null;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
export type ClientSummary = Omit<Client, "body">;

export interface ClientEntry {
  id: string;
  client_id: string;
  kind: ClientEntryKind;
  title: string | null;
  body: string;
  author_id: string | null;
  author_name: string;
  external_id: string | null;
  occurred_at: string;
  created_at: string;
}

export interface ClientIssueRef {
  id: string;
  identifier: string;
  title: string;
  status: string;
}

export const stageLabels: Record<ClientStage, string> = {
  lead: "Lead",
  proposta: "Proposta",
  ativo: "Ativo",
  churn: "Churn",
};

export function stageEntryTitle(stage: ClientStage): string {
  return `Estágio: ${stageLabels[stage]}`;
}

/** Empty strings are stored as null, like an empty Notion cell. */
export function emptyToNull(value: string | null | undefined) {
  if (value === undefined) return undefined;
  const trimmed = value === null ? "" : value.trim();
  return trimmed === "" ? null : trimmed;
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable();

const productsField = z
  .array(z.enum(clientProducts))
  .max(clientProducts.length)
  .transform((values) => [...new Set(values)]);

const clientFields = {
  name: z.string().trim().min(1).max(200),
  contact: optionalText(200),
  email: optionalText(320),
  phone: optionalText(40),
  site: optionalText(500),
  stage: z.enum(clientStages),
  products: productsField,
  notes: optionalText(2000),
  body: z.string().max(100_000),
  area: optionalText(120),
  specialty: optionalText(200),
  registration: optionalText(120),
  referral: optionalText(200),
};

export const clientCreateSchema = z
  .object({ ...partialShape(clientFields), name: clientFields.name })
  .strict();
export const clientPatchSchema = z
  .object({
    ...partialShape(clientFields),
    archived: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");
export const clientEntryCreateSchema = z
  .object({
    kind: z.enum(["nota", "reuniao"]),
    title: optionalText(200).optional(),
    body: z.string().trim().min(1).max(100_000),
  })
  .strict();
export const clientIssueLinkSchema = z
  .object({ identifier: issueIdentifierSchema })
  .strict();

function partialShape<T extends z.ZodRawShape>(shape: T) {
  return Object.fromEntries(
    Object.entries(shape).map(([key, schema]) => [key, schema.optional()]),
  ) as { [K in keyof T]: z.ZodOptional<T[K]> };
}

export type ClientCreateInput = z.infer<typeof clientCreateSchema>;
export type ClientPatchInput = z.infer<typeof clientPatchSchema>;

/** Columns a caller may write; undefined means "leave as is". */
export type ClientWriteFields = Partial<
  Pick<
    Client,
    | "name"
    | "contact"
    | "email"
    | "phone"
    | "site"
    | "stage"
    | "products"
    | "notes"
    | "body"
    | "area"
    | "specialty"
    | "registration"
    | "referral"
  >
>;

export const clientColumns =
  "id,workspace_id,name,contact,email,phone,site,stage,products,notes,body,source,area,specialty,registration,referral,utm,external_id,archived_at,created_by,created_at,updated_at";
export const clientSummaryColumns = clientColumns.replace(",body", "");
export const clientEntryColumns =
  "id,client_id,kind,title,body,author_id,author_name,external_id,occurred_at,created_at";
const issueRefColumns = "id,identifier,title,status";

export interface ClientEntryInput {
  workspaceId: string;
  clientId: string;
  kind: ClientEntryKind;
  title: string | null;
  body: string;
  authorId: string | null;
  authorName: string;
}

export interface ClientsPort {
  list(
    workspaceId: string,
    options: { archived: boolean },
  ): Promise<ClientSummary[]>;
  get(workspaceId: string, id: string): Promise<Client | null>;
  entries(workspaceId: string, clientId: string): Promise<ClientEntry[]>;
  issues(workspaceId: string, clientId: string): Promise<ClientIssueRef[]>;
  create(
    workspaceId: string,
    userId: string,
    input: ClientCreateInput,
  ): Promise<Client>;
  update(
    workspaceId: string,
    id: string,
    fields: ClientWriteFields & { archived_at?: string | null },
  ): Promise<Client | null>;
  remove(workspaceId: string, id: string): Promise<boolean>;
  addEntry(input: ClientEntryInput): Promise<ClientEntry>;
  removeEntry(
    workspaceId: string,
    clientId: string,
    entryId: string,
  ): Promise<boolean>;
  linkIssue(
    workspaceId: string,
    clientId: string,
    identifier: string,
  ): Promise<ClientIssueRef | null>;
  unlinkIssue(
    workspaceId: string,
    clientId: string,
    issueId: string,
  ): Promise<boolean>;
}

function failed(error: { code?: string | undefined }): never {
  if (error.code === "42501")
    throw new ApiHttpError(
      403,
      "clients_forbidden",
      "Você não tem permissão para esta ação em clientes.",
    );
  if (error.code === "23505")
    throw new ApiHttpError(
      409,
      "clients_conflict",
      "Já existe um registro com esses dados.",
    );
  throw new ApiHttpError(
    503,
    "clients_unavailable",
    "Não foi possível acessar os clientes.",
  );
}

function checked<T>(result: {
  data: T;
  error: { code?: string | undefined } | null;
}): T {
  if (result.error) failed(result.error);
  return result.data;
}

export class SupabaseClientsAdapter implements ClientsPort {
  constructor(private client: SupabaseClient) {}

  async list(workspaceId: string, options: { archived: boolean }) {
    let query = this.client
      .from("clients")
      .select(clientSummaryColumns)
      .eq("workspace_id", workspaceId);
    query = options.archived
      ? query.not("archived_at", "is", null)
      : query.is("archived_at", null);
    return (checked(
      await query.order("updated_at", { ascending: false }).limit(1000),
    ) ?? []) as unknown as ClientSummary[];
  }

  async get(workspaceId: string, id: string) {
    return checked(
      await this.client
        .from("clients")
        .select(clientColumns)
        .eq("workspace_id", workspaceId)
        .eq("id", id)
        .maybeSingle(),
    ) as unknown as Client | null;
  }

  async entries(workspaceId: string, clientId: string) {
    return (checked(
      await this.client
        .from("client_entries")
        .select(clientEntryColumns)
        .eq("workspace_id", workspaceId)
        .eq("client_id", clientId)
        .order("occurred_at", { ascending: false })
        .limit(200),
    ) ?? []) as unknown as ClientEntry[];
  }

  async issues(workspaceId: string, clientId: string) {
    return (checked(
      await this.client
        .from("issues")
        .select(issueRefColumns)
        .eq("workspace_id", workspaceId)
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(200),
    ) ?? []) as unknown as ClientIssueRef[];
  }

  async create(workspaceId: string, userId: string, input: ClientCreateInput) {
    return checked(
      await this.client
        .from("clients")
        .insert({
          ...input,
          workspace_id: workspaceId,
          created_by: userId,
          source: "manual",
        })
        .select(clientColumns)
        .single(),
    ) as unknown as Client;
  }

  async update(
    workspaceId: string,
    id: string,
    fields: ClientWriteFields & { archived_at?: string | null },
  ) {
    return checked(
      await this.client
        .from("clients")
        .update(fields)
        .eq("workspace_id", workspaceId)
        .eq("id", id)
        .select(clientColumns)
        .maybeSingle(),
    ) as unknown as Client | null;
  }

  async remove(workspaceId: string, id: string) {
    const rows = checked(
      await this.client
        .from("clients")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("id", id)
        .select("id"),
    );
    return (rows ?? []).length > 0;
  }

  async addEntry(input: ClientEntryInput) {
    return checked(
      await this.client
        .from("client_entries")
        .insert({
          workspace_id: input.workspaceId,
          client_id: input.clientId,
          kind: input.kind,
          title: input.title,
          body: input.body,
          author_id: input.authorId,
          author_name: input.authorName,
        })
        .select(clientEntryColumns)
        .single(),
    ) as unknown as ClientEntry;
  }

  async removeEntry(workspaceId: string, clientId: string, entryId: string) {
    const rows = checked(
      await this.client
        .from("client_entries")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("client_id", clientId)
        .eq("id", entryId)
        .select("id"),
    );
    return (rows ?? []).length > 0;
  }

  async linkIssue(workspaceId: string, clientId: string, identifier: string) {
    const found = checked(
      await this.client
        .from("issues")
        .select(issueRefColumns)
        .eq("workspace_id", workspaceId)
        .eq("identifier", identifier)
        .maybeSingle(),
    ) as unknown as ClientIssueRef | null;
    if (!found) return null;
    const updated = checked(
      await this.client
        .from("issues")
        .update({ client_id: clientId })
        .eq("workspace_id", workspaceId)
        .eq("id", found.id)
        .select("id"),
    );
    return (updated ?? []).length > 0 ? found : null;
  }

  async unlinkIssue(workspaceId: string, clientId: string, issueId: string) {
    const rows = checked(
      await this.client
        .from("issues")
        .update({ client_id: null })
        .eq("workspace_id", workspaceId)
        .eq("client_id", clientId)
        .eq("id", issueId)
        .select("id"),
    );
    return (rows ?? []).length > 0;
  }
}

/** What an MCP agent may do, run with the service role. */
export interface ClientAgentStore {
  list(
    workspaceId: string,
    filter: {
      stage?: ClientStage;
      area?: string;
      search?: string;
      limit: number;
    },
  ): Promise<ClientSummary[]>;
  get(
    workspaceId: string,
    id: string,
  ): Promise<{
    client: Client;
    entries: ClientEntry[];
    issues: ClientIssueRef[];
  } | null>;
  create(
    workspaceId: string,
    input: ClientWriteFields & { name: string },
    author: { id: string; name: string },
  ): Promise<Client>;
  update(
    workspaceId: string,
    id: string,
    fields: ClientWriteFields,
    author: { id: string; name: string },
  ): Promise<Client | null>;
  addEntry(input: ClientEntryInput): Promise<ClientEntry | null>;
}

/** PostgREST `or` filters break on these; ilike treats % and _ as wildcards. */
function filterText(value: string): string {
  return value
    .replace(/[%_,()*\\":]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stored(error: { message?: string } | null, what: string) {
  if (error) throw new Error(`clients_${what}:${error.message ?? "failed"}`);
}

export class SupabaseClientAgentStore implements ClientAgentStore {
  constructor(private client: SupabaseClient) {}

  async list(
    workspaceId: string,
    filter: {
      stage?: ClientStage;
      area?: string;
      search?: string;
      limit: number;
    },
  ) {
    let query = this.client
      .from("clients")
      .select(clientSummaryColumns)
      .eq("workspace_id", workspaceId)
      .is("archived_at", null);
    if (filter.stage) query = query.eq("stage", filter.stage);
    const area = filter.area ? filterText(filter.area) : "";
    if (area) query = query.ilike("area", area);
    const search = filter.search ? filterText(filter.search) : "";
    if (search)
      query = query.or(
        ["name", "contact", "phone", "email"]
          .map((column) => `${column}.ilike.%${search}%`)
          .join(","),
      );
    const result = await query
      .order("updated_at", { ascending: false })
      .limit(filter.limit);
    stored(result.error, "list");
    return (result.data ?? []) as unknown as ClientSummary[];
  }

  async get(workspaceId: string, id: string) {
    const found = await this.client
      .from("clients")
      .select(clientColumns)
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .maybeSingle();
    stored(found.error, "get");
    if (!found.data) return null;
    const [entries, issues] = await Promise.all([
      this.client
        .from("client_entries")
        .select(clientEntryColumns)
        .eq("workspace_id", workspaceId)
        .eq("client_id", id)
        .order("occurred_at", { ascending: false })
        .limit(50),
      this.client
        .from("issues")
        .select(issueRefColumns)
        .eq("workspace_id", workspaceId)
        .eq("client_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    stored(entries.error, "entries");
    stored(issues.error, "issues");
    return {
      client: found.data as unknown as Client,
      entries: (entries.data ?? []) as unknown as ClientEntry[],
      issues: (issues.data ?? []) as unknown as ClientIssueRef[],
    };
  }

  async create(
    workspaceId: string,
    input: ClientWriteFields & { name: string },
    author: { id: string; name: string },
  ) {
    const created = await this.client
      .from("clients")
      .insert({
        ...input,
        workspace_id: workspaceId,
        created_by: author.id,
        source: "agente",
      })
      .select(clientColumns)
      .single();
    stored(created.error, "create");
    const client = created.data as unknown as Client;
    await this.addEntry({
      workspaceId,
      clientId: client.id,
      kind: "nota",
      title: `Criado por ${author.name} (agente)`,
      body: "",
      authorId: author.id,
      authorName: author.name,
    });
    return client;
  }

  async update(
    workspaceId: string,
    id: string,
    fields: ClientWriteFields,
    author: { id: string; name: string },
  ) {
    const current = await this.client
      .from("clients")
      .select("stage")
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .maybeSingle();
    stored(current.error, "update");
    if (!current.data) return null;
    const updated = await this.client
      .from("clients")
      .update(fields)
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .select(clientColumns)
      .maybeSingle();
    stored(updated.error, "update");
    const client = (updated.data ?? null) as unknown as Client | null;
    if (client && fields.stage && fields.stage !== current.data.stage)
      await this.addEntry({
        workspaceId,
        clientId: id,
        kind: "estagio",
        title: stageEntryTitle(fields.stage),
        body: "",
        authorId: author.id,
        authorName: author.name,
      });
    return client;
  }

  async addEntry(input: ClientEntryInput) {
    // Scope by workspace first so a foreign client id never gets an entry.
    const owner = await this.client
      .from("clients")
      .select("id")
      .eq("workspace_id", input.workspaceId)
      .eq("id", input.clientId)
      .maybeSingle();
    stored(owner.error, "entry");
    if (!owner.data) return null;
    const result = await this.client
      .from("client_entries")
      .insert({
        workspace_id: input.workspaceId,
        client_id: input.clientId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        author_id: input.authorId,
        author_name: input.authorName,
      })
      .select(clientEntryColumns)
      .single();
    stored(result.error, "entry");
    return result.data as unknown as ClientEntry;
  }
}

export function registerClientRoutes(ctx: ApiRouteModuleContext) {
  const {
    router,
    dependencies,
    asyncRoute,
    scoped,
    send,
    noContent,
    parse,
    pathId,
    userFrom,
    uuid,
  } = ctx;
  const port = () => {
    if (!dependencies.clients)
      throw new ApiHttpError(
        503,
        "clients_unavailable",
        "Os clientes estão indisponíveis.",
      );
    return dependencies.clients;
  };
  const permissionsFor = (role: string) => ({
    canEdit: role === "owner" || role === "admin" || role === "agent",
    canArchive: role === "owner" || role === "admin",
  });
  const forbidden = () =>
    new ApiHttpError(
      403,
      "clients_forbidden",
      "Você não tem permissão para esta ação em clientes.",
    );
  const notFound = () =>
    new ApiHttpError(404, "client_not_found", "Cliente não encontrado.");
  const authorName = (response: Parameters<typeof userFrom>[0]) => {
    const user = userFrom(response);
    return user.name?.trim() || user.email?.trim() || "Equipe";
  };

  router.get(
    "/api/clients",
    asyncRoute(async (req, res) => {
      const scope = await scoped(req, res);
      res.setHeader("Cache-Control", "no-store");
      send(res, 200, {
        data: await port().list(scope.workspaceId, {
          archived: req.query.archived === "1",
        }),
        permissions: permissionsFor(scope.role),
      });
    }),
  );
  router.get(
    "/api/clients/:id",
    asyncRoute(async (req, res) => {
      const scope = await scoped(req, res);
      const id = pathId(req);
      const client = await port().get(scope.workspaceId, id);
      if (!client) throw notFound();
      const [entries, issues] = await Promise.all([
        port().entries(scope.workspaceId, id),
        port().issues(scope.workspaceId, id),
      ]);
      res.setHeader("Cache-Control", "no-store");
      send(res, 200, {
        data: { ...client, entries, issues },
        permissions: permissionsFor(scope.role),
      });
    }),
  );
  router.post(
    "/api/clients",
    asyncRoute(async (req, res) => {
      const scope = await scoped(req, res);
      if (!permissionsFor(scope.role).canEdit) throw forbidden();
      const input = parse(clientCreateSchema, req.body);
      send(res, 201, {
        data: await port().create(scope.workspaceId, scope.userId, input),
      });
    }),
  );
  router.patch(
    "/api/clients/:id",
    asyncRoute(async (req, res) => {
      const scope = await scoped(req, res);
      const permissions = permissionsFor(scope.role);
      if (!permissions.canEdit) throw forbidden();
      const id = pathId(req);
      const { archived, ...fields } = parse(clientPatchSchema, req.body);
      if (archived !== undefined && !permissions.canArchive) throw forbidden();
      const current = await port().get(scope.workspaceId, id);
      if (!current) throw notFound();
      const updated = await port().update(scope.workspaceId, id, {
        ...fields,
        ...(archived === undefined
          ? {}
          : { archived_at: archived ? new Date().toISOString() : null }),
      });
      if (!updated) throw notFound();
      if (fields.stage && fields.stage !== current.stage)
        await port().addEntry({
          workspaceId: scope.workspaceId,
          clientId: id,
          kind: "estagio",
          title: stageEntryTitle(fields.stage),
          body: "",
          authorId: scope.userId,
          authorName: authorName(res),
        });
      send(res, 200, { data: updated });
    }),
  );
  router.delete(
    "/api/clients/:id",
    asyncRoute(async (req, res) => {
      const scope = await scoped(req, res);
      if (!permissionsFor(scope.role).canArchive) throw forbidden();
      if (!(await port().remove(scope.workspaceId, pathId(req))))
        throw notFound();
      noContent(res);
    }),
  );
  router.post(
    "/api/clients/:id/entries",
    asyncRoute(async (req, res) => {
      const scope = await scoped(req, res);
      if (!permissionsFor(scope.role).canEdit) throw forbidden();
      const id = pathId(req);
      const input = parse(clientEntryCreateSchema, req.body);
      if (!(await port().get(scope.workspaceId, id))) throw notFound();
      send(res, 201, {
        data: await port().addEntry({
          workspaceId: scope.workspaceId,
          clientId: id,
          kind: input.kind,
          title: input.title ?? null,
          body: input.body,
          authorId: scope.userId,
          authorName: authorName(res),
        }),
      });
    }),
  );
  router.delete(
    "/api/clients/:id/entries/:entryId",
    asyncRoute(async (req, res) => {
      const scope = await scoped(req, res);
      const id = pathId(req);
      const entryId = parse(uuid, req.params.entryId);
      // RLS limits deletion to the author or an owner/admin; anything else
      // deletes nothing and reads as not found.
      if (!(await port().removeEntry(scope.workspaceId, id, entryId)))
        throw new ApiHttpError(
          404,
          "client_entry_not_found",
          "Registro não encontrado.",
        );
      noContent(res);
    }),
  );
  router.post(
    "/api/clients/:id/issues",
    asyncRoute(async (req, res) => {
      const scope = await scoped(req, res);
      if (!permissionsFor(scope.role).canEdit) throw forbidden();
      const id = pathId(req);
      const input = parse(clientIssueLinkSchema, req.body);
      if (!(await port().get(scope.workspaceId, id))) throw notFound();
      const issue = await port().linkIssue(
        scope.workspaceId,
        id,
        input.identifier.toUpperCase(),
      );
      if (!issue)
        throw new ApiHttpError(
          404,
          "issue_not_found",
          "Chamado não encontrado.",
        );
      send(res, 200, { data: issue });
    }),
  );
  router.delete(
    "/api/clients/:id/issues/:issueId",
    asyncRoute(async (req, res) => {
      const scope = await scoped(req, res);
      if (!permissionsFor(scope.role).canEdit) throw forbidden();
      const id = pathId(req);
      const issueId = parse(uuid, req.params.issueId);
      if (!(await port().unlinkIssue(scope.workspaceId, id, issueId)))
        throw new ApiHttpError(
          404,
          "issue_not_found",
          "Chamado não encontrado.",
        );
      noContent(res);
    }),
  );
}
