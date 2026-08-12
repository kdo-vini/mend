export interface WebhookChannelBinding {
  id: string;
  workspace_id: string;
  provider_instance_name: string;
}

export function selectExactChannelBinding(
  bindings: readonly WebhookChannelBinding[],
  reportedInstanceName: string | undefined,
): WebhookChannelBinding | null {
  const normalized = reportedInstanceName?.trim();
  if (!normalized) return null;
  const exact = bindings.filter(
    (binding) => binding.provider_instance_name === normalized,
  );
  if (exact.length > 1) throw new Error("channel_instance_ambiguous");
  return exact[0] ?? null;
}
