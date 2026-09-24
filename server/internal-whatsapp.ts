import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import type { Logger } from "pino";
import {
  OUTBOUND_WHATSAPP_KEY_HEADER,
  OUTBOUND_WHATSAPP_PATH,
  authorizeOutboundWhatsAppRequest,
  forwardZeloChatSendText,
  parseOutboundWhatsAppBody,
  readZeloChatForwardConfig,
} from "./zelochat-internal-send.js";

export interface InternalWhatsAppRouteOptions {
  fetchImpl?: typeof fetch;
  logger?: Pick<Logger, "error" | "warn">;
  env?: NodeJS.ProcessEnv;
}

const outboundWhatsAppLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

function requestKey(request: Request): string | undefined {
  const header = request.get(OUTBOUND_WHATSAPP_KEY_HEADER);
  return header?.trim() || undefined;
}

/**
 * Machine gateway: Outbound/Grok Bot authenticates to Mend, Mend forwards to
 * ZeloChat Techne send. Mounted outside /api so it never takes a user JWT.
 */
export function registerInternalWhatsAppRoutes(
  app: Express,
  options: InternalWhatsAppRouteOptions = {},
): void {
  const env = options.env ?? process.env;
  app.post(
    OUTBOUND_WHATSAPP_PATH,
    outboundWhatsAppLimiter,
    async (request: Request, response: Response) => {
      const auth = authorizeOutboundWhatsAppRequest(requestKey(request), env);
      if (!auth.ok) {
        return response.status(auth.status).json({ error: auth.error });
      }

      const parsed = parseOutboundWhatsAppBody(request.body as unknown);
      if (!parsed.ok) {
        return response.status(400).json({ error: parsed.error });
      }

      const config = readZeloChatForwardConfig(env);
      if (!config) {
        return response.status(503).json({
          error: "zelochat_forward_not_configured",
        });
      }

      const idempotencyKey =
        request.get("idempotency-key")?.trim() ||
        request.get("x-idempotency-key")?.trim() ||
        undefined;

      try {
        const result = await forwardZeloChatSendText(
          { ...parsed.data, idempotencyKey },
          config,
          { fetchImpl: options.fetchImpl },
        );
        return response.status(result.status).json(result.body);
      } catch (error) {
        options.logger?.error(
          { err: error },
          "ZeloChat outbound WhatsApp forward failed",
        );
        return response.status(502).json({ error: "zelochat_unavailable" });
      }
    },
  );
}
