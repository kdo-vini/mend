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
  constructor(private readonly client: AnySupabaseClient) {}

  async resolve(): Promise<string | null> {
    const result = await this.client
      .from("internal_workspace")
      .select("workspace_id")
      .eq("singleton", true)
      .maybeSingle();
    if (result.error)
      throw new InternalWorkspaceError("internal_workspace_unconfigured");
    return result.data?.workspace_id ?? null;
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
