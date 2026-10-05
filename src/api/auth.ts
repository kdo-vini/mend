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

export function signUpWithPassword(
  email: string,
  password: string,
  redirectTo?: string,
  client?: MendSupabaseClient,
) {
  return clientOrDefault(client).auth.signUp({
    email: email.trim(),
    password,
    ...(redirectTo ? { options: { emailRedirectTo: redirectTo } } : {}),
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
    options: {
      shouldCreateUser: false,
      ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
    },
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
  const singleton = await supabase
    .from("internal_workspace")
    .select("workspace_id")
    .eq("singleton", true)
    .maybeSingle();
  if (singleton.error || !singleton.data)
    throw new Error("internal_workspace_unconfigured");
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("unauthenticated");
  const [workspaceResult, membershipResult] = await Promise.all([
    supabase
      .from("workspaces")
      .select("*")
      .eq("id", singleton.data.workspace_id)
      .maybeSingle(),
    supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", singleton.data.workspace_id)
      .eq("user_id", userData.user.id)
      .maybeSingle(),
  ]);
  if (workspaceResult.error) throw new Error(workspaceResult.error.message);
  if (membershipResult.error) throw new Error(membershipResult.error.message);
  if (!workspaceResult.data || !membershipResult.data) return [];
  return [
    { ...workspaceResult.data, role: roleOf(membershipResult.data.role) },
  ];
}

/** Resolve only the configured internal workspace and the authenticated membership. */
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
  void input;
  void client;
  return Promise.reject(new Error("workspace_creation_disabled"));
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
