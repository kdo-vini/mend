import type { RequestContext } from "./contracts/api-ports.js";
import type { AnySupabaseClient } from "./adapters/supabase/types.js";

/** A database singleton preserves the UUID already used by channel bindings. */
export interface InternalWorkspacePort {
  resolve(): Promise<string | null>;
}

export class InternalWorkspaceError extends Error {
  constructor(
    readonly code: "internal_workspace_unconfigured" | "workspace_not_found",
  ) {
    super(code);
    this.name = "InternalWorkspaceError";
  }
}

export class SupabaseInternalWorkspaceAdapter implements InternalWorkspacePort {
  /** The singleton workspace id never changes at runtime; cache it in-process. */
  private cached: { id: string; expiresAt: number } | null = null;

  constructor(
    private readonly client: AnySupabaseClient,
    private readonly cacheMs = 5 * 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  async resolve(): Promise<string | null> {
    if (this.cached && this.cached.expiresAt > this.now())
      return this.cached.id;
    this.cached = null;
    const result = await this.client
      .from("internal_workspace")
      .select("workspace_id")
      .eq("singleton", true)
      .maybeSingle();
    if (result.error)
      throw new InternalWorkspaceError("internal_workspace_unconfigured");
    const id: string | null = result.data?.workspace_id ?? null;
    if (id) this.cached = { id, expiresAt: this.now() + this.cacheMs };
    return id;
  }
}

/** No fallback to first membership, header, channel, or workspace in storage. */
export async function resolveInternalWorkspace(
  port: InternalWorkspacePort,
  requested?: string,
): Promise<string> {
  const workspaceId = await port.resolve();
  if (!workspaceId)
    throw new InternalWorkspaceError("internal_workspace_unconfigured");
  if (requested !== undefined && requested !== workspaceId)
    throw new InternalWorkspaceError("workspace_not_found");
  return workspaceId;
}

export function internalWorkspaceSession(context: RequestContext) {
  return {
    workspaceId: context.workspaceId,
    role: context.role,
    canManageAccess: context.role === "owner" || context.role === "admin",
  };
}
