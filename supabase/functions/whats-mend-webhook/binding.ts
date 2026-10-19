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

/**
 * Picks the instance name used to look up the channel binding. Mend registers
 * each instance's webhook URL with `?instance=<name>`, so that value is the
 * channel's own name and wins over the payload's `instance` field, which
 * Whatsmiau may fill with an internal identifier after a reconnect. Both reach
 * the function only behind the same webhook secret.
 */
export function resolveWebhookInstanceName(input: {
  urlInstanceName?: string | null;
  reportedInstanceName?: string;
}): { instanceName?: string; mismatch: boolean } {
  const fromUrl = input.urlInstanceName?.trim() || undefined;
  const reported = input.reportedInstanceName?.trim() || undefined;
  return {
    instanceName: fromUrl ?? reported,
    mismatch: Boolean(fromUrl && reported && fromUrl !== reported),
  };
}
