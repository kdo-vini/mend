import type { AnySupabaseClient } from "./types.js";
import { checked, row, rows, str, type Row } from "../supabase-mappers.js";
import type { JobStore } from "../../jobs.js";
import {
  createGitHubControlPlaneFromEnv,
  type GitHubControlPlane,
} from "../../github-control-plane.js";
import {
  KNOWLEDGE_REPOSITORY_SYNC_JOB_TYPE,
  knowledgeSyncDedupeKey,
  sourceFreshness,
  type KnowledgeConfigurationPort,
  type KnowledgeProductInput,
  type KnowledgeRepositorySyncJobPayload,
  type KnowledgeSource,
  type KnowledgeSourceInput,
} from "../../knowledge-sync.js";

const productDto = (value: Row) => ({
  id: str(value.id),
  key: str(value.product_key),
  name: str(value.name),
  description: str(value.description),
  aliases: Array.isArray(value.aliases) ? value.aliases.map(String) : [],
  status: str(value.status) === "archived" ? "archived" : "active",
});

function sourceDomain(value: Row): KnowledgeSource {
  return {
    id: str(value.id),
    workspaceId: str(value.workspace_id),
    repositoryId: str(value.repository_id),
    refName: str(value.ref_name),
    syncMode: str(value.sync_mode) as KnowledgeSource["syncMode"],
    ...(value.observed_sha ? { observedSha: str(value.observed_sha) } : {}),
    ...(value.indexed_sha ? { indexedSha: str(value.indexed_sha) } : {}),
    ...(value.active_sha ? { activeSha: str(value.active_sha) } : {}),
    syncState: str(value.sync_state) as KnowledgeSource["syncState"],
  };
}

const sourceDto = (value: Row, productIds: string[] = []) => {
  const source = sourceDomain(value);
  const repository = (
    value.repositories && typeof value.repositories === "object"
      ? value.repositories
      : {}
  ) as Row;
  return {
    id: source.id,
    repositoryId: source.repositoryId,
    repositoryName: str(repository.name || value.repository_name),
    productIds,
    refName: source.refName,
    observedSha: source.observedSha,
    indexedSha: source.indexedSha,
    activeSha: source.activeSha,
    freshness: sourceFreshness(source),
    syncState: source.syncState,
    lastSyncAt: value.last_sync_at ? str(value.last_sync_at) : undefined,
    errorCode: value.last_error_code ? str(value.last_error_code) : undefined,
  };
};

export class SupabaseKnowledgeConfigurationAdapter
  implements KnowledgeConfigurationPort
{
  constructor(
    private readonly client: AnySupabaseClient,
    private readonly jobStore?: JobStore<Record<string, unknown>>,
    private readonly github: Pick<
      GitHubControlPlane,
      "getBranchSha"
    > | null = createGitHubControlPlaneFromEnv(),
  ) {}

  async listProducts(workspaceId: string) {
    const result = await this.client
      .from("support_products")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("name");
    return rows(checked("support_products.list", result)).map(productDto);
  }

  async createProduct(workspaceId: string, input: KnowledgeProductInput) {
    const result = await this.client
      .from("support_products")
      .insert({
        workspace_id: workspaceId,
        product_key: input.key,
        name: input.name,
        description: input.description,
        aliases: [...input.aliases],
        status: input.status ?? "active",
      })
      .select("*")
      .single();
    return productDto(row(checked("support_products.create", result)));
  }

  async updateProduct(
    workspaceId: string,
    productId: string,
    input: Partial<KnowledgeProductInput>,
  ) {
    const result = await this.client
      .from("support_products")
      .update({
        ...(input.key !== undefined ? { product_key: input.key } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.aliases !== undefined ? { aliases: [...input.aliases] } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", workspaceId)
      .eq("id", productId)
      .select("*")
      .maybeSingle();
    const value = checked("support_products.update", result);
    return value ? productDto(row(value)) : null;
  }

  private async productIdsByRepository(workspaceId: string) {
    const mappings = rows(
      checked(
        "support_product_repositories.list",
        await this.client
          .from("support_product_repositories")
          .select("repository_id, product_id")
          .eq("workspace_id", workspaceId)
          .eq("knowledge_enabled", true),
      ),
    );
    const output = new Map<string, string[]>();
    for (const mapping of mappings)
      output.set(str(mapping.repository_id), [
        ...(output.get(str(mapping.repository_id)) ?? []),
        str(mapping.product_id),
      ]);
    return output;
  }

  async listSources(workspaceId: string) {
    const [result, products] = await Promise.all([
      this.client
        .from("knowledge_sources")
        .select("*, repositories(name)")
        .eq("workspace_id", workspaceId)
        .order("created_at"),
      this.productIdsByRepository(workspaceId),
    ]);
    return rows(checked("knowledge_sources.list", result)).map((value) =>
      sourceDto(value, products.get(str(value.repository_id)) ?? []),
    );
  }

  private async replaceMappings(
    workspaceId: string,
    repositoryId: string,
    productIds: readonly string[],
  ) {
    checked(
      "support_product_repositories.delete",
      await this.client
        .from("support_product_repositories")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("repository_id", repositoryId),
    );
    if (productIds.length)
      checked(
        "support_product_repositories.insert",
        await this.client.from("support_product_repositories").insert(
          [...new Set(productIds)].map((productId) => ({
            workspace_id: workspaceId,
            repository_id: repositoryId,
            product_id: productId,
            knowledge_enabled: true,
          })),
        ),
      );
  }

  async createSource(workspaceId: string, input: KnowledgeSourceInput) {
    const result = await this.client
      .from("knowledge_sources")
      .insert({
        workspace_id: workspaceId,
        repository_id: input.repositoryId,
        ref_name: input.refName,
        sync_mode: input.syncMode,
        ...(input.includePatterns
          ? { include_patterns: [...input.includePatterns] }
          : {}),
        ...(input.excludePatterns
          ? { exclude_patterns: [...input.excludePatterns] }
          : {}),
      })
      .select("*, repositories(name)")
      .single();
    const created = row(checked("knowledge_sources.create", result));
    await this.replaceMappings(
      workspaceId,
      input.repositoryId,
      input.productIds,
    );
    return sourceDto(created, [...new Set(input.productIds)]);
  }

  async updateSource(
    workspaceId: string,
    sourceId: string,
    input: Partial<KnowledgeSourceInput>,
  ) {
    const result = await this.client
      .from("knowledge_sources")
      .update({
        ...(input.refName !== undefined ? { ref_name: input.refName } : {}),
        ...(input.syncMode !== undefined ? { sync_mode: input.syncMode } : {}),
        ...(input.includePatterns !== undefined
          ? { include_patterns: [...input.includePatterns] }
          : {}),
        ...(input.excludePatterns !== undefined
          ? { exclude_patterns: [...input.excludePatterns] }
          : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", workspaceId)
      .eq("id", sourceId)
      .select("*, repositories(name)")
      .maybeSingle();
    const value = checked("knowledge_sources.update", result);
    if (!value) return null;
    const updated = row(value);
    if (input.productIds)
      await this.replaceMappings(
        workspaceId,
        str(updated.repository_id),
        input.productIds,
      );
    const mappings = await this.productIdsByRepository(workspaceId);
    return sourceDto(updated, mappings.get(str(updated.repository_id)) ?? []);
  }

  async requestSync(workspaceId: string, sourceId: string) {
    if (!this.jobStore) throw new Error("knowledge_sync_runner_unavailable");
    const result = await this.client
      .from("knowledge_sources")
      .select(
        "*, repositories(github_owner, github_repo, github_installation_id)",
      )
      .eq("workspace_id", workspaceId)
      .eq("id", sourceId)
      .neq("sync_mode", "paused")
      .maybeSingle();
    const value = checked("knowledge_sources.sync", result);
    if (!value) return null;
    const source = row(value);
    const repository = row(source.repositories);
    const owner = str(repository.github_owner);
    const repo = str(repository.github_repo);
    const installationId = Number(repository.github_installation_id);
    if (
      !owner ||
      !repo ||
      !Number.isSafeInteger(installationId) ||
      installationId < 1
    )
      throw new Error("github_repository_not_connected");
    let requestedSha = str(source.observed_sha || source.active_sha);
    if (this.github) {
      requestedSha = await this.github.getBranchSha(
        { owner, repo, installationId },
        str(source.ref_name),
      );
    }
    if (requestedSha && requestedSha !== str(source.observed_sha)) {
      checked(
        "knowledge_sources.observe",
        await this.client
          .from("knowledge_sources")
          .update({
            observed_sha: requestedSha,
            updated_at: new Date().toISOString(),
          })
          .eq("workspace_id", workspaceId)
          .eq("id", sourceId),
      );
    }
    if (!/^[a-f0-9]{40,64}$/.test(requestedSha))
      throw new Error("knowledge_source_revision_required");
    if (requestedSha === str(source.indexed_sha)) {
      checked(
        "knowledge_sources.already_current",
        await this.client
          .from("knowledge_sources")
          .update({
            sync_state: "ready",
            last_error_code: null,
            updated_at: new Date().toISOString(),
          })
          .eq("workspace_id", workspaceId)
          .eq("id", sourceId),
      );
      return { queued: false, requestedSha };
    }
    const payload: KnowledgeRepositorySyncJobPayload = {
      stage: "knowledge_repository_sync",
      workspaceId,
      sourceId,
      repositoryId: str(source.repository_id),
      owner,
      repo,
      installationId,
      requestedSha,
      deliveryId: `manual:${Date.now()}`,
    };
    await this.jobStore.enqueue({
      workspaceId,
      type: KNOWLEDGE_REPOSITORY_SYNC_JOB_TYPE,
      payload,
      dedupeKey: knowledgeSyncDedupeKey(payload),
    });
    checked(
      "knowledge_sources.queue",
      await this.client
        .from("knowledge_sources")
        .update({
          sync_state: "queued",
          last_error_code: null,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", workspaceId)
        .eq("id", sourceId),
    );
    return { queued: true, requestedSha };
  }

  async activateRevision(workspaceId: string, sourceId: string, sha: string) {
    const completed = await this.client
      .from("knowledge_sync_runs")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("source_id", sourceId)
      .eq("requested_sha", sha)
      .eq("status", "completed")
      .maybeSingle();
    if (!checked("knowledge_sync_runs.activation", completed))
      throw new Error("knowledge_revision_not_indexed");
    const result = await this.client
      .from("knowledge_sources")
      .update({
        active_sha: sha,
        active_sha_source: "manual",
        sync_state: "ready",
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", workspaceId)
      .eq("id", sourceId)
      .eq("indexed_sha", sha)
      .select("*, repositories(name)")
      .maybeSingle();
    const value = checked("knowledge_sources.activate", result);
    return value ? sourceDto(row(value)) : null;
  }
}
