import {
  SupabaseMembershipAdapter,
  SupabaseWorkspaceAdapter,
} from "./adapters/supabase/access.js";
import { SupabaseCodingControlPlaneAdapter } from "./adapters/supabase/coding-control-plane.js";
import {
  SupabaseCodexRunStore,
  SupabaseCodingRunAdapter,
} from "./adapters/supabase/coding-runs.js";
import { SupabaseAgentCredentialAdapter } from "./adapters/supabase/credentials.js";
import { SupabaseGoogleConnectionAdapter } from "./adapters/supabase/google.js";
import { SupabaseImpactAdapter } from "./adapters/supabase/impact.js";
import { SupabaseIssueAdapter } from "./adapters/supabase/issues.js";
import { SupabaseKnowledgeAdapter } from "./adapters/supabase/knowledge.js";
import { SupabaseMcpConnectionAdapter } from "./adapters/supabase/mcp.js";
import {
  SupabaseChannelAdapter,
  SupabaseConversationAdapter,
} from "./adapters/supabase/messaging.js";
import {
  SupabaseKanbanAdapter,
  SupabasePersonalPlanningAdapter,
} from "./adapters/supabase/planning.js";
import {
  SupabaseGitHubConnectionAdapter,
  SupabaseRepositoryAdapter,
} from "./adapters/supabase/repositories.js";
import type {
  AnySupabaseClient,
  WhatsmiauProviderPort,
} from "./adapters/supabase/types.js";
import { CodexService } from "./codex-service.js";
import {
  cancelSubscriptionLogin,
  pollSubscriptionLogin,
  startSubscriptionLogin,
} from "./coding-agent-auth.js";
import {
  catalogProviderFor,
  type CodingCatalogProvider,
} from "./coding-agent-catalog.js";
import {
  type AgentCredentialPort,
  type ChannelPort,
  type CodingControlPlanePort,
  type CodingRunPort,
  type ConversationPort,
  type GitHubConnectionPort,
  type ImpactPort,
  type MediaPort,
  type MembershipAdapter,
  type RepositoryPort,
  type WorkspacePort,
} from "./contracts/api-ports.js";
import { type GoogleConnectionPort } from "./google-calendar.js";
import { type IssuePort } from "./issue-service.js";
import type { JobStore } from "./jobs.js";
import {
  type KanbanIssuePort,
  type PersonalPlanningPort,
} from "./kanban-service.js";
import { type KnowledgePort } from "./knowledge-service.js";
import { type McpConnectionPort } from "./mcp.js";
import { SupabaseMediaPipeline } from "./media-pipeline.js";
import { SupabaseMediaStorage } from "./media.js";
import { type SupportAiProvider } from "./providers.js";
import {
  createServerSupabaseClient,
  type MendServerSupabaseClient,
} from "./supabase.js";
import { WhatsmiauMessagingProvider } from "./whatsmiau.js";
import type { WhatsmiauMessageJobPayload } from "./worker.js";
export { SupabaseExternalOperationAdapter } from "./adapters/supabase/external-operations.js";
export { SupabaseImpactAdapter } from "./adapters/supabase/impact.js";
export { SupabaseKnowledgeAdapter } from "./adapters/supabase/knowledge.js";

export interface SupabaseApiAdapterOptions {
  /** Inject an auth-scoped client in request handling; otherwise use the server client factory. */
  client?: AnySupabaseClient | null;
  /** Trusted server client used only for backend-only RPCs such as issue-number allocation. */
  privilegedClient?: AnySupabaseClient | null;
  /** Service-role client reserved for Auth invitation delivery and member e-mail lookups. */
  invitationClient?: AnySupabaseClient | null;
  /** Convenience for request-scoped RLS clients when the caller does not inject one. */
  accessToken?: string;
  whatsMiau?: WhatsmiauProviderPort;
  aiProvider?: SupportAiProvider;
  codexService?: CodexService;
  jobStore?: JobStore<WhatsmiauMessageJobPayload>;
  codingCatalogProvider?: CodingCatalogProvider;
  subscriptionLogin?: {
    start: typeof startSubscriptionLogin;
    poll: typeof pollSubscriptionLogin;
    cancel: typeof cancelSubscriptionLogin;
  };
}

export type SupabaseApiPortDependencies = {
  membership: MembershipAdapter;
  workspaces: WorkspacePort;
  channels: ChannelPort;
  conversations: ConversationPort;
  issues: IssuePort;
  knowledge: KnowledgePort;
  repositories: RepositoryPort;
  agentCredentials: AgentCredentialPort;
  codingControlPlane: CodingControlPlanePort;
  githubConnections: GitHubConnectionPort;
  codingRuns: CodingRunPort;
  googleConnections: GoogleConnectionPort;
  mcpConnections: McpConnectionPort;
  impact: ImpactPort;
  media: MediaPort;
  kanban: KanbanIssuePort;
  personalPlanning: PersonalPlanningPort;
};

function requireClient(
  value: AnySupabaseClient | null | undefined,
): AnySupabaseClient {
  if (!value) throw new Error("supabase_server_not_configured");
  return value;
}

export function createSupabaseApiAdapters(
  options: SupabaseApiAdapterOptions = {},
): SupabaseApiPortDependencies {
  const client = requireClient(
    options.client ?? createServerSupabaseClient(options.accessToken),
  );
  const privilegedClient = options.privilegedClient ?? client;
  const workspacePrivilegedClient = options.invitationClient ?? null;
  const provider =
    options.whatsMiau ??
    (new WhatsmiauMessagingProvider() as WhatsmiauProviderPort);
  const ai = options.aiProvider;
  const membership = new SupabaseMembershipAdapter(client);
  const workspaces = new SupabaseWorkspaceAdapter(
    client,
    workspacePrivilegedClient,
  );
  const channels = new SupabaseChannelAdapter(client, provider);
  const mediaStorage = new SupabaseMediaStorage(client);
  const media = new SupabaseMediaPipeline(
    client,
    options.jobStore as unknown as import("./media-pipeline.js").MediaJobEnqueuer,
  );
  const agentCredentials = new SupabaseAgentCredentialAdapter(privilegedClient);
  const codingControlPlane = new SupabaseCodingControlPlaneAdapter(
    privilegedClient,
    options.codingCatalogProvider
      ? () => options.codingCatalogProvider as CodingCatalogProvider
      : catalogProviderFor,
    options.subscriptionLogin,
  );
  const conversations = new SupabaseConversationAdapter(
    client,
    provider,
    ai,
    mediaStorage,
    media,
    agentCredentials,
    privilegedClient,
  );
  const issues = new SupabaseIssueAdapter(
    client,
    provider,
    mediaStorage,
    privilegedClient,
  );
  const kanban = new SupabaseKanbanAdapter(client, issues);
  const personalPlanning = new SupabasePersonalPlanningAdapter(client);
  const knowledge = new SupabaseKnowledgeAdapter(
    client,
    privilegedClient,
    agentCredentials,
  );
  const impact = new SupabaseImpactAdapter(client);
  const repositories = new SupabaseRepositoryAdapter(client);
  const githubConnections = new SupabaseGitHubConnectionAdapter(
    client,
    privilegedClient,
  );
  const store = new SupabaseCodexRunStore(client, privilegedClient);
  const codingRuns = new SupabaseCodingRunAdapter(
    client,
    repositories,
    store,
    options.codexService,
    privilegedClient,
    options.jobStore,
    codingControlPlane,
  );
  const googleConnections = new SupabaseGoogleConnectionAdapter(
    client,
    privilegedClient,
  );
  const mcpConnections = new SupabaseMcpConnectionAdapter(
    client,
    privilegedClient,
  );
  return {
    membership,
    workspaces,
    channels,
    conversations,
    issues,
    knowledge,
    impact,
    repositories,
    agentCredentials,
    codingControlPlane,
    githubConnections,
    codingRuns,
    googleConnections,
    mcpConnections,
    media,
    kanban,
    personalPlanning,
  };
}

export {
  SupabaseMembershipAdapter,
  SupabaseWorkspaceAdapter,
} from "./adapters/supabase/access.js";
export { SupabaseCodingControlPlaneAdapter } from "./adapters/supabase/coding-control-plane.js";
export {
  SupabaseCodexRunStore,
  SupabaseCodingRunAdapter,
} from "./adapters/supabase/coding-runs.js";
export { SupabaseAgentCredentialAdapter } from "./adapters/supabase/credentials.js";
export { SupabaseGoogleConnectionAdapter } from "./adapters/supabase/google.js";
export { SupabaseIssueAdapter } from "./adapters/supabase/issues.js";
export { SupabaseMcpConnectionAdapter } from "./adapters/supabase/mcp.js";
export {
  SupabaseChannelAdapter,
  SupabaseConversationAdapter,
} from "./adapters/supabase/messaging.js";
export {
  SupabaseKanbanAdapter,
  SupabasePersonalPlanningAdapter,
} from "./adapters/supabase/planning.js";
export {
  SupabaseGitHubConnectionAdapter,
  SupabaseRepositoryAdapter,
} from "./adapters/supabase/repositories.js";
export type { MendServerSupabaseClient };
export type { WhatsmiauProviderPort } from "./adapters/supabase/types.js";
