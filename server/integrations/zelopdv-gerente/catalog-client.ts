export type ZeloPdvCatalogAction =
  | "resolve"
  | "pair"
  | "search"
  | "prepare_delete"
  | "execute_delete";

export type ZeloPdvCatalogProduct = {
  id: number;
  nome: string;
  preco?: number;
};

export type ZeloPdvCatalogPreview = {
  produto_ids: number[];
  categoria_ids: number[];
  excluir: Array<{ id: number; nome: string }>;
  arquivar: Array<{ id: number; nome: string }>;
  total_produtos?: number;
};

export type ZeloPdvCatalogResult = {
  ok: boolean;
  code?: string;
  paired?: boolean;
  error?: string;
  owner_user_id?: string;
  produtos?: ZeloPdvCatalogProduct[];
  preview?: ZeloPdvCatalogPreview;
  result?: Record<string, unknown>;
};

export type ZeloPdvCatalogClientConfig = {
  baseUrl: string;
  channelKey: string;
  workspaceIds: ReadonlySet<string>;
  fetchImpl?: typeof fetch;
};

export class ZeloPdvCatalogClient {
  constructor(private readonly config: ZeloPdvCatalogClientConfig) {}

  isEnabledForWorkspace(workspaceId: string): boolean {
    if (!this.config.workspaceIds.size) return true;
    return this.config.workspaceIds.has(workspaceId);
  }

  async call(
    action: ZeloPdvCatalogAction,
    body: Record<string, unknown>,
  ): Promise<ZeloPdvCatalogResult> {
    const response = await (this.config.fetchImpl ?? fetch)(
      `${this.config.baseUrl.replace(/\/$/, "")}/api/gerente/mend/catalog`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "x-gerente-channel-key": this.config.channelKey,
        },
        body: JSON.stringify({ action, ...body }),
      },
    );
    const payload = (await response.json().catch(() => null)) as
      | ZeloPdvCatalogResult
      | { error?: string }
      | null;
    if (!response.ok) {
      return {
        ok: false,
        code: "HTTP_ERROR",
        error:
          payload && typeof payload === "object" && "error" in payload
            ? String(payload.error)
            : String(response.status),
      };
    }
    return (payload ?? { ok: false, code: "EMPTY" }) as ZeloPdvCatalogResult;
  }
}

export function createZeloPdvCatalogClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ZeloPdvCatalogClient | null {
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
  return new ZeloPdvCatalogClient({ baseUrl, channelKey, workspaceIds });
}
