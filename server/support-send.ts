import { createHash } from "node:crypto";
import { registerAutomationMark } from "./internal-whatsapp.js";
import {
  InternalWorkspaceError,
  resolveInternalWorkspace,
} from "./internal-workspace.js";
import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import type { Logger } from "pino";
import { z } from "zod";
import {
  authorizeSupportEventsRequest,
  SUPPORT_EVENTS_KEY_HEADER,
  supportReplyAllowed,
  type SupportEventsSupabaseClient,
} from "./support-events.js";
import { OutboundSendError, type WhatsAppService } from "./whatsapp-service.js";

/** Machine path the external Support bot calls to answer a conversation. */
export const SUPPORT_SEND_PATH = "/internal/support/send";

/** WhatsApp renders long texts poorly; Support replies are short by contract. */
const MAX_SUPPORT_TEXT_LENGTH = 4_096;

export interface SupportSendConversation {
  workspaceId: string;
  aiMode: string;
  /** WhatsApp group chat: Support never replies there. */
  isGroup?: boolean;
}

export interface SupportReplyMessage {
  id: string;
  direction: string;
  aiGenerated: boolean;
  createdAt: string;
  messageType?: string;
}

export type SupportReplyRejection = "superseded";

export interface SupportReplyGuard {
  reject?: SupportReplyRejection;
  /** Newest inbound message, used to scope the derived idempotency key. */
  latestInboundId?: string;
}

/**
 * Decides whether the bot's reply is still wanted. Only ai_mode=off blocks
 * Support (checked by the caller); a human reply, reaction or human_paused
 * does not. With a sourceMessageId the reply is stale only when a newer
 * inbound arrived after it, so one burst never gets two answers.
 */
export function evaluateReplyGuard(input: {
  messages: readonly SupportReplyMessage[];
  sourceMessageId?: string;
}): SupportReplyGuard {
  const time = (message: { createdAt: string }) =>
    Date.parse(message.createdAt);
  // A reaction (either side) is not a new turn in the conversation.
  const ordered = input.messages
    .filter((m) => m.messageType !== "reaction")
    .sort((a, b) => time(b) - time(a));
  const latestInbound = ordered.find((m) => m.direction === "inbound");
  const base = latestInbound ? { latestInboundId: latestInbound.id } : {};
  if (input.sourceMessageId) {
    const source = ordered.find((m) => m.id === input.sourceMessageId);
    // Not in the recent window (or unknown): too much has happened since.
    if (!source) return { ...base, reject: "superseded" };
    if (latestInbound && time(latestInbound) > time(source))
      return { ...base, reject: "superseded" };
  }
  return base;
}

/** Deterministic retry key: the same reply to the same message dedupes. */
export function deriveSupportIdempotencyKey(input: {
  conversationId: string;
  anchorMessageId?: string;
  text: string;
}): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify([
        input.conversationId,
        input.anchorMessageId ?? "",
        input.text,
      ]),
    )
    .digest("hex");
  return `support-send:${digest}`;
}

export interface SupportSendInput {
  workspaceId: string;
  conversationId: string;
  text: string;
  idempotencyKey?: string;
}

export interface SupportSendResult {
  messageId: string | null;
  providerMessageId: string;
  /** False when the provider accepted the text but local recording failed. */
  recorded?: false;
}

export interface SupportSendPort {
  findConversation(input: {
    conversationId: string;
    workspaceId?: string;
  }): Promise<SupportSendConversation | null>;
  /** Optional: stale-reply guard; ports without it skip the check. */
  checkReplyGuard?(input: {
    workspaceId: string;
    conversationId: string;
    sourceMessageId?: string;
  }): Promise<SupportReplyGuard>;
  sendText(input: SupportSendInput): Promise<SupportSendResult>;
}

/** The automation mark could not be registered, so nothing was sent. */
export class AutomationMarkError extends Error {}

/**
 * Sends through the conversation's own Whatsmiau instance, recorded as an AI
 * outbound so it never trips the human-takeover pause.
 */
export class SupabaseSupportSendPort implements SupportSendPort {
  constructor(
    private readonly client: SupportEventsSupabaseClient,
    private readonly whatsapp: Pick<WhatsAppService, "sendText">,
    /** Registers the text before the provider call so the echo is not "human". */
    private readonly markAutomation?: (text: string) => Promise<void>,
  ) {}

  /** Accept any Supabase client; only the loose PostgREST surface is used. */
  static from(
    client: unknown,
    whatsapp: Pick<WhatsAppService, "sendText">,
    markAutomation?: (text: string) => Promise<void>,
  ): SupabaseSupportSendPort {
    return new SupabaseSupportSendPort(
      client as SupportEventsSupabaseClient,
      whatsapp,
      markAutomation,
    );
  }

  async findConversation(input: {
    conversationId: string;
    workspaceId?: string;
  }): Promise<SupportSendConversation | null> {
    let query = this.client
      .from("conversations")
      .select("id, workspace_id, ai_mode, contact_id")
      .eq("id", input.conversationId);
    if (input.workspaceId) query = query.eq("workspace_id", input.workspaceId);
    const result = await query.limit(1);
    if (result.error)
      throw new Error(`supabase:conversations:${result.error.message}`);
    const row = (Array.isArray(result.data) ? result.data[0] : undefined) as
      | Record<string, unknown>
      | undefined;
    if (!row || typeof row.workspace_id !== "string") return null;
    let isGroup = false;
    if (typeof row.contact_id === "string") {
      const contact = await this.client
        .from("contacts")
        .select("provider_contact_id")
        .eq("id", row.contact_id)
        .limit(1);
      if (contact.error)
        throw new Error(`supabase:contacts:${contact.error.message}`);
      const jid = (
        Array.isArray(contact.data) ? contact.data[0] : undefined
      ) as Record<string, unknown> | undefined;
      isGroup =
        typeof jid?.provider_contact_id === "string" &&
        jid.provider_contact_id.endsWith("@g.us");
    }
    return {
      workspaceId: row.workspace_id,
      isGroup,
      // Fail closed: a conversation without a mode is treated as off.
      aiMode: typeof row.ai_mode === "string" ? row.ai_mode : "off",
    };
  }

  async checkReplyGuard(input: {
    workspaceId: string;
    conversationId: string;
    sourceMessageId?: string;
  }): Promise<SupportReplyGuard> {
    const result = await this.client
      .from("messages")
      .select("id, direction, ai_generated, created_at, message_type")
      .eq("workspace_id", input.workspaceId)
      .eq("conversation_id", input.conversationId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (result.error)
      throw new Error(`supabase:messages:${result.error.message}`);
    const messages = (
      Array.isArray(result.data)
        ? (result.data as Record<string, unknown>[])
        : []
    ).flatMap((row) =>
      typeof row.id === "string" && typeof row.created_at === "string"
        ? [
            {
              id: row.id,
              direction: String(row.direction),
              aiGenerated: row.ai_generated === true,
              createdAt: row.created_at,
              ...(typeof row.message_type === "string"
                ? { messageType: row.message_type }
                : {}),
            },
          ]
        : [],
    );
    return evaluateReplyGuard({
      messages,
      ...(input.sourceMessageId
        ? { sourceMessageId: input.sourceMessageId }
        : {}),
    });
  }

  async sendText(input: SupportSendInput): Promise<SupportSendResult> {
    let providerMessageId: string | undefined;
    try {
      const sent = await this.whatsapp.sendText(
        { workspaceId: input.workspaceId, actorType: "ai" },
        input.conversationId,
        {
          text: input.text,
          aiGenerated: true,
          ...(input.idempotencyKey
            ? { idempotencyKey: input.idempotencyKey }
            : {}),
          // Mark before the provider call: the fromMe echo can be ingested
          // before we record the send and must not read as a human.
          ...(this.markAutomation
            ? {
                beforeProviderSend: async (text: string) => {
                  try {
                    await registerAutomationMark(this.markAutomation!, text);
                  } catch (error) {
                    throw new AutomationMarkError("automation_mark_failed", {
                      cause: error,
                    });
                  }
                },
              }
            : {}),
          onProviderMessageId: (id) => {
            providerMessageId = id;
          },
        },
      );
      // If the echo was stored first it is not flagged AI; fix the flag so
      // the stale-reply guard never reads the bot's own text as a human.
      if (!sent.message.aiGenerated) {
        try {
          await this.client
            .from("messages")
            .update({ ai_generated: true })
            .eq("workspace_id", input.workspaceId)
            .eq("id", sent.message.id);
        } catch {
          // best effort
        }
      }
      return {
        messageId: sent.message.id,
        providerMessageId: sent.providerMessageId,
      };
    } catch (error) {
      // The customer already got the text; report it instead of a 5xx the bot
      // would retry into a double send.
      if (providerMessageId && !(error instanceof OutboundSendError))
        return { messageId: null, providerMessageId, recorded: false };
      throw error;
    }
  }
}

const supportSendBodySchema = z.object({
  conversationId: z.string().uuid(),
  text: z.string().trim().min(1).max(MAX_SUPPORT_TEXT_LENGTH),
  workspaceId: z.string().uuid().optional(),
  /** The inbound message being answered; enables the stale-reply check. */
  sourceMessageId: z.string().uuid().optional(),
});

const supportSendLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

const outboundFailureStatus: Record<OutboundSendError["reason"], number> = {
  channel_disconnected: 503,
  provider_rejected: 502,
  provider_unavailable: 502,
  provider_timeout: 504,
};

export interface SupportSendRouteOptions {
  internalWorkspace: import("./internal-workspace.js").InternalWorkspacePort;
  port: SupportSendPort | null;
  env?: NodeJS.ProcessEnv;
  logger?: Pick<Logger, "error">;
}

/**
 * Support bot reply path. Shares the B1 feed key, mounted outside /api so it
 * never takes a user JWT, and refuses with 409 when ai_mode=off or a human
 * has taken over the conversation.
 */
export function registerInternalSupportSendRoute(
  app: Express,
  options: SupportSendRouteOptions,
): void {
  const env = options.env ?? process.env;
  app.post(
    SUPPORT_SEND_PATH,
    supportSendLimiter,
    async (request: Request, response: Response) => {
      const auth = authorizeSupportEventsRequest(
        request.get(SUPPORT_EVENTS_KEY_HEADER)?.trim() || undefined,
        env,
      );
      if (!auth.ok)
        return response.status(auth.status).json({ error: auth.error });
      const parsed = supportSendBodySchema.safeParse(request.body);
      if (!parsed.success)
        return response.status(400).json({ error: "invalid_body" });
      if (!options.port)
        return response
          .status(503)
          .json({ error: "support_send_not_configured" });

      const { conversationId, text, sourceMessageId } = parsed.data;
      const headerKey =
        request.get("idempotency-key")?.trim().slice(0, 200) || undefined;
      try {
        const workspaceId = await resolveInternalWorkspace(
          options.internalWorkspace,
          parsed.data.workspaceId,
        );
        const conversation = await options.port.findConversation({
          conversationId,
          workspaceId,
        });
        if (
          !conversation ||
          (workspaceId && conversation.workspaceId !== workspaceId)
        )
          return response.status(404).json({ error: "conversation_not_found" });
        if (!supportReplyAllowed({ aiMode: conversation.aiMode }))
          return response.status(409).json({ error: "reply_not_allowed" });
        if (conversation.isGroup)
          return response.status(409).json({ error: "group_conversation" });
        const guard = options.port.checkReplyGuard
          ? await options.port.checkReplyGuard({
              workspaceId: conversation.workspaceId,
              conversationId,
              ...(sourceMessageId ? { sourceMessageId } : {}),
            })
          : {};
        if (guard.reject)
          return response.status(409).json({ error: guard.reject });
        const idempotencyKey =
          headerKey ??
          deriveSupportIdempotencyKey({
            conversationId,
            anchorMessageId: sourceMessageId ?? guard.latestInboundId,
            text,
          });
        const sent = await options.port.sendText({
          workspaceId: conversation.workspaceId,
          conversationId,
          text,
          idempotencyKey,
        });
        return response.status(201).json({
          workspaceId: conversation.workspaceId,
          conversationId,
          ...sent,
        });
      } catch (error) {
        if (error instanceof InternalWorkspaceError)
          return response
            .status(error.code === "workspace_not_found" ? 404 : 503)
            .json({ error: error.code });
        if (error instanceof AutomationMarkError) {
          options.logger?.error({ err: error }, "Support send mark failed");
          return response
            .status(503)
            .json({ error: "automation_mark_unavailable" });
        }
        if (error instanceof OutboundSendError) {
          // The provider's own answer is the only evidence of why WhatsApp
          // refused this send; without it a 502 cannot be diagnosed.
          const provider = error.providerError as
            | { status?: unknown; responseBody?: unknown; message?: unknown }
            | undefined;
          options.logger?.error(
            {
              conversationId: parsed.data.conversationId,
              reason: error.reason,
              providerStatus: provider?.status,
              providerBody:
                typeof provider?.responseBody === "string"
                  ? provider.responseBody.slice(0, 1_000)
                  : undefined,
              providerMessage:
                typeof provider?.message === "string"
                  ? provider.message
                  : undefined,
            },
            "Support send provider failure",
          );
          return response
            .status(outboundFailureStatus[error.reason])
            .json({ error: error.reason });
        }
        if (
          error instanceof Error &&
          error.message === "conversation_not_found"
        )
          return response.status(404).json({ error: "conversation_not_found" });
        options.logger?.error({ err: error }, "Support send failed");
        return response.status(500).json({ error: "support_send_failed" });
      }
    },
  );
}
