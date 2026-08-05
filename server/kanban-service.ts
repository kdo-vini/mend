import { z } from "zod";
import type { RequestContext, WorkspaceRole } from "./contracts/api-ports.js";

export const personalTaskStatusSchema = z.enum(["todo", "in_progress", "done"]);

export const issueKanbanStatusSchema = z.enum([
  "triage",
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
  "canceled",
]);

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date (YYYY-MM-DD)");

const nullableText = z.string().trim().max(20_000).nullable();

export const kanbanMoveSchema = z
  .object({
    status: z.string().trim().min(1).max(32),
    beforeId: z.string().uuid().nullable().optional(),
    afterId: z.string().uuid().nullable().optional(),
  })
  .strict();

export const issueKanbanMoveSchema = kanbanMoveSchema.extend({
  status: issueKanbanStatusSchema,
});

export const personalTaskMoveSchema = kanbanMoveSchema.extend({
  status: personalTaskStatusSchema,
});

export const personalTaskCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(240),
    notes: nullableText.optional(),
    status: personalTaskStatusSchema.default("todo"),
    dueOn: dateSchema.nullable().optional(),
  })
  .strict();

export const personalTaskPatchSchema = personalTaskCreateSchema
  .partial()
  .strict();

export const personalTaskListSchema = z
  .object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    status: personalTaskStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
    cursor: z.string().uuid().optional(),
  })
  .strict();

const personalEventFields = z.object({
  title: z.string().trim().min(1).max(240),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  allDay: z.boolean().default(false),
  location: z.string().trim().max(240).nullable().optional(),
});

export const personalEventCreateSchema = personalEventFields
  .strict()
  .superRefine((value, refinement) => {
    if (value.endsAt && new Date(value.endsAt) < new Date(value.startsAt)) {
      refinement.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsAt"],
        message: "endsAt must be after startsAt",
      });
    }
  });

export const personalEventPatchSchema = personalEventFields.partial().strict();

export const personalEventListSchema = z
  .object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  })
  .strict();

export interface KanbanMoveInput {
  status: string;
  beforeId?: string | null;
  afterId?: string | null;
}

export interface PersonalTaskCreateInput {
  title: string;
  notes?: string | null;
  status: "todo" | "in_progress" | "done";
  dueOn?: string | null;
}

export type PersonalTaskPatchInput = Partial<PersonalTaskCreateInput>;

export interface PersonalTaskListQuery {
  from?: string;
  to?: string;
  status?: "todo" | "in_progress" | "done";
  limit: number;
  cursor?: string;
}

export interface PersonalEventCreateInput {
  title: string;
  startsAt: string;
  endsAt?: string | null;
  allDay: boolean;
  location?: string | null;
}

export type PersonalEventPatchInput = Partial<PersonalEventCreateInput>;

export interface PersonalEventListQuery {
  from: string;
  to: string;
  limit: number;
}

export interface PersonalPlanningPort {
  listTasks(
    context: RequestContext,
    query: PersonalTaskListQuery,
  ): Promise<unknown>;
  createTask(
    context: RequestContext,
    input: PersonalTaskCreateInput,
  ): Promise<unknown>;
  updateTask(
    context: RequestContext,
    taskId: string,
    input: PersonalTaskPatchInput,
  ): Promise<unknown | null>;
  moveTask(
    context: RequestContext,
    taskId: string,
    input: KanbanMoveInput,
  ): Promise<unknown | null>;
  removeTask(context: RequestContext, taskId: string): Promise<boolean>;
  listEvents(
    context: RequestContext,
    query: PersonalEventListQuery,
  ): Promise<unknown>;
  createEvent(
    context: RequestContext,
    input: PersonalEventCreateInput,
  ): Promise<unknown>;
  updateEvent(
    context: RequestContext,
    eventId: string,
    input: PersonalEventPatchInput,
  ): Promise<unknown | null>;
  removeEvent(context: RequestContext, eventId: string): Promise<boolean>;
}

export interface KanbanIssuePort {
  move(
    context: RequestContext,
    identifier: string,
    input: KanbanMoveInput,
  ): Promise<unknown | null>;
}

export function canEditPersonalPlanning(role: WorkspaceRole): boolean {
  return role !== "viewer";
}
