import crypto from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import pino from "pino";
import { z } from "zod";
import { createSupportAiProvider } from "./providers.js";
import { gateAiAction, triageConversation, type AiMode } from "./triage.js";
import { InMemoryJobStore } from "./jobs.js";
import {
  enqueueWhatsmiauEvent,
  type WhatsmiauMessageJobPayload,
} from "./worker.js";
import { WhatsmiauMessagingProvider } from "./whatsmiau.js";
import {
  createServerSupabaseClient,
  hasServerSupabaseConfig,
} from "./supabase.js";
import { SupabaseJobStore } from "./persistence.js";
import { authenticateRequest } from "./auth.js";
import { createApiRouter, type AuthAdapter } from "./api-router.js";
import { SupabaseApiAdapters } from "./supabase-api-adapters.js";
import { createSupabaseLiveWorker, type LiveWorker } from "./live-worker.js";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
export const app = express();

const supabaseOrigin = (() => {
  try {
    return new URL(
      process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "",
    ).origin;
  } catch {
    return null;
  }
})();
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        connectSrc: [
          "'self'",
          ...(supabaseOrigin ? [supabaseOrigin] : []),
          ...(supabaseOrigin
            ? [supabaseOrigin.replace(/^https:/, "wss:")]
            : []),
        ],
      },
    },
  }),
);
// The live attachment path accepts bounded base64 data URLs (validated again
// by the API/media normalizer). Keep the parser limit just above the 12 MiB
// data-url contract so oversized requests are rejected before route work.
app.use(express.json({ limit: "13mb" }));
// Whatsmiau reaches this API through a TLS reverse proxy/tunnel in local
// development and through a load balancer in production. Trust one proxy so
// rate limiting and request IP handling use the forwarded client address.
app.set("trust proxy", 1);
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
app.use((request, response, next) => {
  const origin = request.get("origin");
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Mend-Workspace-Id",
    );
    response.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PATCH,DELETE,OPTIONS",
    );
  }
  if (request.method === "OPTIONS") return response.sendStatus(204);
  next();
});

const WebhookPayloadSchema = z.record(z.unknown());
const DraftSchema = z.object({
  conversation: z.string().min(1).max(12_000),
  knowledge: z.string().max(50_000).optional(),
});
const TriageSchema = z.object({
  conversation: z.string().min(1).max(12_000),
  mode: z.enum(["off", "draft", "safe_auto"]).default("draft"),
});
const WorkspaceHeader = z.string().uuid().optional();
const InstanceNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(/^[A-Za-z0-9._-]+$/);
const CreateInstanceSchema = z
  .object({ instanceName: InstanceNameSchema })
  .strict();

const serverSupabase = createServerSupabaseClient();
const workerSupabase = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? serverSupabase
  : null;
const messageJobs = workerSupabase
  ? new SupabaseJobStore<WhatsmiauMessageJobPayload>(workerSupabase)
  : new InMemoryJobStore<WhatsmiauMessageJobPayload>();

function secretMatches(
  value: string | undefined,
  expected: string | undefined,
): boolean {
  if (!value || !expected) return false;
  const left = Buffer.from(value);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

app.get("/api/health", (_request, response) =>
  response.json({ ok: true, service: "mend-api" }),
);

app.get("/api/ready", (_request, response) => {
  const codexRoot = process.env.CODEX_WORKSPACE_ROOT?.trim() ?? "";
  const checks = {
    supabase: hasServerSupabaseConfig(),
    whatsMiau: Boolean(process.env.WHATSMIAU_API_KEY),
    webhook: Boolean(process.env.WHATSMIAU_WEBHOOK_SECRET),
    openai: Boolean(process.env.OPENAI_API_KEY),
    codexWorkspace: Boolean(codexRoot && existsSync(codexRoot)),
  };
  const ready = Object.values(checks).every(Boolean);
  return response.status(ready ? 200 : 503).json({ ready, checks });
});

app.post("/webhooks/whatsmiau", (request, response) => {
  const authorization = request.get("authorization");
  const expected = process.env.WHATSMIAU_WEBHOOK_SECRET;
  if (
    !secretMatches(authorization, expected ? `Bearer ${expected}` : undefined)
  ) {
    logger.warn(
      {
        hasAuthorization: Boolean(authorization),
        ip: request.ip,
        userAgent: request.get("user-agent") ?? undefined,
      },
      "Whatsmiau webhook rejected",
    );
    return response
      .status(401)
      .json({ error: "Invalid webhook authorization" });
  }
  const parsed = WebhookPayloadSchema.safeParse(request.body as unknown);
  if (!parsed.success)
    return response.status(400).json({ error: "Invalid webhook payload" });

  const instanceName =
    typeof parsed.data.instance === "string"
      ? parsed.data.instance
      : typeof parsed.data.instanceName === "string"
        ? parsed.data.instanceName
        : "";
  const workspaceHeader = WorkspaceHeader.safeParse(
    request.get("x-mend-workspace-id"),
  );
  void enqueueWhatsmiauEvent(messageJobs, parsed.data, instanceName, {
    ...(workspaceHeader.success && workspaceHeader.data
      ? { workspaceId: workspaceHeader.data }
      : {}),
  })
    .then((jobs) =>
      logger.info(
        { event: parsed.data.event ?? "unknown", queued: jobs.length },
        "Whatsmiau webhook accepted",
      ),
    )
    .catch((error) =>
      logger.error({ err: error }, "Whatsmiau webhook queueing failed"),
    );
  // Acknowledge first; persistence, media fetching and AI triage remain worker work.
  return response.status(202).json({ accepted: true });
});

const apiAuth: AuthAdapter = {
  async authenticate(request) {
    try {
      const auth = await authenticateRequest(request);
      return {
        id: auth.user.id,
        email: auth.user.email ?? null,
        name:
          auth.user.user_metadata?.name ??
          auth.user.user_metadata?.full_name ??
          null,
      };
    } catch {
      return null;
    }
  },
};

async function requireAiAuthentication(
  request: express.Request,
  response: express.Response,
): Promise<boolean> {
  try {
    await authenticateRequest(request);
    return true;
  } catch {
    response.status(401).json({ error: "Authentication is required" });
    return false;
  }
}

app.post("/api/ai/draft", async (request, response) => {
  if (!(await requireAiAuthentication(request, response))) return;
  const parsed = DraftSchema.safeParse(request.body as unknown);
  if (!parsed.success)
    return response
      .status(400)
      .json({ error: "Conversation context is required" });
  try {
    const provider = createSupportAiProvider();
    const draft = await provider.draftReply(
      parsed.data.conversation,
      parsed.data.knowledge,
    );
    return response.json({ draft, provider: provider.name });
  } catch (error) {
    logger.error({ err: error }, "AI draft failed");
    return response.status(502).json({ error: "AI provider unavailable" });
  }
});

app.post("/api/ai/triage", async (request, response) => {
  if (!(await requireAiAuthentication(request, response))) return;
  const parsed = TriageSchema.safeParse(request.body as unknown);
  if (!parsed.success)
    return response
      .status(400)
      .json({ error: "Conversation context is required" });
  try {
    const provider = createSupportAiProvider();
    const triage = await triageConversation(provider, parsed.data.conversation);
    return response.json({
      triage,
      decision: gateAiAction(parsed.data.mode as AiMode, triage),
      provider: provider.name,
    });
  } catch (error) {
    logger.error({ err: error }, "AI triage failed");
    return response.status(502).json({ error: "AI provider unavailable" });
  }
});

app.get("/api/whatsapp/instances", async (request, response) => {
  const localDevAccess =
    process.env.NODE_ENV !== "production" &&
    process.env.MEND_DEV_MODE === "1" &&
    ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.ip ?? "");
  if (!localDevAccess && !process.env.MEND_API_TOKEN)
    return response
      .status(503)
      .json({ error: "Mend API admin token is not configured" });
  if (
    !localDevAccess &&
    !secretMatches(
      request.get("authorization"),
      `Bearer ${process.env.MEND_API_TOKEN}`,
    )
  )
    return response.status(401).json({ error: "Invalid API authorization" });
  if (!process.env.WHATSMIAU_API_KEY)
    return response.status(503).json({ error: "Whatsmiau is not configured" });
  try {
    const instances = await new WhatsmiauMessagingProvider().listInstances();
    // Provider payloads may contain webhook URLs with embedded tokens. Return only the operator-safe summary.
    return response.json(
      instances.map((instance) => ({
        instanceName: instance.instanceName,
        state: instance.state,
        phoneNumber: instance.phoneNumber ?? null,
      })),
    );
  } catch (error) {
    logger.error({ err: error }, "Whatsmiau instance listing failed");
    return response.status(502).json({ error: "Whatsmiau unavailable" });
  }
});

function hasWhatsAppAdminAccess(request: express.Request) {
  const localDevAccess =
    process.env.NODE_ENV !== "production" &&
    process.env.MEND_DEV_MODE === "1" &&
    ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.ip ?? "");
  return (
    localDevAccess ||
    secretMatches(
      request.get("authorization"),
      process.env.MEND_API_TOKEN
        ? `Bearer ${process.env.MEND_API_TOKEN}`
        : undefined,
    )
  );
}

app.post("/api/whatsapp/instances", async (request, response) => {
  if (!hasWhatsAppAdminAccess(request))
    return response.status(401).json({ error: "Invalid API authorization" });
  if (!process.env.WHATSMIAU_API_KEY)
    return response.status(503).json({ error: "Whatsmiau is not configured" });
  const parsed = CreateInstanceSchema.safeParse(request.body as unknown);
  if (!parsed.success)
    return response
      .status(400)
      .json({ error: "A valid instanceName is required" });
  try {
    const instance = await new WhatsmiauMessagingProvider().createInstance({
      instanceName: parsed.data.instanceName,
      qrcode: true,
    });
    return response.status(201).json({
      instanceName: instance.instanceName,
      state: instance.state,
      phoneNumber: instance.phoneNumber ?? null,
    });
  } catch (error) {
    logger.error({ err: error }, "Whatsmiau instance creation failed");
    return response.status(502).json({ error: "Whatsmiau unavailable" });
  }
});

app.post(
  "/api/whatsapp/instances/:instanceName/connect",
  async (request, response) => {
    if (!hasWhatsAppAdminAccess(request))
      return response.status(401).json({ error: "Invalid API authorization" });
    if (!process.env.WHATSMIAU_API_KEY)
      return response
        .status(503)
        .json({ error: "Whatsmiau is not configured" });
    const parsed = InstanceNameSchema.safeParse(request.params.instanceName);
    if (!parsed.success)
      return response.status(400).json({ error: "Invalid instance name" });
    try {
      return response.json(
        await new WhatsmiauMessagingProvider().connectInstance(parsed.data),
      );
    } catch (error) {
      logger.error({ err: error }, "Whatsmiau connection request failed");
      return response.status(502).json({ error: "Whatsmiau unavailable" });
    }
  },
);

app.get(
  "/api/whatsapp/instances/:instanceName/qr",
  async (request, response) => {
    if (!hasWhatsAppAdminAccess(request))
      return response.status(401).json({ error: "Invalid API authorization" });
    if (!process.env.WHATSMIAU_API_KEY)
      return response
        .status(503)
        .json({ error: "Whatsmiau is not configured" });
    const parsed = InstanceNameSchema.safeParse(request.params.instanceName);
    if (!parsed.success)
      return response.status(400).json({ error: "Invalid instance name" });
    try {
      const qr = await new WhatsmiauMessagingProvider().getQrCode(parsed.data);
      if (!qr)
        return response.status(404).json({ error: "QR code is not available" });
      return response.json({
        qr: `data:image/png;base64,${qr.toString("base64")}`,
      });
    } catch (error) {
      logger.error({ err: error }, "Whatsmiau QR request failed");
      return response.status(502).json({ error: "Whatsmiau unavailable" });
    }
  },
);

app.get(
  "/api/whatsapp/instances/:instanceName/state",
  async (request, response) => {
    if (!hasWhatsAppAdminAccess(request))
      return response.status(401).json({ error: "Invalid API authorization" });
    if (!process.env.WHATSMIAU_API_KEY)
      return response
        .status(503)
        .json({ error: "Whatsmiau is not configured" });
    const parsed = InstanceNameSchema.safeParse(request.params.instanceName);
    if (!parsed.success)
      return response.status(400).json({ error: "Invalid instance name" });
    try {
      return response.json(
        await new WhatsmiauMessagingProvider().getConnectionState(parsed.data),
      );
    } catch (error) {
      logger.error({ err: error }, "Whatsmiau connection state request failed");
      return response.status(502).json({ error: "Whatsmiau unavailable" });
    }
  },
);

app.delete(
  "/api/whatsapp/instances/:instanceName",
  async (request, response) => {
    if (!hasWhatsAppAdminAccess(request))
      return response.status(401).json({ error: "Invalid API authorization" });
    if (!process.env.WHATSMIAU_API_KEY)
      return response
        .status(503)
        .json({ error: "Whatsmiau is not configured" });
    const parsed = InstanceNameSchema.safeParse(request.params.instanceName);
    if (!parsed.success)
      return response.status(400).json({ error: "Invalid instance name" });
    try {
      await new WhatsmiauMessagingProvider().disconnect(parsed.data);
      return response.status(204).send();
    } catch (error) {
      logger.error({ err: error }, "Whatsmiau disconnect failed");
      return response.status(502).json({ error: "Whatsmiau unavailable" });
    }
  },
);

app.get("/api/runtime", async (_request, response) =>
  response.json({
    service: "mend-api",
    supabase: hasServerSupabaseConfig(),
    whatsMiau: Boolean(process.env.WHATSMIAU_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
    aiProvider: process.env.SUPPORT_AI_PROVIDER ?? "openai",
    jobs: (await messageJobs.list()).length,
  }),
);

if (serverSupabase) {
  // Keep the server role for the worker, but bind API queries/RPCs to the
  // caller's bearer token when present. This preserves explicit workspace
  // predicates while allowing RLS/RBAC functions to see auth.uid().
  app.use((request, response, next) => {
    if (!request.path.startsWith("/api/")) return next();
    const authorization = request.get("authorization") ?? "";
    const token = /^Bearer\s+(.+)$/i.exec(authorization)?.[1]?.trim();
    const client = token ? createServerSupabaseClient(token) : serverSupabase;
    if (!client) return next();
    try {
      const apiAdapters = new SupabaseApiAdapters({
        client,
        privilegedClient: serverSupabase,
      }).dependencies();
      return createApiRouter({ auth: apiAuth, ...apiAdapters })(
        request,
        response,
        next,
      );
    } catch (error) {
      return next(error);
    }
  });
}

// Express's body parser otherwise emits an HTML 413 response for an oversized
// browser attachment. Keep the live API error envelope stable.
app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    next: express.NextFunction,
  ) => {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status?: unknown }).status)
        : 0;
    if (status === 413)
      return response.status(413).json({
        error: {
          code: "payload_too_large",
          message: "Request body is too large.",
        },
      });
    return next(error);
  },
);

const frontendDirectory = path.resolve(process.cwd(), "dist");
const frontendIndex = path.join(frontendDirectory, "index.html");
if (existsSync(frontendIndex)) {
  app.use(express.static(frontendDirectory, { index: false }));
  app.use((request, response, next) => {
    if (
      request.method !== "GET" ||
      request.path.startsWith("/api/") ||
      request.path.startsWith("/webhooks/")
    )
      return next();
    return response.sendFile(frontendIndex);
  });
}

let liveWorker: LiveWorker | undefined;
if (workerSupabase && process.env.OPENAI_API_KEY) {
  liveWorker = createSupabaseLiveWorker({
    client: workerSupabase,
    jobStore: messageJobs,
    provider: createSupportAiProvider(),
    whatsappProvider: new WhatsmiauMessagingProvider(),
    pollIntervalMs: Number(process.env.MEND_WORKER_POLL_MS ?? 1_000),
    onUnmappedMessage: (input) =>
      logger.warn(
        { instanceName: input.instanceName, jobId: input.jobId },
        "Whatsmiau message ignored because no channel is mapped",
      ),
  });
  liveWorker.start();
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 8787);
  const server = app.listen(port, () =>
    logger.info(
      {
        port,
        apiRouter: Boolean(serverSupabase),
        liveWorker: Boolean(liveWorker),
      },
      "Mend API listening",
    ),
  );
  const shutdown = () => {
    void liveWorker?.stop().finally(() => server.close());
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
