import type { RequestHandler } from "express";
import type { JobStore } from "./jobs.js";
import { verifyGitHubWebhookSignature } from "./github-control-plane.js";
import { checked, rows, str, type Row } from "./adapters/supabase-mappers.js";
import type { AnySupabaseClient } from "./adapters/supabase/types.js";
import {
  KNOWLEDGE_REPOSITORY_SYNC_JOB_TYPE,
  knowledgeSyncDedupeKey,
  type KnowledgeRepositorySyncJobPayload,
} from "./knowledge-sync.js";

export interface GitHubKnowledgeWebhookDependencies {
  client: AnySupabaseClient;
  jobs: JobStore<Record<string, unknown>>;
  secret: string;
  logger?: {
    info(bindings: Record<string, unknown>, message: string): void;
    warn(bindings: Record<string, unknown>, message: string): void;
  };
}

const object = (value: unknown): Row =>
  value && typeof value === "object" ? (value as Row) : {};

export function createGitHubKnowledgeWebhook(
  dependencies: GitHubKnowledgeWebhookDependencies,
): RequestHandler {
  return (request, response) => {
    void (async () => {
      const body = Buffer.isBuffer(request.body)
        ? request.body
        : Buffer.alloc(0);
      if (
        !body.length ||
        !verifyGitHubWebhookSignature(
          body,
          request.get("x-hub-signature-256"),
          dependencies.secret,
        )
      ) {
        response.status(401).json({
          error: {
            code: "github_signature_invalid",
            message: "Webhook signature is invalid",
          },
        });
        return;
      }
      const event = request.get("x-github-event")?.trim().toLowerCase();
      const deliveryId = request.get("x-github-delivery")?.trim();
      if (event === "ping") {
        response.status(204).send();
        return;
      }
      if (event !== "push" || !deliveryId) {
        response.status(204).send();
        return;
      }
      let payload: Row;
      try {
        payload = JSON.parse(body.toString("utf8")) as Row;
      } catch {
        response.status(400).json({
          error: {
            code: "github_payload_invalid",
            message: "Webhook payload is invalid",
          },
        });
        return;
      }
      const repository = object(payload.repository);
      const owner = str(object(repository.owner).login).trim();
      const repo = str(repository.name).trim();
      const installationId = Number(object(payload.installation).id);
      const sha = str(payload.after).toLowerCase();
      const ref = str(payload.ref);
      const branch = ref.startsWith("refs/heads/")
        ? ref.slice("refs/heads/".length)
        : "";
      if (
        !owner ||
        !repo ||
        !branch ||
        !Number.isSafeInteger(installationId) ||
        !/^[a-f0-9]{40,64}$/.test(sha)
      ) {
        response.status(204).send();
        return;
      }
      const result = await dependencies.client
        .from("repositories")
        .select(
          "id, workspace_id, github_owner, github_repo, github_installation_id, knowledge_sources(id, ref_name, sync_mode)",
        )
        .ilike("github_owner", owner)
        .ilike("github_repo", repo)
        .eq("github_installation_id", String(installationId));
      const repositories = rows(
        checked("github_knowledge.repositories", result),
      );
      let queued = 0;
      for (const configured of repositories) {
        const sources = Array.isArray(configured.knowledge_sources)
          ? configured.knowledge_sources.map(object)
          : [];
        for (const source of sources) {
          if (
            str(source.ref_name) !== branch ||
            str(source.sync_mode) !== "event"
          )
            continue;
          const job: KnowledgeRepositorySyncJobPayload = {
            stage: "knowledge_repository_sync",
            workspaceId: str(configured.workspace_id),
            sourceId: str(source.id),
            repositoryId: str(configured.id),
            owner,
            repo,
            installationId,
            requestedSha: sha,
            deliveryId,
          };
          await dependencies.jobs.enqueue({
            workspaceId: job.workspaceId,
            type: KNOWLEDGE_REPOSITORY_SYNC_JOB_TYPE,
            payload: job,
            dedupeKey: knowledgeSyncDedupeKey(job),
          });
          checked(
            "github_knowledge.source_queued",
            await dependencies.client
              .from("knowledge_sources")
              .update({
                observed_sha: sha,
                sync_state: "queued",
                last_error_code: null,
                updated_at: new Date().toISOString(),
              })
              .eq("workspace_id", job.workspaceId)
              .eq("id", job.sourceId),
          );
          queued += 1;
        }
      }
      dependencies.logger?.info(
        { event, deliveryId, queued },
        "GitHub knowledge webhook accepted",
      );
      response.status(202).json({ queued });
    })().catch((error) => {
      dependencies.logger?.warn(
        { err: error },
        "GitHub knowledge webhook failed",
      );
      if (!response.headersSent)
        response.status(500).json({
          error: {
            code: "github_knowledge_webhook_failed",
            message: "Webhook processing failed",
          },
        });
    });
  };
}
