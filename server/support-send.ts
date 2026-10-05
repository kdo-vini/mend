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
}

export interface SupportSendInput {
  workspaceId: string;
  conversationId: string;
  text: string;
  idempotencyKey?: string;
}

export interface SupportSendResult {
  messageId: string;
  providerMessageId: string;
}

export interface SupportSendPort {
  findConversation(input: {
    conversationId: string;
    workspaceId?: string;
  }): Promise<SupportSendConversation | null>;
  sendText(input: SupportSendInput): Promise<SupportSendResult>;
}

/**
 * Sends through the conversation's own Whatsmiau instance, recorded as an AI
 * outbound so it never trips the human-takeover pause.
 */
export class SupabaseSupportSendPort implements SupportSendPort {
  constructor(
    private readonly client: SupportEventsSupabaseClient,
    private readonly whatsapp: Pick<WhatsAppService, "sendText">,
  ) {}

  /** Accept any Supabase client; only the loose PostgREST surface is used. */
  static from(
    client: unknown,
    whatsapp: Pick<WhatsAppService, "sendText">,
  ): SupabaseSupportSendPort {
    return new SupabaseSupportSendPort(
      client as SupportEventsSupabaseClient,
      whatsapp,
    );
  }

  async findConversation(input: {
    conversationId: string;
    workspaceId?: string;
  }): Promise<SupportSendConversation | null> {
    let query = this.client
      .from("conversations")
      .select("id, workspace_id, ai_mode")
      .eq("id", input.conversationId);
    if (input.workspaceId) query = query.eq("workspace_id", input.workspaceId);
    const result = await query.limit(1);
    if (result.error)
      throw new Error(`supabase:conversations:${result.error.message}`);
    const row = (Array.isArray(result.data) ? result.data[0] : undefined) as
      | Record<string, unknown>
      | undefined;
    if (!row || typeof row.workspace_id !== "string") return null;
    return {
      workspaceId: row.workspace_id,
      // Fail closed: a conversation without a mode is treated as off.
      aiMode: typeof row.ai_mode === "string" ? row.ai_mode : "off",
    };
  }

  async sendText(input: SupportSendInput): Promise<SupportSendResult> {
    const sent = await this.whatsapp.sendText(
      { workspaceId: input.workspaceId, actorType: "ai" },
      input.conversationId,
      {
        text: input.text,
        aiGenerated: true,
        ...(input.idempotencyKey
          ? { idempotencyKey: input.idempotencyKey }
          : {}),
      },
    );
    return {
      messageId: sent.message.id,
      providerMessageId: sent.providerMessageId,
    };
  }
}

const supportSendBodySchema = z.object({
  conversationId: z.string().uuid(),
  text: z.string().trim().min(1).max(MAX_SUPPORT_TEXT_LENGTH),
  workspaceId: z.string().uuid().optional(),
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
 * never takes a user JWT, and refuses with 409 when ai_mode=off.
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

      const { conversationId, text } = parsed.data;
      const idempotencyKey =
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
        const sent = await options.port.sendText({
          workspaceId: conversation.workspaceId,
          conversationId,
          text,
          ...(idempotencyKey ? { idempotencyKey } : {}),
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
        if (error instanceof OutboundSendError)
          return response
            .status(outboundFailureStatus[error.reason])
            .json({ error: error.reason });
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
