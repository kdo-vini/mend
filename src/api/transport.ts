import {
  isSupabaseConfigured,
  supabase,
  type MendSupabaseClient,
} from "../lib/supabase";

const env =
  (import.meta as ImportMeta & { env?: Record<string, string | undefined> })
    .env ?? {};

export const mendApiBaseUrl = (
  env.VITE_MEND_API_URL?.trim() ||
  env.VITE_API_BASE_URL?.trim() ||
  (typeof window !== "undefined" ? window.location.origin : "")
).replace(/\/$/, "");
export const isLiveConfigured = isSupabaseConfigured || Boolean(mendApiBaseUrl);

export function isDemoModeRequested() {
  if (env.VITE_MEND_DEMO === "true" || env.VITE_MEND_DEMO_MODE === "1")
    return true;
  if (typeof window === "undefined" || !(env as { DEV?: unknown }).DEV)
    return false;
  return (
    new URLSearchParams(window.location.search).get("demo") === "1" ||
    window.sessionStorage.getItem("mend.demo") === "1"
  );
}

export class LiveActionError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "LiveActionError";
  }
}

export async function unwrap<T>(
  request: PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await request;
  if (error) throw new LiveActionError(error.message);
  if (data === null)
    throw new LiveActionError("The live workspace returned no data.");
  return data;
}

/** Hard ceiling for list loaders that read every page of a collection. */
export const MAX_LIST_ROWS = 1000;

/**
 * Reads consecutive ranges until a short page or the row cap. The query must
 * have a stable total order so pages never overlap or skip rows.
 */
export async function unwrapPages<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  { pageSize = 500, cap = MAX_LIST_ROWS } = {},
): Promise<T[]> {
  const collected: T[] = [];
  while (collected.length < cap) {
    const size = Math.min(pageSize, cap - collected.length);
    const rows = await unwrap(
      page(collected.length, collected.length + size - 1),
    );
    collected.push(...rows);
    if (rows.length < size) break;
  }
  return collected;
}

export function requireClient(
  client: MendSupabaseClient | null,
): MendSupabaseClient {
  if (!client)
    throw new LiveActionError(
      "Supabase is not configured for live workspace data.",
    );
  return client;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  workspaceId?: string,
): Promise<T> {
  if (!mendApiBaseUrl)
    throw new LiveActionError(
      "Mend API is not configured. Set VITE_MEND_API_URL.",
    );
  const headers = new Headers(init.headers);
  const isFormData =
    typeof FormData !== "undefined" && init.body instanceof FormData;
  if (!isFormData && !headers.has("content-type"))
    headers.set("content-type", "application/json");
  if (supabase) {
    const session = await supabase.auth.getSession();
    if (session.data.session?.access_token)
      headers.set(
        "authorization",
        `Bearer ${session.data.session.access_token}`,
      );
  }
  if (workspaceId) headers.set("x-mend-workspace-id", workspaceId);
  const response = await fetch(`${mendApiBaseUrl}${path}`, {
    ...init,
    headers,
  });
  const body =
    response.status === 204
      ? undefined
      : await response.json().catch(() => undefined);
  const apiError =
    body && typeof body === "object" && "error" in body
      ? (body as { error?: unknown }).error
      : undefined;
  const code =
    apiError &&
    typeof apiError === "object" &&
    "code" in apiError &&
    typeof apiError.code === "string"
      ? apiError.code
      : undefined;
  const message =
    typeof apiError === "string"
      ? apiError
      : apiError &&
          typeof apiError === "object" &&
          "message" in apiError &&
          typeof apiError.message === "string"
        ? apiError.message
        : `Mend API request failed (${response.status}).`;
  if (!response.ok) {
    const details =
      apiError && typeof apiError === "object" && "details" in apiError
        ? apiError.details
        : undefined;
    if (details) console.warn("Mend API error details", path, details);
    throw new LiveActionError(message, response.status, code);
  }
  return body as T;
}
