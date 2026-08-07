# Coding agents and GitHub control plane

Mend treats a coding CLI as an untrusted executor and GitHub as the publication control plane. The executor can inspect or edit only a disposable repository copy. It never receives a GitHub installation token and cannot publish, merge, deploy, or reply to a customer.

The disposable copy is a process/filesystem boundary, not a kernel sandbox:
agent-edited package scripts still execute as the runner account. Production
deployments must run this worker under a dedicated low-privilege account or an
OS/container sandbox with no control-plane credentials. The application-level
environment allowlist is defense in depth, not a substitute for isolation.

## Internal CLI registry

`server/coding-agent-cli.ts` exposes a provider-neutral registry. Workspace
configuration selects ChatGPT, Claude, Gemini, or Verboo plus an optional model
name. The execution plane is selected separately and is `dokploy` in V1;
`github_actions` is reserved for the later workflow adapter.

| Adapter | Non-interactive output                   | Read-only policy               | Fix policy                      | Session                               |
| ------- | ---------------------------------------- | ------------------------------ | ------------------------------- | ------------------------------------- |
| ChatGPT | JSONL plus schema-validated last message | native read-only mode          | native workspace-write mode     | ephemeral                             |
| Claude  | JSON with `structured_output`            | plan mode, Read/Glob/Grep only | edits allowed, no Bash tool     | not persisted                         |
| Gemini  | JSON envelope                            | sandbox plus plan approval     | sandbox plus auto-edit approval | CLI does not expose a no-persist flag |
| Verboo  | JSON with `structured_output`            | plan mode, Read/Glob/Grep only | edits allowed, no Bash tool     | not persisted                         |

Prompts go through stdin and never become command-line arguments. The child process uses `shell: false`, has a bounded output buffer, a timeout and cancellation, and receives only OS/runtime variables plus the selected inference provider's authentication. GitHub tokens, Supabase secrets and application credentials are omitted. On Windows the registry resolves the known native executable or JavaScript entrypoint instead of invoking `.cmd`, `.bat`, or PowerShell shims.

Every provider must return the same report:

```ts
{
  verdict: "confirmed" | "not_reproduced" | "needs_human";
  summary: string;
  rootCause?: string;
  recommendedAction: "notify_only" | "propose_fix" | "fix";
  evidence: Array<{
    kind: "complaint" | "log" | "trace" | "reproduction" | "code" | "test";
    label: string;
    detail?: string;
  }>;
}
```

`CodingAgentCli.run()` returns this report with the captured patch and independently executed `lint`, `test`, or `build` checks. The source repository remains untouched and the temporary workspace is removed before the call returns.

Approval and publication serialize mutations to a checkout with both an
in-process queue and a short-lived filesystem lease, so two worker replicas do
not switch the same checkout concurrently. Higher-throughput deployments
should still use one checkout/worktree per run. Publication persists an intent
before the first GitHub mutation and reconciles an existing branch/PR after a
crash. The run also persists the GitHub base SHA observed at investigation
start, so GitHub rejects publication when the default branch changed meanwhile.

The child process receives a per-run home/config directory inside the disposable
workspace, so provider login files are not read from the host account. The
runner resolves the selected workspace/provider credential immediately before
the run, injects it only into the child process, and removes the workspace
afterward. Never place GitHub, Supabase, or application control-plane
credentials in that environment.

## GitHub App setup

Register a GitHub App with a setup URL that returns to Mend. Configure:

```dotenv
MEND_GITHUB_APP_ID=
MEND_GITHUB_APP_SLUG=
MEND_GITHUB_APP_PRIVATE_KEY_BASE64=
MEND_GITHUB_WEBHOOK_SECRET=
MEND_GITHUB_SETUP_STATE_SECRET=
MEND_GITHUB_API_VERSION=2026-03-10
```

Recommended repository permissions are Metadata read, Contents write, Pull requests write, Checks write, Commit statuses write, and only when enabled by the product policy, Actions write and Deployments write. Subscribe only to installation, installation repositories, pull request, check run, workflow run, and deployment status events that the product consumes.

Release calls carry a stable `Idempotency-Key` (`mend:deploy:<run>:<commit>`)
and the requested branch/commit in the Dokploy payload. The provider must honor
that key and expose a readiness/health signal before the run is considered
healthy; a trigger response alone is not proof that the requested commit is
serving traffic.

The setup route `POST /api/repositories/:id/github/setup`:

1. Call `createGitHubSetupState({ workspaceId, userId, repositoryId }, secret)`.
2. Persist `hashGitHubSetupState(state)` or the returned nonce as unused until expiry.
3. Redirect to `githubInstallationUrl(slug, state)`.

The unauthenticated callback route `GET /api/github/setup/callback` calls `validateGitHubSetupCallback(query, secret)`, atomically consumes the persisted state, verifies that the configured repository is available to the installation, then persists its installation id. The HMAC proves integrity and expiry; atomic consumption prevents replay. The setup flow never accepts an installation id from the product form.

Webhook routes must capture the raw request body and call `verifyGitHubWebhookSignature()` before parsing JSON or queueing work.

## Publication contract

`GitHubControlPlane.publishBranch()` creates blobs, a tree, a commit and a new branch through the Git Data API. It accepts bounded file content, rejects sensitive/traversal paths and refuses stale publication when `expectedBaseSha` no longer matches the base branch:

```ts
const published = await github.publishBranch(repository, {
  base: "main",
  branch: "mend/bug-123",
  expectedBaseSha,
  message: "fix: handle missing checkout state",
  files: [
    { path: "src/checkout.ts", status: "modified", content: fixedSource },
    { path: "src/obsolete.ts", status: "deleted" },
  ],
});

const pullRequest = await github.createDraftPullRequest(repository, {
  title: "Fix missing checkout state",
  body: reviewBody,
  head: published.branch,
  base: "main",
});
```

When the approved patch has already been applied to the controlled local branch, call `collectGitHubPublishFiles(repositoryRoot, diff.files)` to produce the `files` input without exposing the GitHub token to Git or the agent.

The control plane mints a one-hour installation token only when an operation starts and downscopes it to one repository and the permissions required by that operation. The token is used only in HTTPS authorization headers. It is never placed in argv, a remote URL, persisted run output, or the coding-agent environment.

The remaining primitives cover workflow dispatch with an opaque run id, check creation/update, pull request update, commit status, guarded merge with an expected head SHA, deployment/status, and an HTTPS health probe restricted to server-configured origins. `MEND_DEPLOYMENT_HEALTH_URL` selects the credential-free endpoint and `MEND_HEALTHCHECK_ALLOWED_ORIGINS` is a comma-separated SSRF allowlist. Product policy and human approval remain above these primitives.

Current platform references: [GitHub App installation tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app), [GitHub REST API versions](https://docs.github.com/en/rest/about-the-rest-api/api-versions), [Claude Code CLI reference](https://docs.anthropic.com/en/docs/claude-code/cli-usage), and [Gemini CLI reference](https://geminicli.com/docs/cli/cli-reference/).
