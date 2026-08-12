import { createHash } from "node:crypto";

export type ExternalOperationKind =
  | "github_publish"
  | "github_merge"
  | "dokploy_deploy";
export type ExternalOperationStatus =
  | "pending"
  | "completed"
  | "failed"
  | "uncertain";

export interface ExternalOperationRecord {
  id: string;
  workspaceId: string;
  kind: ExternalOperationKind;
  idempotencyKey: string;
  requestDigest: string;
  status: ExternalOperationStatus;
  result: unknown | null;
}

export interface ExternalOperationPort {
  begin(
    input: Omit<ExternalOperationRecord, "id" | "status" | "result">,
  ): Promise<ExternalOperationRecord>;
  complete(id: string, result: unknown): Promise<ExternalOperationRecord>;
  markUncertain(id: string, errorCode: string): Promise<void>;
  fail(id: string, errorCode: string): Promise<void>;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function externalRequestDigest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

/** Durable intent + reconciliation wrapper for non-transactional provider writes. */
export async function executeRecoverableOperation<T>(input: {
  workspaceId: string;
  kind: ExternalOperationKind;
  idempotencyKey: string;
  request: unknown;
  port: ExternalOperationPort;
  reconcile: () => Promise<T | null>;
  mutate: () => Promise<T>;
}): Promise<T> {
  const operation = await input.port.begin({
    workspaceId: input.workspaceId,
    kind: input.kind,
    idempotencyKey: input.idempotencyKey,
    requestDigest: externalRequestDigest(input.request),
  });
  if (operation.status === "completed") return operation.result as T;
  const reconciled = await input.reconcile();
  if (reconciled) {
    await input.port.complete(operation.id, reconciled);
    return reconciled;
  }
  try {
    const result = await input.mutate();
    await input.port.complete(operation.id, result);
    return result;
  } catch (error) {
    await input.port
      .markUncertain(
        operation.id,
        error instanceof Error ? error.name : "external_operation_error",
      )
      .catch(() => undefined);
    throw error;
  }
}
