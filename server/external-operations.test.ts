import { describe, expect, it, vi } from "vitest";
import {
  executeRecoverableOperation,
  type ExternalOperationPort,
  type ExternalOperationRecord,
} from "./external-operations.js";

describe("recoverable external operations", () => {
  it("reconciles a provider effect after a checkpoint crash without mutating twice", async () => {
    let record: ExternalOperationRecord | null = null;
    let failFirstCheckpoint = true;
    const port: ExternalOperationPort = {
      begin: async (input) =>
        (record ??= {
          ...input,
          id: "operation-1",
          status: "pending",
          result: null,
        }),
      complete: async (_id, result) => {
        if (failFirstCheckpoint) {
          failFirstCheckpoint = false;
          throw new Error("database unavailable after provider success");
        }
        record = { ...record!, status: "completed", result };
        return record;
      },
      markUncertain: async () => {
        record = { ...record!, status: "uncertain" };
      },
      fail: async () => undefined,
    };
    let providerResult: { reference: string } | null = null;
    const mutate = vi.fn(async () => {
      providerResult = { reference: "deployment-1" };
      return providerResult;
    });
    const reconcile = vi.fn(async () => providerResult);
    const input = {
      workspaceId: "workspace-1",
      kind: "dokploy_deploy" as const,
      idempotencyKey: "deploy:run-1:sha-1",
      request: { runId: "run-1", commitSha: "sha-1" },
      port,
      mutate,
      reconcile,
    };

    await expect(executeRecoverableOperation(input)).rejects.toThrow(
      "database unavailable",
    );
    await expect(executeRecoverableOperation(input)).resolves.toEqual({
      reference: "deployment-1",
    });
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenCalledTimes(2);
  });
});
