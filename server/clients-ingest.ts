import crypto from "node:crypto";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import rateLimit from "express-rate-limit";
import type { Logger } from "pino";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseBearerToken } from "./auth.js";
import {
  InternalWorkspaceError,
  resolveInternalWorkspace,
  type InternalWorkspacePort,
} from "./internal-workspace.js";

/**
 * The Diagium site posts every Diagnóstico de marca here (contract in
 * docs/engineering/CLIENTES.md). Mounted outside /api: it never takes a user
 * JWT, only the shared MEND_CLIENT_INGEST_TOKEN, and fails closed without it.
 */
export const CLIENT_INGEST_PATH = "/internal/clients/diagnostico-marca";
export const CLIENT_INGEST_BODY_LIMIT = "256kb";
const MIN_TOKEN_LENGTH = 32;
const MAX_ANSWERS = 120;
const MAX_ANSWER_LENGTH = 10_000;
const MAX_BODY_LENGTH = 100_000;
const AUTHOR_NAME = "Site Diagium";

const text = (max: number) => z.string().trim().max(max).nullish();

const answerSchema = z.object({
  questionId: text(200),
  section: text(200),
  sectionTitle: text(300),
  title: z.string().trim().min(1).max(500),
  answer: z.string().max(MAX_ANSWER_LENGTH),
  items: z.array(z.string().max(MAX_ANSWER_LENGTH)).max(60).optional(),
});

/** Lenient on purpose: unknown keys are stripped, the site evolves on its own. */
export const diagnosticoSubmissionSchema = z.object({
  area: text(200),
  areaLabel: text(200),
  especialidade: text(200),
  especialidadeLabel: text(200),
  nome: text(200),
  chamado: text(200),
  whatsapp: text(60),
  registro: text(120),
  rqe: text(60),
  ref: text(200),
  utm: z
    .object({
      source: text(200),
      medium: text(200),
      campaign: text(200),
      term: text(200),
      content: text(200),
    })
    .nullish(),
  respostas: z.array(answerSchema).max(MAX_ANSWERS),
});
export type DiagnosticoSubmission = z.infer<typeof diagnosticoSubmissionSchema>;

export const clientIngestBodySchema = z.object({
  externalId: z.string().trim().min(1).max(200).optional(),
  enviadoEm: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)))
    .optional(),
  submission: diagnosticoSubmissionSchema,
});

const rqeLabels: Record<string, string> = {
  sim: "Sim",
  "ainda-nao": "Ainda não",
  "nao-se-aplica": "Não se aplica",
};

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** User text must never open a markdown section of its own. */
function neutralizeHeadings(value: string): string {
  return value.replace(/^([ \t]*)#/gm, "$1\\#");
}

function formatSaoPaulo(date: Date): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("day")}/${part("month")}/${part("year")} ${part("hour")}:${part("minute")}`;
}

/** Page body: a `## Resumo` plus one `## N. Seção` per form section. */
export function buildDiagnosticoMarkdown(
  submission: DiagnosticoSubmission,
  enviadoEm: Date,
): string {
  const summary: string[] = [];
  const line = (label: string, value: string | null | undefined) => {
    const clean = value ? oneLine(value) : "";
    if (clean) summary.push(`- **${label}:** ${clean}`);
  };
  line("Nome", submission.nome);
  line("Como quer ser chamado(a)", submission.chamado);
  line(
    "Área",
    [submission.areaLabel, submission.especialidadeLabel]
      .filter((part): part is string => Boolean(part?.trim()))
      .map(oneLine)
      .join(" · "),
  );
  if (submission.rqe)
    line("RQE", rqeLabels[submission.rqe.trim()] ?? submission.rqe);
  line("WhatsApp", submission.whatsapp);
  line("Registro", submission.registro);
  line("Indicação", submission.ref);
  line(
    "Origem",
    [submission.utm?.source, submission.utm?.medium, submission.utm?.campaign]
      .filter((part): part is string => Boolean(part?.trim()))
      .map(oneLine)
      .join(" / "),
  );
  line("Enviado em", formatSaoPaulo(enviadoEm));

  const blocks = ["## Resumo", summary.join("\n")];

  const sections = new Map<string, { title: string; answers: string[] }>();
  for (const answer of submission.respostas) {
    const title = oneLine(
      answer.sectionTitle || answer.section || "Outras respostas",
    );
    const key = answer.section || title;
    let section = sections.get(key);
    if (!section) {
      section = { title, answers: [] };
      sections.set(key, section);
    }
    const content =
      answer.items && answer.items.length > 0
        ? answer.items.map((item) => `- ${oneLine(item)}`).join("\n")
        : answer.answer.trim() || "—";
    section.answers.push(
      `**${oneLine(answer.title)}**\n${neutralizeHeadings(content)}`,
    );
  }
  let index = 0;
  for (const section of sections.values()) {
    index += 1;
    blocks.push(`## ${index}. ${section.title}`, section.answers.join("\n\n"));
  }
  return `${blocks.join("\n\n")}\n`;
}

export interface DiagnosticoEntryInput {
  workspaceId: string;
  clientId: string;
  title: string;
  body: string;
  authorName: string;
  externalId: string | null;
  occurredAt: string;
}

export interface DiagnosticoClientInput {
  workspaceId: string;
  name: string;
  contact: string | null;
  phone: string | null;
  area: string | null;
  specialty: string | null;
  registration: string | null;
  referral: string | null;
  utm: Record<string, string>;
  notes: string;
  body: string;
  externalId: string | null;
}

export interface ClientIngestStore {
  findDiagnosticoEntry(
    workspaceId: string,
    externalId: string,
  ): Promise<{ clientId: string } | null>;
  findClientByPhone(
    workspaceId: string,
    phoneDigits: string,
  ): Promise<{ id: string } | null>;
  /** Idempotent on (source, externalId): a retry returns the same client. */
  createClient(input: DiagnosticoClientInput): Promise<{ id: string }>;
  /** `duplicate` when the unique (kind, external_id) constraint fires. */
  insertDiagnosticoEntry(
    input: DiagnosticoEntryInput,
  ): Promise<"inserted" | "duplicate">;
}

export class SupabaseClientIngestStore implements ClientIngestStore {
  constructor(private client: SupabaseClient) {}

  async findDiagnosticoEntry(workspaceId: string, externalId: string) {
    const result = await this.client
      .from("client_entries")
      .select("client_id")
      .eq("workspace_id", workspaceId)
      .eq("kind", "diagnostico")
      .eq("external_id", externalId)
      .maybeSingle();
    if (result.error) throw new Error(`client_entry:${result.error.message}`);
    return result.data ? { clientId: result.data.client_id as string } : null;
  }

  async findClientByPhone(workspaceId: string, phoneDigits: string) {
    const result = await this.client
      .from("clients")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("phone_digits", phoneDigits)
      .is("archived_at", null)
      .order("created_at", { ascending: true })
      .limit(1);
    if (result.error) throw new Error(`client_phone:${result.error.message}`);
    const row = result.data?.[0];
    return row ? { id: row.id as string } : null;
  }

  async createClient(input: DiagnosticoClientInput) {
    const insert = await this.client
      .from("clients")
      .insert({
        workspace_id: input.workspaceId,
        name: input.name,
        contact: input.contact,
        phone: input.phone,
        stage: "lead",
        source: "diagnostico_marca",
        area: input.area,
        specialty: input.specialty,
        registration: input.registration,
        referral: input.referral,
        utm: input.utm,
        notes: input.notes,
        body: input.body,
        external_id: input.externalId,
      })
      .select("id")
      .single();
    if (!insert.error) return { id: insert.data.id as string };
    if (insert.error.code === "23505" && input.externalId) {
      // A previous attempt created the client but not its entry.
      const existing = await this.client
        .from("clients")
        .select("id")
        .eq("workspace_id", input.workspaceId)
        .eq("source", "diagnostico_marca")
        .eq("external_id", input.externalId)
        .maybeSingle();
      if (existing.data) return { id: existing.data.id as string };
    }
    throw new Error(`client_insert:${insert.error.message}`);
  }

  async insertDiagnosticoEntry(input: DiagnosticoEntryInput) {
    const result = await this.client.from("client_entries").insert({
      workspace_id: input.workspaceId,
      client_id: input.clientId,
      kind: "diagnostico",
      title: input.title,
      body: input.body,
      author_id: null,
      author_name: input.authorName,
      external_id: input.externalId,
      occurred_at: input.occurredAt,
    });
    if (!result.error) return "inserted" as const;
    if (result.error.code === "23505") return "duplicate" as const;
    throw new Error(`client_entry_insert:${result.error.message}`);
  }
}

/** Same rule as the `phone_digits` column: digits only, without Brazil's 55. */
export function phoneDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "").replace(/^55(\d{10,11})$/, "$1");
}

function clip(value: string | null | undefined, max: number): string | null {
  const clean = value?.trim();
  return clean ? clean.slice(0, max) : null;
}

function tokenMatches(provided: string, expected: string): boolean {
  // Hash both sides so timingSafeEqual always compares equal-length buffers.
  const digest = (value: string) =>
    crypto.createHash("sha256").update(value).digest();
  return crypto.timingSafeEqual(digest(provided), digest(expected));
}

/**
 * Parses this route's body with its own 256 KB limit. Mount it before the
 * app-wide JSON parser (which allows far larger bodies) so oversized diagnostics
 * are rejected here and other routes keep their limits.
 */
export function mountClientIngestBodyLimit(app: Express): void {
  app.use(
    CLIENT_INGEST_PATH,
    express.json({ limit: CLIENT_INGEST_BODY_LIMIT }),
  );
}

export interface ClientIngestOptions {
  store: ClientIngestStore | null;
  token: string | undefined;
  internalWorkspace: InternalWorkspacePort;
  appBaseUrl?: string | undefined;
  logger?: Pick<Logger, "error">;
  now?: () => Date;
}

export function registerClientIngestRoute(
  app: Express,
  options: ClientIngestOptions,
): void {
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
  });
  const configuredToken = options.token?.trim() ?? "";
  const baseUrl = options.appBaseUrl?.trim().replace(/\/+$/, "") ?? "";

  app.post(
    CLIENT_INGEST_PATH,
    limiter,
    express.json({ limit: CLIENT_INGEST_BODY_LIMIT }),
    async (request: Request, response: Response) => {
      if (configuredToken.length < MIN_TOKEN_LENGTH)
        return response
          .status(503)
          .json({ error: "client_ingest_unavailable" });
      const provided = parseBearerToken(request.get("authorization"));
      if (!provided || !tokenMatches(provided, configuredToken))
        return response
          .status(401)
          .json({ error: "client_ingest_token_invalid" });
      if (!options.store)
        return response
          .status(503)
          .json({ error: "client_ingest_unavailable" });
      const parsed = clientIngestBodySchema.safeParse(request.body);
      if (!parsed.success)
        return response.status(400).json({ error: "invalid_body" });

      const { externalId, submission } = parsed.data;
      const enviadoEm = parsed.data.enviadoEm
        ? new Date(parsed.data.enviadoEm)
        : (options.now?.() ?? new Date());
      const reply = (
        status: 200 | 201,
        clientId: string,
        outcome: "created" | "attached" | "duplicate",
      ) =>
        response.status(status).json({
          data: {
            clientId,
            status: outcome,
            ...(baseUrl ? { url: `${baseUrl}/clientes/${clientId}` } : {}),
          },
        });

      try {
        const store = options.store;
        const workspaceId = await resolveInternalWorkspace(
          options.internalWorkspace,
        );
        if (externalId) {
          const seen = await store.findDiagnosticoEntry(
            workspaceId,
            externalId,
          );
          if (seen) return reply(200, seen.clientId, "duplicate");
        }

        const markdown = buildDiagnosticoMarkdown(submission, enviadoEm);
        const body = markdown.slice(0, MAX_BODY_LENGTH);
        const digits = phoneDigits(submission.whatsapp);
        const occurredAt = enviadoEm.toISOString();

        const existing = digits
          ? await store.findClientByPhone(workspaceId, digits)
          : null;
        if (existing) {
          const inserted = await store.insertDiagnosticoEntry({
            workspaceId,
            clientId: existing.id,
            title: "Diagnóstico de marca",
            body,
            authorName: AUTHOR_NAME,
            externalId: externalId ?? null,
            occurredAt,
          });
          return reply(
            200,
            existing.id,
            inserted === "duplicate" ? "duplicate" : "attached",
          );
        }

        const label = [submission.areaLabel, submission.especialidadeLabel]
          .map((part) => part?.trim())
          .filter(Boolean)
          .join(" / ");
        const utm: Record<string, string> = {};
        for (const [key, value] of Object.entries(submission.utm ?? {}))
          if (value?.trim()) utm[key] = value.trim();
        const created = await store.createClient({
          workspaceId,
          name:
            clip(submission.nome, 200) ||
            clip(submission.chamado, 200) ||
            "Sem nome",
          contact: clip(submission.chamado, 200),
          phone: clip(submission.whatsapp, 40),
          area: clip(submission.areaLabel, 120),
          specialty: clip(submission.especialidadeLabel, 200),
          registration: clip(submission.registro, 120),
          referral: clip(submission.ref, 200),
          utm,
          notes: `Diagnóstico de marca${label ? ` · ${label}` : ""}`,
          body,
          externalId: externalId ?? null,
        });
        const inserted = await store.insertDiagnosticoEntry({
          workspaceId,
          clientId: created.id,
          title: "Diagnóstico de marca recebido",
          // The client's body already holds the full diagnóstico.
          body: "",
          authorName: AUTHOR_NAME,
          externalId: externalId ?? null,
          occurredAt,
        });
        return inserted === "duplicate"
          ? reply(200, created.id, "duplicate")
          : reply(201, created.id, "created");
      } catch (error) {
        if (!(error instanceof InternalWorkspaceError))
          options.logger?.error({ err: error }, "Client ingest failed");
        return response
          .status(503)
          .json({ error: "client_ingest_unavailable" });
      }
    },
  );

  // Keep the envelope stable for oversized or malformed JSON bodies.
  app.use(
    CLIENT_INGEST_PATH,
    (
      error: unknown,
      _request: Request,
      response: Response,
      next: NextFunction,
    ) => {
      const status =
        error && typeof error === "object" && "status" in error
          ? Number((error as { status?: unknown }).status)
          : 0;
      if (status === 413)
        return response.status(413).json({ error: "payload_too_large" });
      if (status === 400)
        return response.status(400).json({ error: "invalid_body" });
      return next(error);
    },
  );
}
