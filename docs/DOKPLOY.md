# Deploy Mend with Dokploy

V1 uses two Dokploy services from the same repository and Dockerfile:

- `mend-control-plane`: public API, React app, GitHub webhooks and publication
  actions. It serves `app.techneia.com.br` on port `8787`.
- `mend-agent-runner`: private worker, no public domain. It consumes durable
  `mend.agent_run_requested` jobs and runs one Agent at a time.

The runner is the only service that receives workspace LLM credentials and
installs the four pinned provider CLIs. The control plane never needs an Agent
CLI or a workspace API key.

## Dokploy setup

Create one Dokploy project named `mend`. Create both applications from the
same GitHub repository and branch:

| Service              | Role                         | Domain                | Port   | Process role |
| -------------------- | ---------------------------- | --------------------- | ------ | ------------ |
| `mend-control-plane` | API + frontend + webhooks    | `app.techneia.com.br` | `8787` | `control`    |
| `mend-agent-runner`  | durable private Agent worker | none                  | `8787` | `runner`     |

For both services use Dockerfile build settings. Select `production` for the
control plane and `runner` for the Agent worker:

```text
Build Type: Dockerfile
Dockerfile: Dockerfile
Context: .
Stage: production (control) / runner (worker)
Branch: main
```

Only the control plane needs the public domain and health check:

```text
GET /api/ready
```

The runner should use the same internal port but remain private on the
Dokploy network. Mount a writable temporary volume at `/workspace/runs` on the
runner. The image runs as the non-root `node` user.

## Build arguments

Set these on both services. Leave `VITE_MEND_API_URL` empty so the browser uses
the public origin:

```text
VITE_SUPABASE_URL=https://uwhugsimhtjtrnuotuki.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<Supabase publishable key>
VITE_MEND_API_URL=
```

Never pass service-role, Whatsmiau, GitHub private keys or BYOK values as
Docker build arguments or `VITE_*` variables.

## Control-plane environment

```text
NODE_ENV=production
PORT=8787
MEND_PROCESS_ROLE=control
SUPABASE_URL=https://uwhugsimhtjtrnuotuki.supabase.co
SUPABASE_PUBLISHABLE_KEY=<Supabase publishable key>
SUPABASE_SERVICE_ROLE_KEY=<Supabase service-role key>
WHATSMIAU_API_KEY=<Whatsmiau API key>
WHATSMIAU_WEBHOOK_SECRET=<webhook secret>
WHATSMIAU_WEBHOOK_URL=https://uwhugsimhtjtrnuotuki.supabase.co/functions/v1/whats-mend-webhook
APP_BASE_URL=https://app.techneia.com.br
GOOGLE_CLIENT_ID=<Google OAuth client id>
GOOGLE_CLIENT_SECRET=<Google OAuth client secret>
GOOGLE_OAUTH_REDIRECT_URI=https://app.techneia.com.br/api/google/connections/oauth/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=<server secret>
MEND_GITHUB_APP_ID=<GitHub App id>
MEND_GITHUB_APP_SLUG=<GitHub App slug>
MEND_GITHUB_APP_PRIVATE_KEY_BASE64=<GitHub App private key>
MEND_GITHUB_SETUP_STATE_SECRET=<setup state secret>
MEND_GITHUB_WEBHOOK_SECRET=<GitHub webhook secret>
MEND_GITHUB_API_URL=https://api.github.com
MEND_AGENT_CREDENTIAL_ENCRYPTION_KEY=<same server secret used by the runner>
MEND_AGENT_MAX_RUNTIME_SECONDS=1200
MEND_AGENT_MAX_CONCURRENCY=1
MEND_GITHUB_ACTIONS_ENABLED=0
MEND_WORKER_POLL_MS=2000
MEND_DEV_MODE=0
```

## Runner environment

Use the same Supabase, Whatsmiau and GitHub App values as the control plane,
then add the runner-only settings:

```text
NODE_ENV=production
PORT=8787
MEND_PROCESS_ROLE=runner
MEND_AGENT_WORKSPACE_ROOT=/workspace/runs
MEND_AGENT_CREDENTIAL_ENCRYPTION_KEY=<same server secret used by the control plane>
MEND_AGENT_MAX_RUNTIME_SECONDS=1200
MEND_AGENT_MAX_CONCURRENCY=1
MEND_GITHUB_ACTIONS_ENABLED=0
MEND_WORKER_POLL_MS=1000
```

Do not configure `OPENAI_API_KEY` as a global production dependency. Workspace
credentials are stored encrypted in Supabase and are decrypted only in the
runner process immediately before the child Agent starts. They are not logged,
returned to the browser, or persisted in run events.

## Runtime flow

1. The control plane creates an `agent_run` with status `queued` and persists a
   durable job.
2. The private runner claims the job and downloads the selected GitHub branch
   into `/workspace/runs/<run-id>`.
3. The Agent investigates or patches the isolated checkout and runs the
   configured independent checks.
4. The runner persists the structured result, removes the checkout, and marks
   the run complete.
5. A human approval enables GitHub App branch publication and draft PR creation.

The GitHub App remains the control plane for base SHA, branch, checks and PR.
GitHub Actions is represented in the executor contract but is disabled in V1.

## Supabase

Apply migrations before routing production traffic:

```text
supabase db push --linked
supabase gen types typescript --linked
```

The migration creates the service-role-only `workspace_agent_credentials`
table, renames run tables to `agent_runs`/`agent_run_events`, removes
repository local paths, and updates the durable bug-loop RPC.

## Verification

After deploy, verify:

```text
https://app.techneia.com.br/api/health
https://app.techneia.com.br/api/ready
```

Then connect GitHub to a workspace, save an Agent provider credential, start a
run from an issue, and confirm the run returns `queued` while the runner
continues with the computer offline.
