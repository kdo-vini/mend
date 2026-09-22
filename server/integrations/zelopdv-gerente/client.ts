export type ZeloPdvGerenteChannelKind = "message" | "confirm" | "cancel";

export type ZeloPdvGerentePendingAction = {
  id: string;
  summary?: string;
  expires_at?: string;
};

export type ZeloPdvGerenteChannelResult = {
  reply: string;
  pending_action: ZeloPdvGerentePendingAction | null;
  paired: boolean;
};

export type ZeloPdvGerenteClientConfig = {
  baseUrl: string;
  channelKey: string;
  workspaceIds: ReadonlySet<string>;
  fetchImpl?: typeof fetch;
};

export class ZeloPdvGerenteClient {
  constructor(private readonly config: ZeloPdvGerenteClientConfig) {}

  isEnabledForWorkspace(workspaceId: string): boolean {
    if (!this.config.workspaceIds.size) return true;
    return this.config.workspaceIds.has(workspaceId);
  }

  async sendMessage(input: {
    phone: string;
    text: string;
    kind?: ZeloPdvGerenteChannelKind;
    actionId?: string | null;
  }): Promise<ZeloPdvGerenteChannelResult> {
    const response = await (this.config.fetchImpl ?? fetch)(
      `${this.config.baseUrl.replace(/\/$/, "")}/api/gerente/channel`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "x-gerente-channel-key": this.config.channelKey,
        },
        body: JSON.stringify({
          phone: input.phone,
          text: input.text,
          kind: input.kind ?? "message",
          ...(input.actionId ? { action_id: input.actionId } : {}),
        }),
      },
    );
    const payload = (await response.json().catch(() => null)) as
      | ZeloPdvGerenteChannelResult
      | { error?: string }
      | null;
    if (!response.ok) {
      const detail =
        payload && typeof payload === "object" && "error" in payload
          ? String(payload.error ?? response.status)
          : String(response.status);
      throw new Error(`zelopdv_gerente_channel:${detail}`);
    }
    const row = payload as ZeloPdvGerenteChannelResult;
    return {
      reply: String(row.reply ?? "").trim(),
      pending_action: row.pending_action ?? null,
      paired: Boolean(row.paired),
    };
  }
}

export function createZeloPdvGerenteClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ZeloPdvGerenteClient | null {
  const enabled = (env.ZELOPDV_GERENTE_BRIDGE_ENABLED ?? "").trim() === "1";
  const baseUrl = (env.ZELOPDV_GERENTE_BASE_URL ?? "").trim();
  const channelKey = (env.ZELOPDV_GERENTE_CHANNEL_KEY ?? "").trim();
  if (!enabled || !baseUrl || !channelKey) return null;
  const workspaceIds = new Set(
    (env.ZELOPDV_GERENTE_WORKSPACE_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  return new ZeloPdvGerenteClient({ baseUrl, channelKey, workspaceIds });
}
