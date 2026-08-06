import { z } from "zod";
import {
  issueIdentifierSchema,
  issueListQuerySchema,
  issueSourceSchema,
  issueTypeSchema,
} from "../issue-service.js";
import { validateRemoteMediaUrl } from "../media.js";
import { supportFlowSchema } from "../../src/shared/support-flow.js";

export const workspaceRoleSchema = z.enum([
  "owner",
  "admin",
  "agent",
  "viewer",
]);
export const workspaceInvitationRoleSchema = z.enum([
  "admin",
  "agent",
  "viewer",
]);
export const allowedCommands = ["install", "lint", "test", "build"] as const;
export const uuid = z.string().uuid();
export const idParamSchema = z.object({ id: uuid }).strict();
export const issueParamSchema = z
  .object({ identifier: issueIdentifierSchema })
  .strict();
export const workspaceParamSchema = z.object({ id: uuid }).strict();

export const workspaceCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    issuePrefix: z
      .string()
      .trim()
      .regex(/^[A-Z][A-Z0-9]{1,7}$/)
      .default("TEC"),
    timezone: z.string().trim().min(1).max(80).default("UTC"),
    defaultLanguage: z.string().trim().min(2).max(12).default("en-US"),
  })
  .strict();
export const workspacePatchSchema = workspaceCreateSchema.partial().strict();
export const workspaceMemberRoleSchema = workspaceRoleSchema;
export const workspaceMemberListQuerySchema = z
  .object({
    role: workspaceMemberRoleSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
    cursor: z.string().trim().max(200).optional(),
  })
  .strict();
export const workspaceMemberCreateSchema = z
  .object({ userId: uuid, role: workspaceMemberRoleSchema.default("agent") })
  .strict();
export const workspaceMemberRolePatchSchema = z
  .object({ role: workspaceMemberRoleSchema })
  .strict();
export const workspaceInvitationCreateSchema = z
  .object({
    email: z.string().trim().email().max(320),
    role: workspaceInvitationRoleSchema.default("agent"),
  })
  .strict();
export const workspaceInvitationRolePatchSchema = z
  .object({ role: workspaceInvitationRoleSchema })
  .strict();
export const workspaceInvitationParamSchema = z
  .object({ id: uuid, invitationId: uuid })
  .strict();
export const auditLogListQuerySchema = z
  .object({
    action: z.string().trim().min(1).max(160).optional(),
    entityType: z.string().trim().min(1).max(120).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
    cursor: z.string().trim().max(80).optional(),
  })
  .strict();

export const channelListQuerySchema = z
  .object({
    status: z.enum(["open", "closed", "connecting", "qr-code"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().trim().max(200).optional(),
  })
  .strict();
export const channelCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    providerInstanceName: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .regex(/^[A-Za-z0-9._-]+$/),
    phoneNumber: z.string().trim().max(40).optional(),
    profileName: z.string().trim().max(160).optional(),
  })
  .strict();
export const channelFlowSchema = supportFlowSchema;

export const conversationListQuerySchema = z
  .object({
    status: z.enum(["open", "snoozed", "resolved"]).optional(),
    attentionState: z
      .enum(["needs_attention", "ai_handling", "waiting_customer", "none"])
      .optional(),
    aiMode: z.enum(["off", "draft", "safe_auto"]).optional(),
    assignedUserId: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
    cursor: z.string().trim().max(200).optional(),
  })
  .strict();
export const conversationPatchSchema = z
  .object({
    status: z.enum(["open", "snoozed", "resolved"]).optional(),
    attentionState: z
      .enum(["needs_attention", "ai_handling", "waiting_customer", "none"])
      .optional(),
    aiMode: z.enum(["off", "draft", "safe_auto"]).optional(),
    assignedUserId: uuid.nullable().optional(),
    snoozedUntil: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required",
  );
export const conversationSnoozeSchema = z
  .object({ until: z.string().datetime({ offset: true }) })
  .strict();
export const conversationAiPauseSchema = z
  .object({
    reason: z
      .enum([
        "human_message",
        "customer_requested_human",
        "unsafe_intent",
        "low_confidence",
        "manual_pause",
      ])
      .default("manual_pause"),
  })
  .strict();
export const messageReactionSchema = z
  .object({ reaction: z.string().trim().max(16) })
  .strict();
export const messagePresenceSchema = z
  .object({
    presence: z.enum(["composing", "recording", "paused"]).default("composing"),
  })
  .strict();
export const sendMessageSchema = z
  .object({
    messageType: z
      .enum(["text", "image", "video", "audio", "document"])
      .default("text"),
    text: z.string().trim().max(20_000).optional(),
    caption: z.string().trim().max(4_000).optional(),
    mediaUrl: z
      .string()
      .url()
      .max(4_000)
      .superRefine((value, context) => {
        try {
          validateRemoteMediaUrl(value);
        } catch {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "mediaUrl must be a public HTTPS URL",
          });
        }
      })
      .optional(),
    mediaDataUrl: z
      .string()
      .trim()
      .max(12 * 1024 * 1024)
      .optional(),
    fileName: z.string().trim().max(240).optional(),
    mimeType: z.string().trim().max(160).optional(),
    idempotencyKey: z.string().trim().min(8).max(200).optional(),
    mediaBatchId: uuid.optional(),
    assetId: uuid.optional(),
    attachments: z
      .array(
        z
          .object({
            assetId: uuid,
            messageType: z.enum(["image", "video", "audio", "document"]),
            caption: z.string().trim().max(4_000).optional(),
            idempotencyKey: z.string().trim().min(8).max(200),
          })
          .strict(),
      )
      .max(10)
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.attachments?.length) return;
    if (value.messageType === "text" && !value.text)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["text"],
        message: "text is required for text messages",
      });
    if (value.messageType !== "text" && !value.mediaUrl && !value.mediaDataUrl)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mediaUrl"],
        message: "mediaUrl or mediaDataUrl is required for media messages",
      });
    if (value.mediaDataUrl && !value.mediaDataUrl.startsWith("data:"))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mediaDataUrl"],
        message: "mediaDataUrl must be a data URL",
      });
  });

export const mediaUploadSchema = z
  .object({
    conversationId: uuid,
    batchId: uuid.optional(),
    fileName: z.string().trim().min(1).max(240),
    declaredMimeType: z.string().trim().max(160).optional(),
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(200 * 1024 * 1024),
    checksum: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .optional(),
  })
  .strict();

export const mediaAssetIdsQuerySchema = z
  .object({
    ids: z.string().trim().min(1).max(8_000),
  })
  .strict();

export const mediaPurposeSchema = z.enum([
  "original",
  "browser",
  "provider",
  "preview",
]);
export const aiDraftSchema = z
  .object({ instruction: z.string().trim().max(4_000).optional() })
  .strict();

export const issueListApiQuerySchema = issueListQuerySchema
  .extend({
    type: issueTypeSchema.optional(),
    source: issueSourceSchema.optional(),
    label: z.string().trim().min(1).max(64).optional(),
    contactId: uuid.optional(),
    conversationId: uuid.optional(),
    hasCodex: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
  })
  .strict();

export const repositoryListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().trim().max(200).optional(),
  })
  .strict();
export const repositoryPath = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine(
    (value) => !value.includes("\0"),
    "Path contains an invalid character",
  )
  .refine(
    (value) => !/(^|[\\/])\.\.([\\/]|$)/.test(value),
    "Path traversal is not allowed",
  );
export const repositoryInputSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    localPath: repositoryPath,
    defaultBranch: z.string().trim().min(1).max(160).default("main"),
    allowedCommands: z
      .array(z.enum(allowedCommands))
      .min(1)
      .max(allowedCommands.length)
      .default([...allowedCommands]),
  })
  .strict();
export const repositoryPatchSchema = repositoryInputSchema.partial().strict();

export const codingRunListQuerySchema = z
  .object({
    issueId: uuid.optional(),
    status: z
      .enum([
        "queued",
        "running",
        "completed",
        "failed",
        "canceled",
        "approved",
        "rejected",
      ])
      .optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().trim().max(200).optional(),
  })
  .strict();
export const codingRunCreateSchema = z
  .object({
    repositoryId: uuid.optional(),
    mode: z.enum(["investigate", "propose_fix", "implement_fix"]),
    branchBase: z.string().trim().min(1).max(160).default("main"),
    instructions: z.string().trim().max(20_000).optional(),
    allowChanges: z.boolean().default(false),
    commands: z
      .array(z.enum(allowedCommands))
      .max(allowedCommands.length)
      .default([]),
  })
  .strict();

export const googleOAuthCallbackSchema = z
  .object({
    code: z.string().trim().min(1).max(4_000),
    state: z.string().trim().min(1).max(4_000),
  })
  .strip();
export const googleCalendarSelectionSchema = z
  .object({
    selectedCalendarIds: z.array(z.string().trim().min(1).max(500)).max(200),
  })
  .strict();

export const mcpAuthModeSchema = z.enum(["none", "headers", "oauth"]);
export const mcpAiModeSchema = z.enum(["draft", "safe_auto"]);
export const mcpConnectionCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(4_000).optional(),
    serverUrl: z.string().trim().url().max(2_000),
    authMode: mcpAuthModeSchema.default("none"),
    headers: z
      .record(z.string().trim().min(1).max(120), z.string().max(4_000))
      .optional(),
    clientId: z.string().trim().max(1_000).optional(),
    clientSecret: z.string().trim().max(4_000).optional(),
  })
  .strict();
export const mcpConnectionPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(4_000).optional(),
    allowedToolNames: z
      .array(z.string().trim().min(1).max(200))
      .max(200)
      .optional(),
    writeModes: z.array(mcpAiModeSchema).max(2).optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required",
  );
