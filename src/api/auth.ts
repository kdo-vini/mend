import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types";
import { requireSupabase, type MendSupabaseClient } from "../lib/supabase";
import { normalizeLocale } from "../i18n/resources";

type Tables = Database["public"]["Tables"];
export type Workspace = Tables["workspaces"]["Row"];
export type WorkspaceMember = Tables["workspace_members"]["Row"];
export const workspaceRoles = ["owner", "admin", "agent", "viewer"] as const;
export type WorkspaceRole = (typeof workspaceRoles)[number];

export interface WorkspaceWithRole extends Workspace {
  role: WorkspaceRole;
}

export interface WorkspaceCreateInput {
  name: string;
  slug: string;
  issuePrefix?: string;
  timezone?: string;
  defaultLanguage?: string;
}

export interface WorkspaceUpdateInput {
  name?: string;
  slug?: string;
  issuePrefix?: string;
  timezone?: string;
  defaultLanguage?: string;
}

function clientOrDefault(client?: MendSupabaseClient): MendSupabaseClient {
  return client ?? requireSupabase();
}

function roleOf(value: string): WorkspaceRole {
  if ((workspaceRoles as readonly string[]).includes(value))
    return value as WorkspaceRole;
  throw new Error(`Invalid workspace role returned by Supabase: ${value}`);
}

export function getSession(
  client?: MendSupabaseClient,
): Promise<{ session: Session | null; error: Error | null }> {
  return clientOrDefault(client)
    .auth.getSession()
    .then(({ data, error }) => ({ session: data.session, error }));
}

export async function getCurrentUser(
  client?: MendSupabaseClient,
): Promise<User | null> {
  const { data, error } = await clientOrDefault(client).auth.getUser();
  if (error) throw new Error(error.message);
  return data.user;
}

export function signInWithPassword(
  email: string,
  password: string,
  client?: MendSupabaseClient,
) {
  return clientOrDefault(client).auth.signInWithPassword({
    email: email.trim(),
    password,
  });
}

export function signInWithGoogle(
  redirectTo?: string,
  client?: MendSupabaseClient,
) {
  return clientOrDefault(client).auth.signInWithOAuth({
    provider: "google",
    ...(redirectTo ? { options: { redirectTo } } : {}),
  });
}

export function sendMagicLink(
  email: string,
  redirectTo?: string,
  client?: MendSupabaseClient,
) {
  return clientOrDefault(client).auth.signInWithOtp({
    email: email.trim(),
    ...(redirectTo ? { options: { emailRedirectTo: redirectTo } } : {}),
  });
}

export function updatePassword(password: string, client?: MendSupabaseClient) {
  return clientOrDefault(client).auth.updateUser({ password });
}

export function acceptWorkspaceInvitation(
  invitationId: string,
  client?: MendSupabaseClient,
): Promise<WorkspaceMember> {
  return callRpc<WorkspaceMember>(
    clientOrDefault(client),
    "accept_workspace_invitation",
    { p_invitation_id: invitationId },
  );
}

export function signOut(
  client?: MendSupabaseClient,
): Promise<{ error: Error | null }> {
  return clientOrDefault(client)
    .auth.signOut()
    .then(({ error }) => ({ error }));
}

export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
  client?: MendSupabaseClient,
): () => void {
  const { data } = clientOrDefault(client).auth.onAuthStateChange(callback);
  return () => data.subscription.unsubscribe();
}

type RpcResult = PromiseLike<{
  data: unknown;
  error: { message: string } | null;
}>;

function callRpc<T>(
  client: MendSupabaseClient,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const rpc = client.rpc as unknown as (
    rpcName: string,
    rpcArgs: Record<string, unknown>,
  ) => RpcResult;
  return Promise.resolve(rpc.call(client, name, args)).then(
    ({ data, error }) => {
      if (error) throw new Error(error.message);
      if (data === null || data === undefined)
        throw new Error(`Supabase RPC returned no data: ${name}`);
      return (Array.isArray(data) ? data[0] : data) as T;
    },
  );
}

export async function listMyWorkspaces(
  client?: MendSupabaseClient,
): Promise<WorkspaceWithRole[]> {
  const supabase = clientOrDefault(client);
  const [workspacesResult, membershipsResult] = await Promise.all([
    supabase.from("workspaces").select("*").order("name", { ascending: true }),
    supabase.from("workspace_members").select("workspace_id, role"),
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

/** /me/workspace client helper. The default is the first workspace visible to RLS. */
export async function getMyWorkspace(
  workspaceId?: string,
  client?: MendSupabaseClient,
): Promise<WorkspaceWithRole> {
  const workspaces = await listMyWorkspaces(client);
  const workspace = workspaceId
    ? workspaces.find((candidate) => candidate.id === workspaceId)
    : workspaces[0];
  if (!workspace)
    throw new Error("Workspace was not found for the current user.");
  return workspace;
}

export function createWorkspace(
  input: WorkspaceCreateInput,
  client?: MendSupabaseClient,
): Promise<WorkspaceWithRole> {
  const supabase = clientOrDefault(client);
  const values = {
    name: input.name.trim(),
    slug: input.slug.trim().toLowerCase(),
    issuePrefix: input.issuePrefix?.trim().toUpperCase() ?? "MEND",
    timezone: input.timezone?.trim() || "America/Sao_Paulo",
    defaultLanguage: input.defaultLanguage?.trim() || "en-US",
  };
  return callRpc<Workspace>(supabase, "create_workspace", {
    p_name: values.name,
    p_slug: values.slug,
    p_issue_prefix: values.issuePrefix,
    p_timezone: values.timezone,
    p_default_language: normalizeLocale(values.defaultLanguage),
  }).then((workspace) => ({ ...workspace, role: "owner" }));
}

export function updateWorkspace(
  workspaceId: string,
  input: WorkspaceUpdateInput,
  client?: MendSupabaseClient,
): Promise<Workspace> {
  const updates: Tables["workspaces"]["Update"] = {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.slug !== undefined
      ? { slug: input.slug.trim().toLowerCase() }
      : {}),
    ...(input.issuePrefix !== undefined
      ? { issue_prefix: input.issuePrefix.trim().toUpperCase() }
      : {}),
    ...(input.timezone !== undefined
      ? { timezone: input.timezone.trim() }
      : {}),
    ...(input.defaultLanguage !== undefined
      ? { default_language: normalizeLocale(input.defaultLanguage) }
      : {}),
  };
  return Promise.resolve(
    clientOrDefault(client)
      .from("workspaces")
      .update(updates)
      .eq("id", workspaceId)
      .select("*")
      .single()
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data;
      }),
  );
}

export function listWorkspaceMembers(
  workspaceId: string,
  client?: MendSupabaseClient,
): Promise<WorkspaceMember[]> {
  return Promise.resolve(
    clientOrDefault(client)
      .from("workspace_members")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data;
      }),
  );
}

export function updateMyWorkspaceMemberDisplayName(
  workspaceId: string,
  displayName: string,
  client?: MendSupabaseClient,
): Promise<WorkspaceMember> {
  const normalizedName = displayName.trim();
  if (!normalizedName)
    return Promise.reject(new Error("Display name is required."));
  const db = clientOrDefault(client);
  return db.auth.getUser().then(({ data, error }) => {
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error("A signed-in user is required.");
    return db
      .from("workspace_members")
      .update({ display_name: normalizedName })
      .eq("workspace_id", workspaceId)
      .eq("user_id", data.user.id)
      .select("*")
      .single()
      .then((result) => {
        if (result.error) throw new Error(result.error.message);
        return result.data;
      });
  });
}

export function addWorkspaceMember(
  workspaceId: string,
  userId: string,
  role: WorkspaceRole = "agent",
  client?: MendSupabaseClient,
): Promise<WorkspaceMember> {
  return callRpc<WorkspaceMember>(
    clientOrDefault(client),
    "add_workspace_member",
    {
      p_workspace_id: workspaceId,
      p_user_id: userId,
      p_role: role,
    },
  );
}

export function updateWorkspaceMemberRole(
  workspaceId: string,
  userId: string,
  role: WorkspaceRole,
  client?: MendSupabaseClient,
): Promise<WorkspaceMember> {
  return callRpc<WorkspaceMember>(
    clientOrDefault(client),
    "update_workspace_member_role",
    {
      p_workspace_id: workspaceId,
      p_user_id: userId,
      p_role: role,
    },
  );
}

export function removeWorkspaceMember(
  workspaceId: string,
  userId: string,
  client?: MendSupabaseClient,
): Promise<boolean> {
  return callRpc<boolean>(clientOrDefault(client), "remove_workspace_member", {
    p_workspace_id: workspaceId,
    p_user_id: userId,
  });
}
