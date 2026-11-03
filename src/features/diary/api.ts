import {
  apiRequest,
  isDemoModeRequested,
  LiveActionError,
} from "../../api/transport";

export interface DiaryEntry {
  id: string;
  author_id: string;
  author_name: string;
  title: string;
  body: string;
  project: string | null;
  source: "claude" | "manual";
  created_at: string;
  expires_at: string;
  deletable: boolean;
}

export interface DiaryToken {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

const day = 86_400_000;

/** In-memory feed for `?demo=1`, which has no API behind it. */
let demoEntries: DiaryEntry[] = [
  {
    id: "demo-diary-1",
    author_id: "demo-user",
    author_name: "Lucas",
    title: "Correção de arredondamento no PDV",
    body: "Corrigi o total do PDV que arredondava centavos para baixo em pagamentos divididos.\n\nO que mudou:\n- cálculo do troco usa centavos inteiros;\n- teste cobrindo pagamento dividido em três cartões.",
    project: "Zelo",
    source: "claude",
    created_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    expires_at: new Date(Date.now() + 7 * day - 2 * 3_600_000).toISOString(),
    deletable: true,
  },
  {
    id: "demo-diary-2",
    author_id: "demo-other",
    author_name: "Vinícius",
    title: "Bot de pesquisa das maquininhas publicado",
    body: "Publiquei o bot com o comparativo de taxas das maquininhas.",
    project: null,
    source: "claude",
    created_at: new Date(Date.now() - 1.2 * day).toISOString(),
    expires_at: new Date(Date.now() + 5.8 * day).toISOString(),
    deletable: false,
  },
];

const noApiAnswer = (error: unknown) =>
  !(error instanceof LiveActionError && error.status);

export const diaryApi = {
  list: async (): Promise<DiaryEntry[]> => {
    try {
      const result = await apiRequest<{ data: DiaryEntry[] } | undefined>(
        "/api/work-log",
      );
      if (!result || !Array.isArray(result.data))
        throw new LiveActionError("Invalid work log response.");
      return result.data;
    } catch (error) {
      if (isDemoModeRequested() && noApiAnswer(error))
        return demoEntries.map((entry) => ({ ...entry }));
      throw error;
    }
  },
  remove: async (id: string): Promise<void> => {
    try {
      await apiRequest(`/api/work-log/entries/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    } catch (error) {
      if (isDemoModeRequested() && noApiAnswer(error)) {
        demoEntries = demoEntries.filter((entry) => entry.id !== id);
        return;
      }
      throw error;
    }
  },
  listTokens: async (): Promise<DiaryToken[]> => {
    try {
      const result = await apiRequest<{ data: DiaryToken[] } | undefined>(
        "/api/work-log/tokens",
      );
      if (!result || !Array.isArray(result.data))
        throw new LiveActionError("Invalid work log token response.");
      return result.data;
    } catch (error) {
      if (isDemoModeRequested() && noApiAnswer(error)) return [];
      throw error;
    }
  },
  createToken: async (
    label: string,
  ): Promise<{ secret: string; record: DiaryToken }> => {
    const result = await apiRequest<
      { secret: string; record: DiaryToken } | undefined
    >("/api/work-log/tokens", {
      method: "POST",
      body: JSON.stringify({ label }),
    });
    if (!result?.secret)
      throw new LiveActionError("Invalid work log token response.");
    return result;
  },
  revokeToken: async (id: string): Promise<void> => {
    await apiRequest(`/api/work-log/tokens/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
};
