import { z } from "zod";

export const issueStatusSchema = z.enum([
  "triage",
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
  "canceled",
]);
export const issuePrioritySchema = z.enum([
  "urgent",
  "high",
  "medium",
  "low",
  "none",
]);
export const issueTypeSchema = z.enum([
  "production_bug",
  "bug",
  "incident",
  "feature",
  "task",
  "billing",
  "commercial",
  "question",
  "other",
]);
export const issueSourceSchema = z.enum(["conversation", "internal", "ai"]);

const nullableText = z.string().trim().max(20_000).nullable();
const issueDueDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date (YYYY-MM-DD)");

export const issueCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(240),
    type: issueTypeSchema,
    priority: issuePrioritySchema.default("none"),
    status: issueStatusSchema.default("triage"),
    source: issueSourceSchema.default("internal"),
    description: nullableText.optional(),
    aiSummary: nullableText.optional(),
    impact: nullableText.optional(),
    reproductionSteps: z
      .array(z.string().trim().min(1).max(2_000))
      .max(50)
      .default([]),
    expectedBehavior: nullableText.optional(),
    actualBehavior: nullableText.optional(),
    affectedProduct: z.string().trim().max(240).nullable().optional(),
    affectedEnvironment: z.string().trim().max(240).nullable().optional(),
    confidence: z.number().min(0).max(1).nullable().optional(),
    conversationId: z.string().uuid().nullable().optional(),
    contactId: z.string().uuid().nullable().optional(),
    assignedUserId: z.string().uuid().nullable().optional(),
    dueOn: issueDueDate.nullable().optional(),
    labels: z.array(z.string().trim().min(1).max(64)).max(30).default([]),
  })
  .strict();

export const issuePatchSchema = issueCreateSchema
  .partial()
  .extend({
    parentIssueId: z.string().uuid().nullable().optional(),
    duplicateOfIssueId: z.string().uuid().nullable().optional(),
  })
  .strict();

export const issueListQuerySchema = z
  .object({
    status: issueStatusSchema.optional(),
    priority: issuePrioritySchema.optional(),
    assignedUserId: z.string().uuid().optional(),
    search: z.string().trim().max(240).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    cursor: z.string().trim().max(200).optional(),
  })
  .strict();

export const issueIdentifierSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z][A-Za-z0-9-]{1,31}$/, "Invalid issue identifier");

export const issueCommentSchema = z
  .object({
    body: z.string().trim().min(1).max(20_000),
  })
  .strict();

export const issueEvidenceSchema = z
  .object({
    kind: z.enum(["text", "message", "file", "link"]),
    label: z.string().trim().min(1).max(240),
    body: z.string().trim().max(20_000).optional(),
    messageId: z.string().uuid().optional(),
    storagePath: z.string().trim().max(1_000).optional(),
    mimeType: z.string().trim().max(120).optional(),
    size: z
      .number()
      .int()
      .nonnegative()
      .max(100 * 1024 * 1024)
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.kind === "message" && !value.messageId)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["messageId"],
        message: "messageId is required for message evidence",
      });
    if (value.kind === "file" && !value.storagePath)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["storagePath"],
        message: "storagePath is required for file evidence",
      });
    if (value.kind === "link" && !value.body)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["body"],
        message: "body is required for link evidence",
      });
  });

export const issueLinkMessageSchema = z
  .object({
    messageId: z.string().uuid(),
  })
  .strict();

export const resolveAndNotifySchema = z
  .object({
    message: z.string().trim().max(4_000).optional(),
    notifyCustomer: z.boolean().default(true),
  })
  .strict();

export interface IssueRequestContext {
  userId: string;
  workspaceId: string;
  role: "owner" | "admin" | "agent" | "viewer";
}

export type IssueCreateInput = z.infer<typeof issueCreateSchema>;
export type IssuePatchInput = z.infer<typeof issuePatchSchema>;
export type IssueListQuery = z.infer<typeof issueListQuerySchema>;
export type IssueCommentInput = z.infer<typeof issueCommentSchema>;
export type IssueEvidenceInput = z.infer<typeof issueEvidenceSchema>;
export type IssueLinkMessageInput = z.infer<typeof issueLinkMessageSchema>;
export type ResolveAndNotifyInput = z.infer<typeof resolveAndNotifySchema>;

export interface IssuePort {
  list(context: IssueRequestContext, query: IssueListQuery): Promise<unknown>;
  create(
    context: IssueRequestContext,
    input: IssueCreateInput,
  ): Promise<unknown>;
  get(
    context: IssueRequestContext,
    identifier: string,
  ): Promise<unknown | null>;
  update(
    context: IssueRequestContext,
    identifier: string,
    input: IssuePatchInput,
  ): Promise<unknown | null>;
  remove(context: IssueRequestContext, identifier: string): Promise<boolean>;
  addComment(
    context: IssueRequestContext,
    identifier: string,
    input: IssueCommentInput,
  ): Promise<unknown | null>;
  addEvidence(
    context: IssueRequestContext,
    identifier: string,
    input: IssueEvidenceInput,
  ): Promise<unknown | null>;
  linkMessage(
    context: IssueRequestContext,
    identifier: string,
    input: IssueLinkMessageInput,
  ): Promise<unknown | null>;
  resolveAndNotify(
    context: IssueRequestContext,
    identifier: string,
    input: ResolveAndNotifyInput,
  ): Promise<unknown | null>;
}

export class IssueService {
  constructor(private readonly port: IssuePort) {}

  list(context: IssueRequestContext, input: unknown) {
    return this.port.list(context, issueListQuerySchema.parse(input));
  }

  create(context: IssueRequestContext, input: unknown) {
    return this.port.create(context, issueCreateSchema.parse(input));
  }

  get(context: IssueRequestContext, identifier: unknown) {
    return this.port.get(context, issueIdentifierSchema.parse(identifier));
  }

  update(context: IssueRequestContext, identifier: unknown, input: unknown) {
    return this.port.update(
      context,
      issueIdentifierSchema.parse(identifier),
      issuePatchSchema.parse(input),
    );
  }

  remove(context: IssueRequestContext, identifier: unknown) {
    return this.port.remove(context, issueIdentifierSchema.parse(identifier));
  }

  addComment(
    context: IssueRequestContext,
    identifier: unknown,
    input: unknown,
  ) {
    return this.port.addComment(
      context,
      issueIdentifierSchema.parse(identifier),
      issueCommentSchema.parse(input),
    );
  }

  addEvidence(
    context: IssueRequestContext,
    identifier: unknown,
    input: unknown,
  ) {
    return this.port.addEvidence(
      context,
      issueIdentifierSchema.parse(identifier),
      issueEvidenceSchema.parse(input),
    );
  }

  linkMessage(
    context: IssueRequestContext,
    identifier: unknown,
    input: unknown,
  ) {
    return this.port.linkMessage(
      context,
      issueIdentifierSchema.parse(identifier),
      issueLinkMessageSchema.parse(input),
    );
  }

  resolveAndNotify(
    context: IssueRequestContext,
    identifier: unknown,
    input: unknown,
  ) {
    return this.port.resolveAndNotify(
      context,
      issueIdentifierSchema.parse(identifier),
      resolveAndNotifySchema.parse(input),
    );
  }
}
