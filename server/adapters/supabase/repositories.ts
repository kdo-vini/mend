import { type RepositoryConfigPort } from "../../codex-service.js";
import {
  type GitHubConnectionPort,
  type RepositoryInput,
  type RepositoryListQuery,
  type RepositoryPatchInput,
  type RepositoryPort,
  type RequestContext,
} from "../../contracts/api-ports.js";
import {
  createGitHubControlPlaneFromEnv,
  createGitHubSetupState,
  GitHubControlPlaneError,
  githubInstallationUrl,
  hashGitHubSetupState,
  validateGitHubSetupCallback,
} from "../../github-control-plane.js";
import type { AnySupabaseClient } from "./types.js";
import {
  checked,
  repository,
  repositoryDbPayload,
  row,
  rows,
} from "../supabase-mappers.js";
export class SupabaseRepositoryAdapter
  implements RepositoryPort, RepositoryConfigPort
{
  constructor(private readonly client: AnySupabaseClient) {}

  private async githubBinding(
    context: RequestContext,
    input: RepositoryInput | RepositoryPatchInput,
  ) {
    if (input.githubOwner === undefined && input.githubRepo === undefined)
      return {};
    const result = await this.client
      .from("workspaces")
      .select("github_installation_id, github_owner")
      .eq("id", context.workspaceId)
      .maybeSingle();
    const workspace = row(
      checked("workspaces.github_repository_binding", result),
    );
    const installationId = String(workspace.github_installation_id ?? "");
    const owner = String(workspace.github_owner ?? "");
    if (!/^\d{1,20}$/.test(installationId) || !owner)
      throw new Error("github_workspace_not_connected");
    if (
      input.githubOwner &&
      input.githubOwner.toLowerCase() !== owner.toLowerCase()
    )
      throw new Error("github_owner_mismatch");
    return {
      githubOwner: owner,
      githubInstallationId: installationId,
    };
  }

  async list(context: RequestContext, query: RepositoryListQuery) {
    let request = this.client
      .from("repositories")
      .select("*")
      .eq("workspace_id", context.workspaceId);
    if (query.cursor) request = request.gt("id", query.cursor);
    const result = await request
      .order("created_at", { ascending: false })
      .limit(query.limit);
    return rows(checked("repositories.list", result)).map(repository);
  }
  async create(context: RequestContext, input: RepositoryInput) {
    const githubBinding = await this.githubBinding(context, input);
    const result = await this.client
      .from("repositories")
      .insert({
        workspace_id: context.workspaceId,
        ...repositoryDbPayload({ ...input, ...githubBinding }),
      })
      .select("*")
      .single();
    return repository(row(checked("repositories.create", result)));
  }
  async update(
    context: RequestContext,
    id: string,
    input: RepositoryPatchInput,
  ) {
    const githubBinding = await this.githubBinding(context, input);
    const result = await this.client
      .from("repositories")
      .update({
        ...repositoryDbPayload({ ...input, ...githubBinding }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("workspace_id", context.workspaceId)
      .select("*")
      .maybeSingle();
    const data = checked("repositories.update", result);
    return data ? repository(row(data)) : null;
  }
  async remove(context: RequestContext, id: string) {
    const result = await this.client
      .from("repositories")
      .delete()
      .eq("id", id)
      .eq("workspace_id", context.workspaceId)
      .select("id");
    return rows(checked("repositories.delete", result)).length > 0;
  }

  async getRepository(workspaceId: string, repositoryId: string) {
    const result = await this.client
      .from("repositories")
      .select("*")
      .eq("id", repositoryId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    const data = checked("repositories.get", result);
    return data ? repository(row(data)) : null;
  }
}

export class SupabaseGitHubConnectionAdapter implements GitHubConnectionPort {
  constructor(
    private readonly client: AnySupabaseClient,
    private readonly privilegedClient: AnySupabaseClient,
  ) {}

  private setupConfig() {
    const slug = process.env.MEND_GITHUB_APP_SLUG?.trim();
    const secret = process.env.MEND_GITHUB_SETUP_STATE_SECRET?.trim();
    if (!slug || !secret)
      throw new GitHubControlPlaneError(
        "GitHub App setup is not configured on the server",
        503,
        "github_setup_not_configured",
      );
    return { slug, secret };
  }

  private controlPlane() {
    const controlPlane = createGitHubControlPlaneFromEnv();
    if (!controlPlane)
      throw new GitHubControlPlaneError(
        "GitHub App authentication is not configured on the server",
        503,
        "github_app_not_configured",
      );
    return controlPlane;
  }

  async startSetup(context: RequestContext, repositoryId: string) {
    const { slug, secret } = this.setupConfig();
    const repositoryResult = await this.client
      .from("repositories")
      .select("id")
      .eq("id", repositoryId)
      .eq("workspace_id", context.workspaceId)
      .maybeSingle();
    const repositoryData = checked(
      "repositories.github_setup",
      repositoryResult,
    );
    if (!repositoryData)
      throw new GitHubControlPlaneError(
        "Repository was not found",
        404,
        "repository_not_found",
      );
    const setup = createGitHubSetupState(
      {
        workspaceId: context.workspaceId,
        userId: context.userId,
        repositoryId,
      },
      secret,
    );
    checked(
      "github_setup_states.create",
      await this.privilegedClient.from("github_setup_states").insert({
        state_hash: hashGitHubSetupState(setup.state),
        workspace_id: context.workspaceId,
        user_id: context.userId,
        repository_id: repositoryId,
        expires_at: setup.expiresAt,
      }),
    );
    return { installationUrl: githubInstallationUrl(slug, setup.state) };
  }

  async startWorkspaceSetup(context: RequestContext) {
    const { slug, secret } = this.setupConfig();
    const setup = createGitHubSetupState(
      {
        workspaceId: context.workspaceId,
        userId: context.userId,
      },
      secret,
    );
    checked(
      "github_setup_states.create",
      await this.privilegedClient.from("github_setup_states").insert({
        state_hash: hashGitHubSetupState(setup.state),
        workspace_id: context.workspaceId,
        user_id: context.userId,
        repository_id: null,
        expires_at: setup.expiresAt,
      }),
    );
    return { installationUrl: githubInstallationUrl(slug, setup.state) };
  }

  async getWorkspaceConnection(context: RequestContext) {
    const result = await this.privilegedClient
      .from("workspaces")
      .select("github_installation_id, github_owner, github_connected_at")
      .eq("id", context.workspaceId)
      .maybeSingle();
    const data = checked("workspaces.github_connection", result);
    const value = row(data);
    return {
      connected: Boolean(value.github_installation_id),
      ...(value.github_owner ? { owner: String(value.github_owner) } : {}),
      ...(value.github_connected_at
        ? { connectedAt: String(value.github_connected_at) }
        : {}),
    };
  }

  async listWorkspaceRepositories(context: RequestContext) {
    const result = await this.privilegedClient
      .from("workspaces")
      .select("github_installation_id")
      .eq("id", context.workspaceId)
      .maybeSingle();
    const workspace = row(checked("workspaces.github_repositories", result));
    const installationId = Number(workspace.github_installation_id);
    if (!Number.isSafeInteger(installationId) || installationId < 1)
      throw new GitHubControlPlaneError(
        "Connect a GitHub App installation to this workspace first",
        409,
        "github_workspace_not_connected",
      );
    const repositories =
      await this.controlPlane().listInstallationRepositories(installationId);
    return repositories.map((repository) => ({
      owner: repository.owner,
      repo: repository.repo,
      defaultBranch: "main",
    }));
  }

  async disconnectWorkspace(context: RequestContext) {
    const updated = await this.privilegedClient
      .from("workspaces")
      .update({
        github_installation_id: null,
        github_owner: null,
        github_connected_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", context.workspaceId)
      .select("id");
    const disconnected =
      rows(checked("workspaces.github_disconnect", updated)).length > 0;
    if (!disconnected) return false;
    checked(
      "repositories.github_disconnect",
      await this.privilegedClient
        .from("repositories")
        .update({
          github_installation_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", context.workspaceId),
    );
    return true;
  }

  async completeSetup(query: Record<string, unknown>) {
    const { secret } = this.setupConfig();
    const callback = validateGitHubSetupCallback(query, secret);
    const state = String(query.state ?? "");
    const controlPlane = this.controlPlane();
    const available = await controlPlane.listInstallationRepositories(
      callback.installationId,
    );

    if (!callback.repositoryId) {
      const selectedOwner = available[0]?.owner;
      if (!selectedOwner)
        throw new GitHubControlPlaneError(
          "The GitHub App installation has no repositories available",
          400,
          "github_repositories_empty",
        );
      const consumed = await this.privilegedClient
        .from("github_setup_states")
        .update({ consumed_at: new Date().toISOString() })
        .eq("state_hash", hashGitHubSetupState(state))
        .eq("workspace_id", callback.workspaceId)
        .eq("user_id", callback.userId)
        .is("repository_id", null)
        .is("consumed_at", null)
        .gt("expires_at", new Date().toISOString())
        .select("state_hash")
        .maybeSingle();
      if (!checked("github_setup_states.consume", consumed))
        throw new GitHubControlPlaneError(
          "GitHub setup state was already used or expired",
          400,
          "github_state_replayed",
        );
      const connectedAt = new Date().toISOString();
      const updated = await this.privilegedClient
        .from("workspaces")
        .update({
          github_owner: selectedOwner,
          github_installation_id: String(callback.installationId),
          github_connected_at: connectedAt,
          updated_at: connectedAt,
        })
        .eq("id", callback.workspaceId)
        .select("id")
        .maybeSingle();
      if (!checked("workspaces.github_connected", updated))
        throw new GitHubControlPlaneError(
          "Workspace was not found",
          404,
          "workspace_not_found",
        );

      const configured = rows(
        checked(
          "repositories.github_reconnect",
          await this.privilegedClient
            .from("repositories")
            .select("id, github_owner, github_repo")
            .eq("workspace_id", callback.workspaceId),
        ),
      );
      const availableNames = new Set(
        available.map(
          (item) => `${item.owner.toLowerCase()}/${item.repo.toLowerCase()}`,
        ),
      );
      await Promise.all(
        configured
          .filter(
            (item) =>
              typeof item.github_owner === "string" &&
              typeof item.github_repo === "string" &&
              availableNames.has(
                `${item.github_owner.toLowerCase()}/${item.github_repo.toLowerCase()}`,
              ),
          )
          .map(async (item) =>
            checked(
              "repositories.github_reconnect_update",
              await this.privilegedClient
                .from("repositories")
                .update({
                  github_installation_id: String(callback.installationId),
                  updated_at: connectedAt,
                })
                .eq("id", String(item.id))
                .eq("workspace_id", callback.workspaceId),
            ),
          ),
      );
      return {
        connected: true,
        owner: selectedOwner,
        connectedAt,
        repositoryCount: available.length,
      };
    }

    const repositoryResult = await this.privilegedClient
      .from("repositories")
      .select("*")
      .eq("id", callback.repositoryId)
      .eq("workspace_id", callback.workspaceId)
      .maybeSingle();
    const repositoryData = checked(
      "repositories.github_callback",
      repositoryResult,
    );
    if (!repositoryData)
      throw new GitHubControlPlaneError(
        "Repository was not found",
        404,
        "repository_not_found",
      );
    const configured = repository(row(repositoryData));
    const selected =
      configured.githubOwner && configured.githubRepo
        ? available.find(
            (item) =>
              item.owner.toLowerCase() ===
                configured.githubOwner?.toLowerCase() &&
              item.repo.toLowerCase() === configured.githubRepo?.toLowerCase(),
          )
        : available.length === 1
          ? available[0]
          : undefined;
    if (!selected)
      throw new GitHubControlPlaneError(
        "The configured repository is not available to this GitHub App installation",
        400,
        "github_repository_not_available",
      );
    // Consume only after the installation and repository have been verified.
    // A transient GitHub outage must not burn the one-time setup state and
    // force an administrator to restart the connection flow.
    const consumed = await this.privilegedClient
      .from("github_setup_states")
      .update({ consumed_at: new Date().toISOString() })
      .eq("state_hash", hashGitHubSetupState(state))
      .eq("workspace_id", callback.workspaceId)
      .eq("user_id", callback.userId)
      .eq("repository_id", callback.repositoryId)
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("state_hash")
      .maybeSingle();
    if (!checked("github_setup_states.consume", consumed))
      throw new GitHubControlPlaneError(
        "GitHub setup state was already used or expired",
        400,
        "github_state_replayed",
      );
    const updated = await this.privilegedClient
      .from("repositories")
      .update({
        github_owner: selected.owner,
        github_repo: selected.repo,
        github_installation_id: String(callback.installationId),
        updated_at: new Date().toISOString(),
      })
      .eq("id", callback.repositoryId)
      .eq("workspace_id", callback.workspaceId)
      .select("*")
      .single();
    return repository(row(checked("repositories.github_connected", updated)));
  }
}
