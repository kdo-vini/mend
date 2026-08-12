import {
  type AuditLogListQuery,
  type MembershipAdapter,
  type RequestContext,
  type WorkspaceCreateInput,
  type WorkspaceInvitationCreateInput,
  type WorkspaceInvitationRolePatchInput,
  type WorkspaceMemberCreateInput,
  type WorkspaceMemberListQuery,
  type WorkspaceMemberRolePatchInput,
  type WorkspacePatchInput,
  type WorkspacePort,
  type WorkspaceRole,
} from "../../contracts/api-ports.js";
import { normalizeLocale } from "../../locale.js";
import type { AnySupabaseClient } from "./types.js";
import {
  auditLog,
  checked,
  row,
  rows,
  rpcRow,
  str,
  workspace,
  workspaceInvitation,
  workspaceMember,
  workspaceMemberWithEmail,
  type Row,
} from "../supabase-mappers.js";
export class SupabaseMembershipAdapter implements MembershipAdapter {
  constructor(private readonly client: AnySupabaseClient) {}

  async getMembership(userId: string, workspaceId: string) {
    const result = await this.client
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    const data = checked("workspace_members.get", result);
    if (!data) return null;
    const value = row(data);
    const role = str(value.role) as WorkspaceRole;
    return ["owner", "admin", "agent", "viewer"].includes(role)
      ? { workspaceId: str(value.workspace_id), role }
      : null;
  }
}

export class SupabaseWorkspaceAdapter implements WorkspacePort {
  constructor(
    private readonly client: AnySupabaseClient,
    private readonly privilegedClient: AnySupabaseClient | null,
  ) {}

  private requirePrivilegedClient(): AnySupabaseClient {
    if (!this.privilegedClient)
      throw new Error("supabase_invitation_admin_unavailable");
    return this.privilegedClient;
  }

  private invitationRedirect(invitationId: string): string {
    const configuredBase =
      process.env.APP_BASE_URL?.trim() || process.env.PUBLIC_APP_URL?.trim();
    if (!configuredBase && process.env.NODE_ENV === "production")
      throw new Error("invitation_base_url_missing");
    const base = (configuredBase || "http://localhost:5173").replace(/\/$/, "");
    return `${base}/accept-invite?invitation=${encodeURIComponent(invitationId)}`;
  }

  private async workspaceName(workspaceId: string): Promise<string> {
    const result = await this.requirePrivilegedClient()
      .from("workspaces")
      .select("name")
      .eq("id", workspaceId)
      .maybeSingle();
    const data = checked("workspace_invitations.workspace_name", result);
    return str(row(data).name, "TechneOS");
  }

  private async recordInvitationDelivery(
    invitationId: string,
    status: "sent" | "failed",
    kind: "invite" | "recovery" | null,
    errorCode?: string,
  ): Promise<Row> {
    const result = await this.requirePrivilegedClient().rpc(
      "record_workspace_invitation_delivery",
      {
        p_invitation_id: invitationId,
        p_status: status,
        p_kind: kind,
        p_error_code: errorCode ?? null,
      },
    );
    return rpcRow(checked("workspace_invitations.delivery", result));
  }

  private async sendInvitationEmail(
    invitation: Row,
    workspaceName: string,
  ): Promise<Row> {
    const admin = this.requirePrivilegedClient();
    const email = str(invitation.email);
    const invitationId = str(invitation.id);
    const redirectTo = this.invitationRedirect(invitationId);
    let kind: "invite" | "recovery" = "invite";
    try {
      const invite = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { workspace_name: workspaceName },
      });
      if (!invite.error) {
        return this.recordInvitationDelivery(invitationId, "sent", kind);
      }
      const code = String(
        (invite.error as { code?: string }).code ?? "",
      ).toLowerCase();
      if (code !== "email_exists" && code !== "user_already_exists")
        throw invite.error;

      kind = "recovery";
      const recovery = await admin.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (recovery.error) throw recovery.error;
      return this.recordInvitationDelivery(invitationId, "sent", kind);
    } catch (error) {
      const code = String(
        (error as { code?: string }).code ?? "auth_invitation_failed",
      )
        .toLowerCase()
        .slice(0, 120);
      try {
        await this.recordInvitationDelivery(invitationId, "failed", kind, code);
      } catch {
        // Preserve the delivery error for the caller even if the status update
        // is unavailable. The invitation remains visible for a retry.
      }
      throw new Error("invitation_delivery_failed");
    }
  }

  async list(userId: string) {
    const result = await this.client
      .from("workspace_members")
      .select("workspace_id, role, workspaces(*)")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    const data = rows(checked("workspaces.list", result));
    return data.map((item) => ({
      ...workspace(row(item.workspaces)),
      role: str(item.role),
    }));
  }

  async create(userId: string, input: WorkspaceCreateInput) {
    const result = await this.client.rpc("create_workspace", {
      p_name: input.name,
      p_slug: input.slug,
      p_issue_prefix: input.issuePrefix ?? "MEND",
      p_timezone: input.timezone ?? "America/Sao_Paulo",
      p_default_language: normalizeLocale(input.defaultLanguage),
    });
    return {
      ...workspace(rpcRow(checked("create_workspace", result))),
      createdByUserId: userId,
      role: "owner" as const,
    };
  }

  async get(context: RequestContext, workspaceId: string) {
    if (context.workspaceId !== workspaceId) return null;
    const result = await this.client
      .from("workspaces")
      .select("*")
      .eq("id", workspaceId)
      .maybeSingle();
    const data = checked("workspaces.get", result);
    return data ? workspace(row(data)) : null;
  }

  async update(
    context: RequestContext,
    workspaceId: string,
    input: WorkspacePatchInput,
  ) {
    if (context.workspaceId !== workspaceId) return null;
    const value = input as unknown as Row;
    const result = await this.client
      .from("workspaces")
      .update({
        ...(value.name !== undefined ? { name: value.name } : {}),
        ...(value.slug !== undefined ? { slug: value.slug } : {}),
        ...(value.issuePrefix !== undefined
          ? { issue_prefix: value.issuePrefix }
          : {}),
        ...(value.timezone !== undefined ? { timezone: value.timezone } : {}),
        ...(value.defaultLanguage !== undefined
          ? { default_language: normalizeLocale(value.defaultLanguage) }
          : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", workspaceId)
      .select("*")
      .maybeSingle();
    const data = checked("workspaces.update", result);
    return data ? workspace(row(data)) : null;
  }

  async listMembers(context: RequestContext, query: WorkspaceMemberListQuery) {
    const result = await this.client.rpc("list_workspace_members_with_email", {
      p_workspace_id: context.workspaceId,
    });
    const members = rows(checked("workspace_members.list", result));
    return members
      .filter((member) => !query.role || str(member.role) === query.role)
      .filter(
        (member) => !query.cursor || str(member.created_at) < query.cursor,
      )
      .slice(0, query.limit)
      .map(workspaceMemberWithEmail);
  }

  async addMember(context: RequestContext, input: WorkspaceMemberCreateInput) {
    const result = await this.client.rpc("add_workspace_member", {
      p_workspace_id: context.workspaceId,
      p_user_id: input.userId,
      p_role: input.role,
    });
    return workspaceMember(rpcRow(checked("workspace_members.add", result)));
  }

  async updateMemberRole(
    context: RequestContext,
    userId: string,
    input: WorkspaceMemberRolePatchInput,
  ) {
    const result = await this.client.rpc("update_workspace_member_role", {
      p_workspace_id: context.workspaceId,
      p_user_id: userId,
      p_role: input.role,
    });
    return workspaceMember(
      rpcRow(checked("workspace_members.update_role", result)),
    );
  }

  async removeMember(context: RequestContext, userId: string) {
    const result = await this.client.rpc("remove_workspace_member", {
      p_workspace_id: context.workspaceId,
      p_user_id: userId,
    });
    return checked("workspace_members.remove", result) === true;
  }

  async listInvitations(context: RequestContext) {
    const result = await this.requirePrivilegedClient()
      .from("workspace_invitations")
      .select("*")
      .eq("workspace_id", context.workspaceId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    return rows(checked("workspace_invitations.list", result)).map(
      workspaceInvitation,
    );
  }

  async createInvitation(
    context: RequestContext,
    input: WorkspaceInvitationCreateInput,
  ) {
    this.requirePrivilegedClient();
    const created = await this.client.rpc("create_workspace_invitation", {
      p_workspace_id: context.workspaceId,
      p_email: input.email.trim().toLowerCase(),
      p_role: input.role,
    });
    const invitation = rpcRow(checked("workspace_invitations.create", created));
    const sent = await this.sendInvitationEmail(
      invitation,
      await this.workspaceName(context.workspaceId),
    );
    return workspaceInvitation(sent);
  }

  async updateInvitationRole(
    context: RequestContext,
    invitationId: string,
    input: WorkspaceInvitationRolePatchInput,
  ) {
    const result = await this.client.rpc("update_workspace_invitation", {
      p_workspace_id: context.workspaceId,
      p_invitation_id: invitationId,
      p_role: input.role,
    });
    return workspaceInvitation(
      rpcRow(checked("workspace_invitations.update_role", result)),
    );
  }

  async removeInvitation(context: RequestContext, invitationId: string) {
    const result = await this.client.rpc("revoke_workspace_invitation", {
      p_workspace_id: context.workspaceId,
      p_invitation_id: invitationId,
    });
    return checked("workspace_invitations.revoke", result) === true;
  }

  async resendInvitation(context: RequestContext, invitationId: string) {
    const result = await this.requirePrivilegedClient()
      .from("workspace_invitations")
      .select("*")
      .eq("workspace_id", context.workspaceId)
      .eq("id", invitationId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .maybeSingle();
    const invitation = row(checked("workspace_invitations.get", result));
    if (!Object.keys(invitation).length)
      throw new Error("workspace_invitation_not_found");
    const sent = await this.sendInvitationEmail(
      invitation,
      await this.workspaceName(context.workspaceId),
    );
    return workspaceInvitation(sent);
  }

  async listAuditLog(context: RequestContext, query: AuditLogListQuery) {
    let request = this.client
      .from("audit_log")
      .select("*")
      .eq("workspace_id", context.workspaceId);
    if (query.action) request = request.eq("action", query.action);
    if (query.entityType) request = request.eq("entity_type", query.entityType);
    if (query.cursor) request = request.lt("created_at", query.cursor);
    const result = await request
      .order("created_at", { ascending: false })
      .limit(query.limit);
    return rows(checked("audit_log.list", result)).map(auditLog);
  }
}
