import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import type { Logger } from "pino";
import { z } from "zod";
import { timingSafeSecretEquals } from "./zelochat-internal-send.js";

/**
 * Machine path the external Support bot polls for customer messages and the
 * human (founder) outbound messages that Support must read but never answer.
 */
export const SUPPORT_EVENTS_PATH = "/internal/support/events";
export const SUPPORT_EVENTS_KEY_HEADER = "x-mend-support-key";
export const SUPPORT_EVENTS_API_KEY_ENV = "MEND_SUPPORT_EVENTS_API_KEY";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export type SupportEventDirection = "inbound" | "outbound";

export interface SupportEventInput {
  workspaceId: string;
  conversationId: string;
  messageId: string;
  /** Rows recorded before outbound events existed are inbound. */
  direction?: SupportEventDirection;
  remoteJid: string;
  phoneNumber?: string;
  chatType?: string;
}

export interface SupportEventMedia {
  type: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  durationSeconds?: number;
  storagePath?: string;
}

export interface SupportEventTranscription {
  status: "processing" | "ready" | "failed" | "unavailable";
  text?: string;
}

export interface SupportEvent {
  cursor: string;
  workspaceId: string;
  conversationId: string;
  messageId: string;
  providerMessageId?: string;
  remoteJid: string;
  phoneNumber?: string;
  isGroup: boolean;
  /** outbound = a human (founder/team) message already sent to the customer. */
  direction: SupportEventDirection;
  messageType: string;
  text?: string;
  media?: SupportEventMedia;
  transcription?: SupportEventTranscription;
  aiMode: string;
  automationState: string;
  pausedUntil?: string;
  /**
   * Always false for outbound: Support reads the human message as context and
   * must never reply on top of it. For inbound, false only when ai_mode=off;
   * human_paused pauses Mend's native AI, not the external Support bot.
   */
  replyAllowed: boolean;
  createdAt: string;
}

export interface SupportEventPage {
  events: SupportEvent[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ListSupportEventsInput {
  cursor?: string;
  limit: number;
  workspaceId?: string;
}

export interface SupportEventStore {
  /** Idempotent by message id: recording the same message twice is a no-op. */
  record(input: SupportEventInput): Promise<void>;
  list(input: ListSupportEventsInput): Promise<SupportEventPage>;
}

export interface SupportEventMessageSnapshot {
  id: string;
  providerMessageId?: string | null;
  messageType: string;
  text?: string | null;
  caption?: string | null;
  mediaStoragePath?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  durationSeconds?: number | null;
  transcriptionStatus?: string | null;
}

export interface SupportEventConversationFlags {
  aiMode?: string | null;
  automationState?: string | null;
  pausedUntil?: string | null;
}

/**
 * Event row for a persisted inbound customer message or human outbound
 * message; null for anything else. AI-generated outbound (including Support's
 * own sends echoed back by the provider) is skipped, and outbound fails closed
 * unless persistence confirmed a human origin. Recording is idempotent by
 * message id, so the worker lets a failed write retry the ingest job instead
 * of dropping the event.
 */
export function supportEventFor(
  binding: { workspaceId: string },
  message: {
    direction: string;
    messageType: string;
    remoteJid: string;
    phoneNumber?: string;
    chatType?: string;
  },
  persisted: { id: string; conversationId: string; aiGenerated?: boolean },
): SupportEventInput | null {
  if (message.messageType === "reaction") return null;
  const direction = message.direction;
  if (direction !== "inbound" && direction !== "outbound") return null;
  if (direction === "outbound" && persisted.aiGenerated !== false) return null;
  return {
    workspaceId: binding.workspaceId,
    conversationId: persisted.conversationId,
    messageId: persisted.id,
    direction,
    remoteJid: message.remoteJid,
    ...(message.phoneNumber ? { phoneNumber: message.phoneNumber } : {}),
    ...(message.chatType ? { chatType: message.chatType } : {}),
  };
}

/**
 * Support may reply to inbound unless the conversation's AI mode is off; it
 * never replies to an outbound human message.
 */
export function supportReplyAllowed(flags: {
  aiMode: string;
  direction?: SupportEventDirection;
}): boolean {
  return flags.direction !== "outbound" && flags.aiMode !== "off";
}

function present(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Build the public event from the queue row plus live message/conversation state. */
export function buildSupportEvent(
  row: SupportEventInput & { id: number | string; createdAt: string },
  message: SupportEventMessageSnapshot | undefined,
  flags: SupportEventConversationFlags | undefined,
): SupportEvent {
  // Fail closed: an event whose conversation vanished must never be answered.
  const aiMode = flags ? (flags.aiMode ?? "off") : "off";
  const automationState = flags?.automationState ?? "ai_active";
  const direction = row.direction ?? "inbound";
  const messageType = message?.messageType ?? "text";
  const isAudio = messageType === "audio";
  const body = present(message?.text);
  const caption = present(message?.caption);
  // Voice notes carry the STT transcript as text so Support reads one field.
  const text = body ?? caption;
  const hasMedia = Boolean(
    message &&
      (message.mediaStoragePath ||
        (messageType !== "text" && message.mimeType)),
  );
  const transcriptionStatus = message?.transcriptionStatus;
  return {
    cursor: String(row.id),
    workspaceId: row.workspaceId,
    conversationId: row.conversationId,
    messageId: row.messageId,
    ...(present(message?.providerMessageId)
      ? { providerMessageId: present(message?.providerMessageId) }
      : {}),
    remoteJid: row.remoteJid,
    ...(present(row.phoneNumber)
      ? { phoneNumber: present(row.phoneNumber) }
      : {}),
    isGroup: row.chatType === "group" || row.remoteJid.endsWith("@g.us"),
    direction,
    messageType,
    ...(text ? { text } : {}),
    ...(hasMedia && message
      ? {
          media: {
            type: messageType,
            ...(message.mimeType ? { mimeType: message.mimeType } : {}),
            ...(message.fileName ? { fileName: message.fileName } : {}),
            ...(typeof message.fileSize === "number"
              ? { fileSize: message.fileSize }
              : {}),
            ...(typeof message.durationSeconds === "number"
              ? { durationSeconds: message.durationSeconds }
              : {}),
            ...(message.mediaStoragePath
              ? { storagePath: message.mediaStoragePath }
              : {}),
          },
        }
      : {}),
    ...(isAudio
      ? {
          transcription: {
            status:
              transcriptionStatus === "processing" ||
              transcriptionStatus === "failed" ||
              transcriptionStatus === "ready"
                ? transcriptionStatus
                : body
                  ? "ready"
                  : "unavailable",
            ...(body ? { text: body } : {}),
          },
        }
      : {}),
    aiMode,
    automationState,
    ...(flags?.pausedUntil ? { pausedUntil: flags.pausedUntil } : {}),
    replyAllowed: supportReplyAllowed({ aiMode, direction }),
    createdAt: row.createdAt,
  };
}

function parseCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  if (!/^\d{1,15}$/.test(cursor))
    throw new Error("support_events_cursor_invalid");
  return Number(cursor);
}

interface StoredEventRow extends SupportEventInput {
  id: number;
  createdAt: string;
}

/** Test/local adapter with the same idempotency and cursor semantics. */
export class InMemorySupportEventStore implements SupportEventStore {
  readonly rows: StoredEventRow[] = [];
  readonly messages = new Map<string, SupportEventMessageSnapshot>();
  readonly conversations = new Map<string, SupportEventConversationFlags>();
  private nextId = 1;

  async record(input: SupportEventInput): Promise<void> {
    if (this.rows.some((row) => row.messageId === input.messageId)) return;
    this.rows.push({
      ...input,
      id: this.nextId++,
      createdAt: new Date().toISOString(),
    });
  }

  async list(input: ListSupportEventsInput): Promise<SupportEventPage> {
    const after = parseCursor(input.cursor);
    const matching = this.rows.filter(
      (row) =>
        row.id > after &&
        (!input.workspaceId || row.workspaceId === input.workspaceId),
    );
    const page = matching.slice(0, input.limit);
    const events = page.map((row) =>
      buildSupportEvent(
        row,
        this.messages.get(row.messageId),
        this.conversations.get(row.conversationId),
      ),
    );
    return {
      events,
      nextCursor: events.at(-1)?.cursor ?? input.cursor ?? null,
      hasMore: matching.length > page.length,
    };
  }
}

type QueryResult = { data: unknown; error: { message: string } | null };

/** Minimal PostgREST surface; the table is not in generated types yet. */
interface LooseQuery extends PromiseLike<QueryResult> {
  select(columns: string): LooseQuery;
  upsert(
    values: unknown,
    options?: { onConflict?: string; ignoreDuplicates?: boolean },
  ): LooseQuery;
  eq(column: string, value: unknown): LooseQuery;
  gt(column: string, value: unknown): LooseQuery;
  in(column: string, values: readonly unknown[]): LooseQuery;
  order(column: string, options?: { ascending?: boolean }): LooseQuery;
  limit(value: number): LooseQuery;
}

export interface SupportEventsSupabaseClient {
  from(table: string): LooseQuery;
}

type Row = Record<string, unknown>;

function rows(result: QueryResult, scope: string): Row[] {
  if (result.error)
    throw new Error(`supabase:${scope}:${result.error.message}`);
  return Array.isArray(result.data) ? (result.data as Row[]) : [];
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    typeof value === "string" &&
    value.trim() &&
    Number.isFinite(Number(value))
  )
    return Number(value);
  return undefined;
}

export class SupabaseSupportEventStore implements SupportEventStore {
  constructor(private readonly client: SupportEventsSupabaseClient) {}

  /** The table is not in generated types yet; accept any Supabase client. */
  static from(client: unknown): SupabaseSupportEventStore {
    return new SupabaseSupportEventStore(client as SupportEventsSupabaseClient);
  }

  async record(input: SupportEventInput): Promise<void> {
    const result = await this.client.from("support_inbound_events").upsert(
      {
        workspace_id: input.workspaceId,
        conversation_id: input.conversationId,
        message_id: input.messageId,
        direction: input.direction ?? "inbound",
        remote_jid: input.remoteJid,
        phone_number: input.phoneNumber ?? null,
        chat_type: input.chatType ?? null,
      },
      { onConflict: "message_id", ignoreDuplicates: true },
    );
    if (result.error)
      throw new Error(
        `supabase:support_inbound_events:${result.error.message}`,
      );
  }

  async list(input: ListSupportEventsInput): Promise<SupportEventPage> {
    const after = parseCursor(input.cursor);
    let query = this.client
      .from("support_inbound_events")
      .select(
        "id, workspace_id, conversation_id, message_id, direction, remote_jid, phone_number, chat_type, created_at",
      )
      .gt("id", after);
    if (input.workspaceId) query = query.eq("workspace_id", input.workspaceId);
    // Fetch one extra row to report hasMore without a count query.
    const eventRows = rows(
      await query.order("id", { ascending: true }).limit(input.limit + 1),
      "support_inbound_events",
    );
    const page = eventRows.slice(0, input.limit);
    if (!page.length)
      return { events: [], nextCursor: input.cursor ?? null, hasMore: false };

    const messageIds = page.map((row) => String(row.message_id));
    const conversationIds = [
      ...new Set(page.map((row) => String(row.conversation_id))),
    ];
    const [messageResult, conversationResult, stateResult] = await Promise.all([
      this.client
        .from("messages")
        .select(
          "id, provider_message_id, message_type, text, caption, media_storage_path, mime_type, file_name, file_size, duration_seconds, transcription_status",
        )
        .in("id", messageIds),
      this.client
        .from("conversations")
        .select("id, ai_mode")
        .in("id", conversationIds),
      this.client
        .from("conversation_ai_state")
        .select("conversation_id, automation_state, paused_until")
        .in("conversation_id", conversationIds),
    ]);

    const messages = new Map<string, SupportEventMessageSnapshot>();
    for (const row of rows(messageResult, "messages")) {
      messages.set(String(row.id), {
        id: String(row.id),
        providerMessageId: str(row.provider_message_id),
        messageType: str(row.message_type) ?? "text",
        text: str(row.text),
        caption: str(row.caption),
        mediaStoragePath: str(row.media_storage_path),
        mimeType: str(row.mime_type),
        fileName: str(row.file_name),
        fileSize: num(row.file_size),
        durationSeconds: num(row.duration_seconds),
        transcriptionStatus: str(row.transcription_status),
      });
    }
    const states = new Map<string, Row>();
    for (const row of rows(stateResult, "conversation_ai_state"))
      states.set(String(row.conversation_id), row);
    const flags = new Map<string, SupportEventConversationFlags>();
    for (const row of rows(conversationResult, "conversations")) {
      const state = states.get(String(row.id));
      flags.set(String(row.id), {
        aiMode: str(row.ai_mode),
        automationState: str(state?.automation_state),
        pausedUntil: str(state?.paused_until),
      });
    }

    const events = page.map((row) =>
      buildSupportEvent(
        {
          id: String(row.id),
          workspaceId: String(row.workspace_id),
          conversationId: String(row.conversation_id),
          messageId: String(row.message_id),
          direction: row.direction === "outbound" ? "outbound" : "inbound",
          remoteJid: String(row.remote_jid),
          phoneNumber: str(row.phone_number),
          chatType: str(row.chat_type),
          createdAt: String(row.created_at),
        },
        messages.get(String(row.message_id)),
        flags.get(String(row.conversation_id)),
      ),
    );
    return {
      events,
      nextCursor: events.at(-1)?.cursor ?? input.cursor ?? null,
      hasMore: eventRows.length > page.length,
    };
  }
}

export function authorizeSupportEventsRequest(
  received: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): { ok: boolean; status: 200 | 401 | 503; error?: string } {
  const expected = env[SUPPORT_EVENTS_API_KEY_ENV]?.trim() || undefined;
  if (!expected)
    return {
      ok: false,
      status: 503,
      error: "support_events_key_not_configured",
    };
  if (!timingSafeSecretEquals(received, expected))
    return { ok: false, status: 401, error: "unauthorized" };
  return { ok: true, status: 200 };
}

const supportEventsQuerySchema = z.object({
  cursor: z
    .string()
    .trim()
    .regex(/^\d{1,15}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  workspaceId: z.string().uuid().optional(),
});

const supportEventsLimiter = rateLimit({
  windowMs: 60_000,
  limit: 240,
  standardHeaders: true,
  legacyHeaders: false,
});

export interface SupportEventRouteOptions {
  store: SupportEventStore | null;
  env?: NodeJS.ProcessEnv;
  logger?: Pick<Logger, "error">;
}

/**
 * Machine feed for the Support bot. Mounted outside /api so it never takes a
 * user JWT; fail-closed when the key or the service-role store is missing.
 */
export function registerInternalSupportRoutes(
  app: Express,
  options: SupportEventRouteOptions,
): void {
  const env = options.env ?? process.env;
  app.get(
    SUPPORT_EVENTS_PATH,
    supportEventsLimiter,
    async (request: Request, response: Response) => {
      const auth = authorizeSupportEventsRequest(
        request.get(SUPPORT_EVENTS_KEY_HEADER)?.trim() || undefined,
        env,
      );
      if (!auth.ok)
        return response.status(auth.status).json({ error: auth.error });
      const parsed = supportEventsQuerySchema.safeParse(request.query);
      if (!parsed.success)
        return response.status(400).json({ error: "invalid_query" });
      if (!options.store)
        return response
          .status(503)
          .json({ error: "support_events_store_not_configured" });
      try {
        const page = await options.store.list({
          cursor: parsed.data.cursor,
          limit: parsed.data.limit ?? DEFAULT_PAGE_SIZE,
          workspaceId: parsed.data.workspaceId,
        });
        return response.json(page);
      } catch (error) {
        options.logger?.error({ err: error }, "Support events read failed");
        return response
          .status(500)
          .json({ error: "support_events_unavailable" });
      }
    },
  );
}
