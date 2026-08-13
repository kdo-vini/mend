import type { GoogleConnection } from "../../api/google-connections";
import type { McpConnection } from "../../api/mcp-connections";
import type { LiveGitHubConnection } from "../../api/live-actions";

export type IntegrationDirectoryStatus =
  | "checking"
  | "connected"
  | "attention"
  | "unconfigured";

export type IntegrationDirectoryStatuses = Record<
  "github" | "google" | "supabase" | "mcp",
  IntegrationDirectoryStatus
>;

export const directoryStatusFor = (
  records: Array<{ status: string }>,
): IntegrationDirectoryStatus =>
  records.some((record) => record.status === "connected")
    ? "connected"
    : records.length
      ? "attention"
      : "unconfigured";

// A rejected settlement means the request itself failed (network error,
// unauthenticated, backend unavailable), not that the integration is known
// to be broken. It is mapped to "attention" rather than "unconfigured"
// because staying silent about a fetch failure risks under-reporting a real
// problem, and there is no retry affordance on this directory card (unlike
// SettingsGithubPage's SettingsError, which does offer one) — "attention"
// is the closest available signal that tells the founder to open the detail
// page and check for themselves instead of trusting a default.
export const resolveIntegrationDirectoryStatuses = ([github, google, mcp]: [
  PromiseSettledResult<LiveGitHubConnection>,
  PromiseSettledResult<GoogleConnection[]>,
  PromiseSettledResult<McpConnection[]>,
]): IntegrationDirectoryStatuses => {
  const mcpConnections = mcp.status === "fulfilled" ? mcp.value : [];
  return {
    github:
      github.status === "rejected"
        ? "attention"
        : github.value.connected
          ? "connected"
          : "unconfigured",
    google:
      google.status === "rejected"
        ? "attention"
        : directoryStatusFor(google.value),
    supabase:
      mcp.status === "rejected"
        ? "attention"
        : directoryStatusFor(
            mcpConnections.filter(
              (connection) => connection.provider === "supabase",
            ),
          ),
    mcp:
      mcp.status === "rejected"
        ? "attention"
        : directoryStatusFor(
            mcpConnections.filter(
              (connection) => connection.provider === "custom",
            ),
          ),
  };
};

export function formatSettingsDate(value?: string | null) {
  if (!value) return "Not verified";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

export function providerLabel(provider: string) {
  return provider === "openai"
    ? "ChatGPT / Codex"
    : provider === "anthropic"
      ? "Claude"
      : provider === "google"
        ? "Gemini"
        : "Verboo";
}
