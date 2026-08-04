import { z } from "zod";

export const supportFlowOptionSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(80),
    nextNodeId: z.string().trim().max(80).optional(),
  })
  .strict();

export const supportFlowNodeSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(120),
    type: z.enum(["menu", "message", "handoff"]),
    message: z.string().trim().max(4_000),
    options: z.array(supportFlowOptionSchema).max(10).default([]),
  })
  .strict()
  .superRefine((node, context) => {
    if (node.type === "menu" && node.options.length < 1)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "A menu needs at least one option",
      });
    if (node.type !== "menu" && node.options.length > 0)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Only menu nodes can have options",
      });
  });

export const supportFlowSchema = z
  .object({
    version: z.literal(1),
    enabled: z.boolean(),
    trigger: z
      .object({
        type: z.enum(["first_message", "keywords"]),
        keywords: z.array(z.string().trim().min(1).max(80)).max(20),
      })
      .strict(),
    rootNodeId: z.string().trim().min(1).max(80),
    nodes: z.array(supportFlowNodeSchema).min(1).max(30),
  })
  .strict()
  .superRefine((flow, context) => {
    const ids = new Set<string>();
    for (const node of flow.nodes) {
      if (ids.has(node.id))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes"],
          message: `Duplicate node id: ${node.id}`,
        });
      ids.add(node.id);
    }
    if (!ids.has(flow.rootNodeId))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rootNodeId"],
        message: "Root node does not exist",
      });
    for (const node of flow.nodes)
      for (const option of node.options)
        if (option.nextNodeId && !ids.has(option.nextNodeId))
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["nodes"],
            message: `Unknown next node: ${option.nextNodeId}`,
          });
  });

export type SupportFlow = z.infer<typeof supportFlowSchema>;
export type SupportFlowNode = z.infer<typeof supportFlowNodeSchema>;
export type SupportFlowOption = z.infer<typeof supportFlowOptionSchema>;

export const defaultSupportFlow = (): SupportFlow => ({
  version: 1,
  enabled: false,
  trigger: { type: "first_message", keywords: [] },
  rootNodeId: "welcome",
  nodes: [
    {
      id: "welcome",
      title: "Welcome menu",
      type: "menu",
      message: "Olá! Como podemos ajudar?",
      options: [
        { id: "status", label: "Ver status do pedido" },
        { id: "human", label: "Falar com uma pessoa" },
      ],
    },
  ],
});

export function parseSupportFlow(value: unknown): SupportFlow | null {
  const parsed = supportFlowSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function flowFromChannelSettings(value: unknown): SupportFlow {
  const settings =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return parseSupportFlow(settings.supportFlow) ?? defaultSupportFlow();
}

export function flowToChannelSettings(
  settingsValue: unknown,
  flow: SupportFlow,
): Record<string, unknown> {
  const settings =
    settingsValue &&
    typeof settingsValue === "object" &&
    !Array.isArray(settingsValue)
      ? (settingsValue as Record<string, unknown>)
      : {};
  return { ...settings, supportFlow: flow };
}
