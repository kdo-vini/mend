import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImpactPort, RequestContext } from "../../contracts/api-ports.js";
import { computeImpactSummary, runnerIsReady } from "../../impact.js";
import { checked, rows, str } from "../supabase-mappers.js";

export class SupabaseImpactAdapter implements ImpactPort {
  constructor(private readonly client: SupabaseClient) {}

  async summary(context: RequestContext, period: { from: string; to: string }) {
    const result = await this.client
      .from("workflow_facts")
      .select("workflow_id, fact_type, value_boolean, value_numeric")
      .eq("workspace_id", context.workspaceId)
      .gte("occurred_at", period.from)
      .lte("occurred_at", period.to);
    const values = rows(checked("workflow_facts.summary", result)).map(
      (value) => ({
        workflowId: str(value.workflow_id),
        factType: str(value.fact_type),
        valueBoolean:
          typeof value.value_boolean === "boolean" ? value.value_boolean : null,
        valueNumeric:
          typeof value.value_numeric === "number"
            ? value.value_numeric
            : value.value_numeric == null
              ? null
              : Number(value.value_numeric),
      }),
    );
    return computeImpactSummary(values, period);
  }
}

export { computeImpactSummary, runnerIsReady };
export type {
  ImpactPeriod,
  RunnerHeartbeat,
  WorkflowFactValue,
} from "../../impact.js";
