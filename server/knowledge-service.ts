import { z } from "zod";

export const knowledgeStatusSchema = z.enum(["draft", "published"]);

export const knowledgeCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(240),
    category: z.string().trim().min(1).max(120).default("Support"),
    body: z.string().trim().min(1).max(100_000),
    status: knowledgeStatusSchema.default("draft"),
  })
  .strict();

export const knowledgePatchSchema = knowledgeCreateSchema.partial().strict();

export const knowledgeListQuerySchema = z
  .object({
    search: z.string().trim().max(240).optional(),
    category: z.string().trim().max(120).optional(),
    status: knowledgeStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
    cursor: z.string().trim().max(200).optional(),
  })
  .strict();

export interface KnowledgeRequestContext {
  userId: string;
  workspaceId: string;
  role: "owner" | "admin" | "agent" | "viewer";
}

export type KnowledgeCreateInput = z.infer<typeof knowledgeCreateSchema>;
export type KnowledgePatchInput = z.infer<typeof knowledgePatchSchema>;
export type KnowledgeListQuery = z.infer<typeof knowledgeListQuerySchema>;

export interface KnowledgePort {
  list(
    context: KnowledgeRequestContext,
    query: KnowledgeListQuery,
  ): Promise<unknown>;
  create(
    context: KnowledgeRequestContext,
    input: KnowledgeCreateInput,
  ): Promise<unknown>;
  update(
    context: KnowledgeRequestContext,
    id: string,
    input: KnowledgePatchInput,
  ): Promise<unknown | null>;
  remove(context: KnowledgeRequestContext, id: string): Promise<boolean>;
}

export class KnowledgeService {
  constructor(private readonly port: KnowledgePort) {}

  list(context: KnowledgeRequestContext, input: unknown) {
    return this.port.list(context, knowledgeListQuerySchema.parse(input));
  }

  create(context: KnowledgeRequestContext, input: unknown) {
    return this.port.create(context, knowledgeCreateSchema.parse(input));
  }

  update(context: KnowledgeRequestContext, id: unknown, input: unknown) {
    return this.port.update(
      context,
      z.string().uuid().parse(id),
      knowledgePatchSchema.parse(input),
    );
  }

  remove(context: KnowledgeRequestContext, id: unknown) {
    return this.port.remove(context, z.string().uuid().parse(id));
  }
}
