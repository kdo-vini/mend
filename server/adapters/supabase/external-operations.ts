import type { SupabaseClient } from "@supabase/supabase-js";
import {
  executeRecoverableOperation,
  externalRequestDigest,
  type ExternalOperationPort,
  type ExternalOperationRecord,
} from "../../external-operations.js";
import { checked, row, str } from "../supabase-mappers.js";

export class SupabaseExternalOperationAdapter implements ExternalOperationPort {
  constructor(private readonly client: SupabaseClient) {}

  private record(value: unknown): ExternalOperationRecord {
    const item = row(value);
    return {
      id: str(item.id),
      workspaceId: str(item.workspace_id),
      kind: str(item.kind) as ExternalOperationRecord["kind"],
      idempotencyKey: str(item.idempotency_key),
      requestDigest: str(item.request_digest),
      status: str(item.status) as ExternalOperationRecord["status"],
      result: item.result_json ?? null,
    };
  }

  async begin(
    input: Omit<ExternalOperationRecord, "id" | "status" | "result">,
  ): Promise<ExternalOperationRecord> {
    const inserted = await this.client
      .from("external_operations")
      .upsert(
        {
          workspace_id: input.workspaceId,
          kind: input.kind,
          idempotency_key: input.idempotencyKey,
          request_digest: input.requestDigest,
        },
        {
          onConflict: "workspace_id,kind,idempotency_key",
          ignoreDuplicates: true,
        },
      )
      .select("*")
      .maybeSingle();
    let value = checked("external_operations.begin", inserted);
    if (!value)
      value = checked(
        "external_operations.get",
        await this.client
          .from("external_operations")
          .select("*")
          .eq("workspace_id", input.workspaceId)
          .eq("kind", input.kind)
          .eq("idempotency_key", input.idempotencyKey)
          .single(),
      );
    const operation = this.record(value);
    if (operation.requestDigest !== input.requestDigest)
      throw new Error("external_operation_request_mismatch");
    return operation;
  }

  async complete(
    id: string,
    result: unknown,
  ): Promise<ExternalOperationRecord> {
    const updated = await this.client
      .from("external_operations")
      .update({
        status: "completed",
        result_json: result,
        error_code: null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    return this.record(checked("external_operations.complete", updated));
  }

  async markUncertain(id: string, errorCode: string): Promise<void> {
    checked(
      "external_operations.uncertain",
      await this.client
        .from("external_operations")
        .update({
          status: "uncertain",
          error_code: errorCode.slice(0, 240),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id),
    );
  }

  async fail(id: string, errorCode: string): Promise<void> {
    checked(
      "external_operations.fail",
      await this.client
        .from("external_operations")
        .update({
          status: "failed",
          error_code: errorCode.slice(0, 240),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id),
    );
  }
}

export { executeRecoverableOperation, externalRequestDigest };
export type {
  ExternalOperationKind,
  ExternalOperationPort,
  ExternalOperationRecord,
  ExternalOperationStatus,
} from "../../external-operations.js";
