import type {
  LiveChannelBinding,
  LiveWorkerChannelResolver,
  LiveWorkerSupabaseClient,
} from "../live-worker.js";
import { cleanInstanceName } from "./live-worker-shared.js";
export class SupabaseLiveWorkerChannelResolver
  implements LiveWorkerChannelResolver
{
  constructor(private readonly client: LiveWorkerSupabaseClient) {}

  async resolve(instanceName: string): Promise<LiveChannelBinding | null> {
    const normalized = cleanInstanceName(instanceName);
    if (!normalized) return null;
    const result = await this.client
      .from("channel_connections")
      .select("id, workspace_id, provider_instance_name")
      .eq("provider", "whatsmiau")
      .eq("provider_instance_name", normalized);
    if (result.error)
      throw new Error(`supabase:channel_connections:${result.error.message}`);
    const rows = result.data ?? [];
    if (rows.length === 0) return null;
    if (rows.length > 1) throw new Error("channel_instance_ambiguous");
    return {
      channelConnectionId: String(rows[0].id),
      instanceName: String(rows[0].provider_instance_name),
      workspaceId: String(rows[0].workspace_id),
    };
  }
}
