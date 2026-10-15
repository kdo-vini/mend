import { z } from "zod";
import type { Database } from "../src/lib/database.types.js";
import type { MendAuthContext } from "./auth.js";

type Tables = Database["public"]["Tables"];
export type Workspace = Tables["workspaces"]["Row"];
export type WorkspaceMember = Tables["workspace_members"]["Row"];

export const workspaceRoles = ["owner", "admin", "agent", "viewer"] as const;
export type WorkspaceRole = (typeof workspaceRoles)[number];

export const workspaceCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(64),
  issuePrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9]{1,7}$/)
    .optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
});

export const workspaceMemberRoleSchema = z.enum(workspaceRoles);

export interface WorkspaceWithRole extends Workspace {
  role: WorkspaceRole;
}

export class WorkspaceAuthorizationError extends Error {
  readonly statusCode: 403 | 404;
  readonly code: "workspace_not_found" | "workspace_role_denied";

  constructor(
    code: "workspace_not_found" | "workspace_role_denied",
    message: string,
    statusCode: 403 | 404,
  ) {
    super(message);
    this.name = "WorkspaceAuthorizationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

type RpcResult<T> = PromiseLike<{
  data: T | null;
  error: { message: string } | null;
}>;
type RpcCaller = (
  name: string,
  args: Record<string, unknown>,
) => RpcResult<unknown>;

function callRpc<T>(
  auth: MendAuthContext,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const rpc = auth.client.rpc as unknown as RpcCaller;
  return Promise.resolve(rpc.call(auth.client, name, args)).then(
    ({ data, error }) => {
      if (error) throw new Error(error.message);
      if (data === null || data === undefined)
        throw new Error(`Supabase RPC returned no data: ${name}`);
      return (Array.isArray(data) ? data[0] : data) as T;
    },
  );
}

function roleOf(value: string): WorkspaceRole {
  if ((workspaceRoles as readonly string[]).includes(value))
    return value as WorkspaceRole;
  throw new Error(`Invalid workspace role returned by Supabase: ${value}`);
}

function requireWorkspaceId(value: string): string {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success)
    throw new WorkspaceAuthorizationError(
      "workspace_not_found",
      "Workspace was not found.",
      404,
    );
  return parsed.data;
}

async function loadMembershipRole(
  auth: MendAuthContext,
  workspaceId: string,
): Promise<WorkspaceRole | null> {
  const { data, error } = await auth.client
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? roleOf(data.role) : null;
}

export async function requireWorkspaceRole(
  auth: MendAuthContext,
  workspaceId: string,
  allowedRoles: readonly WorkspaceRole[] = workspaceRoles,
): Promise<WorkspaceRole> {
  const normalizedId = requireWorkspaceId(workspaceId);
  const role = await loadMembershipRole(auth, normalizedId);
  if (!role)
    throw new WorkspaceAuthorizationError(
      "workspace_not_found",
      "Workspace was not found.",
      404,
    );
  if (!allowedRoles.includes(role)) {
    throw new WorkspaceAuthorizationError(
      "workspace_role_denied",
      "Your workspace role cannot perform this action.",
      403,
    );
  }
  return role;
}

/** Lists only workspaces visible to the authenticated user through RLS. */
export async function listMyWorkspaces(
  auth: MendAuthContext,
): Promise<WorkspaceWithRole[]> {
  const [workspacesResult, membershipsResult] = await Promise.all([
    auth.client
      .from("workspaces")
      .select("*")
      .order("name", { ascending: true }),
    auth.client
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("user_id", auth.user.id),
  ]);
  if (workspacesResult.error) throw new Error(workspacesResult.error.message);
  if (membershipsResult.error) throw new Error(membershipsResult.error.message);

  const roles = new Map(
    membershipsResult.data.map((member) => [
      member.workspace_id,
      roleOf(member.role),
    ]),
  );
  return workspacesResult.data.flatMap((workspace) => {
    const role = roles.get(workspace.id);
    return role ? [{ ...workspace, role }] : [];
  });
}

export async function createWorkspace(
  auth: MendAuthContext,
  input: z.input<typeof workspaceCreateSchema>,
): Promise<WorkspaceWithRole> {
  const values = workspaceCreateSchema.parse(input);
  const workspace = await callRpc<Workspace>(auth, "create_workspace", {
    p_name: values.name,
    p_slug: values.slug,
    p_issue_prefix: values.issuePrefix ?? "MEND",
    p_timezone: values.timezone ?? "America/Sao_Paulo",
    p_default_language: "pt-BR",
  });
  return { ...workspace, role: "owner" };
}

export async function addWorkspaceMember(
  auth: MendAuthContext,
  workspaceId: string,
  userId: string,
  role: WorkspaceRole = "agent",
): Promise<WorkspaceMember> {
  await requireWorkspaceRole(auth, workspaceId, ["owner", "admin"]);
  const normalizedId = requireWorkspaceId(workspaceId);
  workspaceMemberRoleSchema.parse(role);
  return callRpc<WorkspaceMember>(auth, "add_workspace_member", {
    p_workspace_id: normalizedId,
    p_user_id: z.string().uuid().parse(userId),
    p_role: role,
  });
}
