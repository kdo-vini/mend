import { SupabaseBugLoopStore } from "../../bug-loop.js";
import { InboxService, SupabaseInboxPort } from "../../inbox-service.js";
import {
  type IssueCommentInput,
  type IssueCreateInput,
  type IssueEvidenceInput,
  type IssueLinkMessageInput,
  type IssueListQuery,
  type IssuePatchInput,
  type IssuePort,
  type IssueRequestContext,
  type ResolveAndNotifyInput,
} from "../../issue-service.js";
import { SupabaseMediaStorage } from "../../media.js";
import type { AnySupabaseClient } from "./types.js";
import {
  WhatsAppService,
  type WhatsAppProvider,
} from "../../whatsapp-service.js";
import {
  checked,
  issue,
  issueDbPayload,
  row,
  rows,
  rpcRow,
  str,
  type DbResult,
  type Row,
} from "../supabase-mappers.js";
export class SupabaseIssueAdapter implements IssuePort {
  private readonly inbox: InboxService;
  private readonly whatsapp: WhatsAppService;
  private readonly bugLoop: SupabaseBugLoopStore;

  constructor(
    private readonly client: AnySupabaseClient,
    provider: WhatsAppProvider,
    mediaStorage?: SupabaseMediaStorage,
    private readonly privilegedClient: AnySupabaseClient = client,
  ) {
    this.inbox = new InboxService(
      new SupabaseInboxPort(client),
      mediaStorage ? { mediaStorage } : {},
    );
    this.whatsapp = new WhatsAppService(this.inbox, provider, mediaStorage);
    this.bugLoop = new SupabaseBugLoopStore(privilegedClient as never);
  }

  private async getRow(context: IssueRequestContext, identifier: string) {
    const result = await this.client
      .from("issues")
      .select("*")
      .eq("workspace_id", context.workspaceId)
      .eq("identifier", identifier)
      .maybeSingle();
    const data = checked("issues.get", result);
    return data ? row(data) : null;
  }

  private async details(context: IssueRequestContext, issueRow: Row) {
    const issueId = str(issueRow.id);
    const [labels, comments, evidence, timeline] = await Promise.all([
      this.client
        .from("issue_labels")
        .select("label:labels(id, name, color)")
        .eq("issue_id", issueId),
      this.client
        .from("issue_comments")
        .select("*")
        .eq("issue_id", issueId)
        .eq("workspace_id", context.workspaceId)
        .order("created_at", { ascending: true }),
      this.client
        .from("evidence")
        .select("*")
        .eq("issue_id", issueId)
        .eq("workspace_id", context.workspaceId)
        .order("created_at", { ascending: true }),
      this.client
        .from("timeline_events")
        .select("*")
        .eq("entity_type", "issue")
        .eq("entity_id", issueId)
        .eq("workspace_id", context.workspaceId)
        .order("created_at", { ascending: true }),
    ]);
    const data = [labels, comments, evidence, timeline] as DbResult[];
    ["issue_labels", "issue_comments", "evidence", "timeline_events"].forEach(
      (scope, index) => checked(scope, data[index]),
    );
    return {
      ...issueRow,
      labels: rows(labels.data).map((item) => row(item.label)),
      comments: rows(comments.data),
      evidence: rows(evidence.data),
      timeline: rows(timeline.data),
    };
  }

  async list(context: IssueRequestContext, query: IssueListQuery) {
    const value = query as unknown as Row;
    let request = this.client
      .from("issues")
      .select("*")
      .eq("workspace_id", context.workspaceId);
    if (value.status) request = request.eq("status", value.status);
    if (value.priority) request = request.eq("priority", value.priority);
    if (value.assignedUserId)
      request = request.eq("assigned_user_id", value.assignedUserId);
    if (value.search) request = request.ilike("title", `%${value.search}%`);
    if (value.type) request = request.eq("type", value.type);
    if (value.source) request = request.eq("source", value.source);
    if (value.contactId) request = request.eq("contact_id", value.contactId);
    if (value.conversationId)
      request = request.eq("conversation_id", value.conversationId);

    // Labels and Agent runs are normalized relations, not denormalized issue
    // columns. Resolve their scoped issue ids before applying the main query.
    let relationIssueIds: string[] | undefined;
    if (value.label) {
      const labelResult = await this.client
        .from("labels")
        .select("id")
        .eq("workspace_id", context.workspaceId)
        .eq("name", value.label)
        .maybeSingle();
      const labelRow = checked("labels.filter", labelResult);
      if (!labelRow) return [];
      const issueLabels = await this.client
        .from("issue_labels")
        .select("issue_id")
        .eq("label_id", str(row(labelRow).id));
      relationIssueIds = rows(checked("issue_labels.filter", issueLabels))
        .map((item) => str(item.issue_id))
        .filter(Boolean);
    }
    if (value.hasAgent !== undefined) {
      const runs = await this.client
        .from("agent_runs")
        .select("issue_id")
        .eq("workspace_id", context.workspaceId);
      const runIds = new Set(
        rows(checked("agent_runs.filter", runs))
          .map((item) => str(item.issue_id))
          .filter(Boolean),
      );
      if (value.hasAgent === true)
        relationIssueIds = relationIssueIds
          ? relationIssueIds.filter((id) => runIds.has(id))
          : [...runIds];
      else {
        const allIssues = await this.client
          .from("issues")
          .select("id")
          .eq("workspace_id", context.workspaceId);
        const allIds = rows(checked("issues.filter_all", allIssues))
          .map((item) => str(item.id))
          .filter(Boolean);
        const withoutAgent = allIds.filter((id) => !runIds.has(id));
        relationIssueIds = relationIssueIds
          ? relationIssueIds.filter((id) => withoutAgent.includes(id))
          : withoutAgent;
      }
    }
    if (relationIssueIds !== undefined) {
      if (!relationIssueIds.length) return [];
      request = request.in("id", relationIssueIds);
    }
    if (value.cursor) request = request.gt("id", value.cursor);
    const result = await request
      .order("created_at", { ascending: false })
      .limit(Number(value.limit ?? 50));
    return rows(checked("issues.list", result)).map(issue);
  }

  async create(context: IssueRequestContext, input: IssueCreateInput) {
    const claimed = await this.privilegedClient.rpc("claim_issue_number", {
      target_workspace_id: context.workspaceId,
    });
    const identifierValue = checked("claim_issue_number", claimed);
    const identifier =
      typeof identifierValue === "string"
        ? identifierValue
        : str(rpcRow(identifierValue).identifier);
    const number = Number(identifier.split("-").at(-1));
    if (!Number.isSafeInteger(number) || number < 1)
      throw new Error("supabase_invalid_issue_identifier");
    const result = await this.client
      .from("issues")
      .insert({
        ...issueDbPayload(input),
        workspace_id: context.workspaceId,
        number,
        identifier,
        created_by: "user",
        created_by_user_id: context.userId,
      })
      .select("*")
      .single();
    const created = row(checked("issues.create", result));
    await this.syncLabels(
      context,
      str(created.id),
      (input as unknown as Row).labels as string[] | undefined,
    );
    return issue(await this.details(context, created));
  }

  async get(context: IssueRequestContext, identifier: string) {
    const value = await this.getRow(context, identifier);
    return value ? issue(await this.details(context, value)) : null;
  }

  async update(
    context: IssueRequestContext,
    identifier: string,
    input: IssuePatchInput,
  ) {
    const current = await this.getRow(context, identifier);
    if (!current) return null;
    const now = new Date().toISOString();
    const status = (input as unknown as Row).status;
    const result = await this.client
      .from("issues")
      .update({
        ...issueDbPayload(input),
        ...(status !== undefined
          ? { completed_at: status === "done" ? now : null }
          : {}),
        updated_at: now,
      })
      .eq("id", current.id)
      .eq("workspace_id", context.workspaceId)
      .select("*")
      .maybeSingle();
    const updated = checked("issues.update", result);
    if (!updated) return null;
    const labels = (input as unknown as Row).labels;
    if (labels !== undefined)
      await this.syncLabels(context, str(current.id), labels as string[]);
    return issue(await this.details(context, row(updated)));
  }

  async remove(context: IssueRequestContext, identifier: string) {
    const current = await this.getRow(context, identifier);
    if (!current) return false;
    const result = await this.client
      .from("issues")
      .delete()
      .eq("id", current.id)
      .eq("workspace_id", context.workspaceId)
      .select("id");
    return rows(checked("issues.delete", result)).length > 0;
  }

  private async syncLabels(
    context: IssueRequestContext,
    issueId: string,
    names?: string[],
  ) {
    if (names === undefined) return;
    const normalized = [
      ...new Set(names.map((value) => value.trim()).filter(Boolean)),
    ];
    const existing = await this.client
      .from("labels")
      .select("id, name")
      .eq("workspace_id", context.workspaceId);
    const existingRows = rows(checked("labels.list", existing));
    const ids: string[] = [];
    for (const name of normalized) {
      const found = existingRows.find((value) => str(value.name) === name);
      if (found) ids.push(str(found.id));
      else {
        const created = await this.client
          .from("labels")
          .insert({ workspace_id: context.workspaceId, name })
          .select("id")
          .single();
        ids.push(str(row(checked("labels.create", created)).id));
      }
    }
    checked(
      "issue_labels.clear",
      await this.client.from("issue_labels").delete().eq("issue_id", issueId),
    );
    if (ids.length)
      checked(
        "issue_labels.create",
        await this.client
          .from("issue_labels")
          .insert(
            ids.map((labelId) => ({ issue_id: issueId, label_id: labelId })),
          ),
      );
  }

  async addComment(
    context: IssueRequestContext,
    identifier: string,
    input: IssueCommentInput,
  ) {
    const current = await this.getRow(context, identifier);
    if (!current) return null;
    const result = await this.client
      .from("issue_comments")
      .insert({
        workspace_id: context.workspaceId,
        issue_id: current.id,
        author_user_id: context.userId,
        author_type: "user",
        body: input.body,
      })
      .select("*")
      .single();
    return row(checked("issue_comments.create", result));
  }

  async addEvidence(
    context: IssueRequestContext,
    identifier: string,
    input: IssueEvidenceInput,
  ) {
    const current = await this.getRow(context, identifier);
    if (!current) return null;
    return {
      ...(await this.inbox.addEvidence(
        {
          workspaceId: context.workspaceId,
          actorUserId: context.userId,
          actorType: "user",
        },
        str(current.id),
        {
          kind: input.kind,
          label: input.label,
          body: input.body,
          messageId: input.messageId,
          storagePath: input.storagePath,
          mimeType: input.mimeType,
          sizeBytes: input.size,
        },
      )),
      identifier,
    };
  }

  async linkMessage(
    context: IssueRequestContext,
    identifier: string,
    input: IssueLinkMessageInput,
  ) {
    const current = await this.getRow(context, identifier);
    if (!current) return null;
    return {
      ...(await this.inbox.linkIssueMessage(
        { workspaceId: context.workspaceId, actorUserId: context.userId },
        str(current.id),
        input.messageId,
      )),
      identifier,
    };
  }

  async resolveAndNotify(
    context: IssueRequestContext,
    identifier: string,
    input: ResolveAndNotifyInput,
  ) {
    const current = await this.getRow(context, identifier);
    if (!current) return null;
    // A confirmed bug that went through the fix/deploy path must not be
    // reported as resolved until the release has a successful health
    // checkpoint.  This guard runs before WhatsApp side effects, so a retry
    // cannot accidentally tell a customer that an unhealthy deployment is
    // fixed.  Non-bug/notify cases intentionally remain resolvable without a
    // deployment health check.
    const bugCase = await this.privilegedClient
      .from("bug_cases")
      .select("id, stage, decision, health_status, customer_response_status")
      .eq("workspace_id", context.workspaceId)
      .eq("issue_id", current.id)
      .maybeSingle();
    const bugCaseData = checked("bug_cases.resolve_gate", bugCase);
    const bugCaseState = bugCaseData ? row(bugCaseData) : undefined;
    const bugCaseStage = bugCaseState ? str(bugCaseState.stage) : "";
    if (
      bugCaseData &&
      ["autofix", "manual_fix"].includes(str(bugCaseState?.decision)) &&
      str(bugCaseState?.customer_response_status) !== "sent" &&
      str(bugCaseState?.health_status) !== "healthy"
    ) {
      throw new Error(
        `bug_loop_health_required:${bugCaseStage}:${str(bugCaseState?.health_status)}`,
      );
    }
    if (
      bugCaseData &&
      !["decision", "customer_response", "completed"].includes(bugCaseStage)
    ) {
      throw new Error(
        `bug_loop_not_ready_for_customer_response:${bugCaseStage}`,
      );
    }
    let notifiedAt: string | undefined =
      typeof current.customer_notified_at === "string"
        ? current.customer_notified_at
        : undefined;
    if (
      input.notifyCustomer &&
      input.message &&
      current.conversation_id &&
      !notifiedAt
    ) {
      await this.whatsapp.sendText(
        {
          workspaceId: context.workspaceId,
          actorUserId: context.userId,
          actorType: "user",
        },
        str(current.conversation_id),
        {
          text: input.message,
          idempotencyKey: `mend:customer-response:${current.id}`,
        },
      );
      notifiedAt = new Date().toISOString();
    }
    const result = await this.client
      .from("issues")
      .update({
        status: "done",
        resolved_at: new Date().toISOString(),
        ...(notifiedAt ? { customer_notified_at: notifiedAt } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.id)
      .eq("workspace_id", context.workspaceId)
      .select("*")
      .maybeSingle();
    checked("issues.resolve", result);
    checked(
      "timeline_events.issue_resolved",
      await this.client.from("timeline_events").upsert(
        {
          workspace_id: context.workspaceId,
          entity_type: "issue",
          entity_id: current.id,
          event_type: "issue.resolved",
          actor_type: "user",
          actor_user_id: context.userId,
          metadata_json: { customerNotified: Boolean(notifiedAt) },
          dedupe_key: `issue:${current.id}:resolved:${context.userId}`,
        },
        { onConflict: "workspace_id,dedupe_key", ignoreDuplicates: true },
      ),
    );
    if (bugCaseData && bugCaseStage !== "completed") {
      const bugCaseId = str(bugCaseState?.id);
      const customerResponseStatus = notifiedAt ? "sent" : "skipped";
      await this.bugLoop.advance({
        workspaceId: context.workspaceId,
        bugCaseId,
        stage: "customer_response",
        eventType: "customer.response_completed",
        message: notifiedAt
          ? "The customer was notified after the fix was released."
          : "The issue was resolved without sending a customer message.",
        idempotencyKey: `customer-response:${current.id}`,
        customerResponseStatus,
        metadata: { issueId: str(current.id), notifiedAt: notifiedAt ?? null },
      });
      await this.bugLoop.advance({
        workspaceId: context.workspaceId,
        bugCaseId,
        stage: "completed",
        status: "completed",
        eventType: "bug_loop.completed",
        message: "The complaint-to-resolution loop is complete.",
        idempotencyKey: `completed:${current.id}`,
        customerResponseStatus,
        metadata: { issueId: str(current.id) },
      });
    }
    return result.data
      ? issue(await this.details(context, row(result.data)))
      : null;
  }
}
