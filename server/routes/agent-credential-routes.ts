import { z } from "zod";
import type { ApiRouteModuleContext } from "../api-router.js";

const provider = z.enum(["openai", "anthropic", "google", "verboo"]);
const task = z.enum(["support", "agent"]);
const credentialSchema = z
  .object({
    task,
    provider,
    apiKey: z.string().trim().min(1).max(500),
    config: z.record(z.unknown()).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.task === "support" &&
      (typeof value.config?.model !== "string" || !value.config.model.trim())
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["config", "model"],
        message: "A support model must be selected.",
      });
    if (
      value.task === "support" &&
      (typeof value.config?.embeddingModel !== "string" ||
        !value.config.embeddingModel.trim())
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["config", "embeddingModel"],
        message: "A support embedding model must be selected.",
      });
    if (
      value.task === "support" &&
      (typeof value.config?.transcriptionModel !== "string" ||
        !value.config.transcriptionModel.trim())
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["config", "transcriptionModel"],
        message: "A support transcription model must be selected.",
      });
  });

export function registerAgentCredentialRoutes(
  context: ApiRouteModuleContext,
): void {
  const { router, dependencies, scoped, parse, asyncRoute, send, noContent } =
    context;
  router.get(
    "/api/agent-credentials",
    asyncRoute(async (request, response) => {
      send(
        response,
        200,
        await dependencies.agentCredentials.list(
          await scoped(request, response, "admin"),
        ),
      );
    }),
  );
  router.put(
    "/api/agent-credentials",
    asyncRoute(async (request, response) => {
      send(
        response,
        200,
        await dependencies.agentCredentials.save(
          await scoped(request, response, "admin"),
          parse(credentialSchema, request.body),
        ),
      );
    }),
  );
  router.delete(
    "/api/agent-credentials/:task/:provider",
    asyncRoute(async (request, response) => {
      const input = parse(
        z.object({ task, provider }).strict(),
        request.params,
      );
      const removed = await dependencies.agentCredentials.remove(
        await scoped(request, response, "admin"),
        input.task,
        input.provider,
      );
      if (!removed) {
        send(response, 404, {
          error: {
            code: "agent_credential_not_found",
            message: "Credential not found",
          },
        });
        return;
      }
      noContent(response);
    }),
  );
}
