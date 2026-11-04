import { z } from "zod";

/**
 * Per-channel AI lock, stored in `channel_connections.settings_json.ai`.
 *
 * Each WhatsApp number serves a different client (Zelo, Diagium…). The AI of
 * one channel must never answer with another client's knowledge, tools or
 * customer data, so every field fails closed: a channel without an `ai` block
 * (or with an invalid one) has the AI off, no knowledge, no MCP tools and no
 * Zelo customer lookup.
 */
export const channelKnowledgeScopeSchema = z.discriminatedUnion("mode", [
  // Legacy behaviour: every published article of the workspace.
  z.object({ mode: z.literal("workspace") }).strict(),
  // Only articles mapped to these support products (no shared/unmapped ones).
  z
    .object({
      mode: z.literal("products"),
      productIds: z.array(z.string().uuid()).max(50),
    })
    .strict(),
]);

export const channelAiSettingsSchema = z
  .object({
    enabled: z.boolean(),
    knowledge: channelKnowledgeScopeSchema,
    mcpEnabled: z.boolean(),
    zeloCustomerLookup: z.boolean(),
  })
  .strict();

export type ChannelKnowledgeScope = z.infer<typeof channelKnowledgeScopeSchema>;
export type ChannelAiSettings = z.infer<typeof channelAiSettingsSchema>;

export function lockedChannelAiSettings(): ChannelAiSettings {
  return {
    enabled: false,
    knowledge: { mode: "products", productIds: [] },
    mcpEnabled: false,
    zeloCustomerLookup: false,
  };
}

export function channelAiFromSettings(value: unknown): ChannelAiSettings {
  const settings =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const parsed = channelAiSettingsSchema.safeParse(settings.ai);
  return parsed.success ? parsed.data : lockedChannelAiSettings();
}

/**
 * Narrows a product resolution to what the channel may use. `undefined` means
 * the channel is not product-scoped (legacy workspace mode).
 */
export function allowedChannelProductIds(
  settings: ChannelAiSettings,
): readonly string[] | undefined {
  return settings.knowledge.mode === "products"
    ? settings.knowledge.productIds
    : undefined;
}

export function scopeProductIds(
  resolved: readonly string[] | undefined,
  allowed: readonly string[] | undefined,
): readonly string[] {
  if (!allowed) return resolved ?? [];
  const allowedSet = new Set(allowed);
  const narrowed = (resolved ?? []).filter((id) => allowedSet.has(id));
  // An ambiguous message on a scoped channel still belongs to that channel's
  // products; never widen beyond them.
  return narrowed.length ? narrowed : [...allowed];
}
