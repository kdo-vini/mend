import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinanceEntity, FinancePort } from "../../finance-service.js";
import { ApiHttpError } from "../../api-router.js";

export class SupabaseFinanceAdapter implements FinancePort {
  constructor(private readonly client: SupabaseClient) {}
  private checked<T>({
    data,
    error,
  }: {
    data: T;
    error: { code?: string; message: string } | null;
  }): T {
    if (error) {
      const status =
        error.code === "42501"
          ? 403
          : ["23505", "40001"].includes(error.code ?? "")
            ? 409
            : ["23514", "23503", "22023"].includes(error.code ?? "")
              ? 400
              : 503;
      throw new ApiHttpError(
        status,
        status === 409
          ? "finance_conflict"
          : status === 403
            ? "finance_forbidden"
            : status === 400
              ? "finance_invalid_record"
              : "finance_unavailable",
        "Financial request could not be completed.",
      );
    }
    return data;
  }
  async allowed(workspaceId: string) {
    const data = this.checked(
      await this.client
        .from("finance_access")
        .select("user_id")
        .eq("workspace_id", workspaceId),
    );
    return Boolean(data?.length);
  }
  async summary(period: string) {
    return this.checked(
      await this.client.rpc("finance_summary", { p_period: period }),
    );
  }
  async list(entity: FinanceEntity, period?: string, offset = 0) {
    let query = this.client
      .from(`finance_${entity}`)
      .select(
        entity === "references" || entity === "settlements"
          ? "*,entry:finance_entries!inner(description,period)"
          : "*",
      )
      .order("id")
      .range(offset, offset + 49);
    if (period && (entity === "entries" || entity === "reviews"))
      query = query.eq("period", period);
    if (period && entity === "references")
      query = query.eq("entry.period", period);
    if (period && entity === "templates")
      query = query
        .lte("starts_on", period)
        .or(`ends_on.is.null,ends_on.gte.${period}`);
    if (period && entity === "settlements") {
      const end = new Date(`${period}T12:00:00Z`);
      end.setUTCMonth(end.getUTCMonth() + 1);
      query = query
        .gte("paid_on", period)
        .lt("paid_on", end.toISOString().slice(0, 10));
    }
    const rows =
      this.checked(await query.returns<Array<Record<string, unknown>>>()) ?? [];
    return rows.map((row) => {
      const { entry, ...record } = row;
      return entry && typeof entry === "object" && "description" in entry
        ? { ...record, description: entry.description }
        : record;
    });
  }
  async save(
    entity: FinanceEntity,
    record: Record<string, unknown>,
    version: number | null,
  ) {
    return this.checked(
      await this.client.rpc("finance_save", {
        p_entity: entity,
        p_record: record,
        p_expected_version: version,
      }),
    );
  }
  async generate(period: string) {
    return this.checked(
      await this.client.rpc("finance_generate", { p_period: period }),
    ) as number;
  }
  async history(id: string) {
    return (
      this.checked(
        await this.client
          .from("finance_events")
          .select("*")
          .eq("record_id", id)
          .order("id", { ascending: false })
          .limit(100),
      ) ?? []
    );
  }
}
