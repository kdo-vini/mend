# Deploy Mend with Dokploy

Mend is one Docker service: the Node process serves the built React app, the
authenticated API and the durable worker on port `8787`.

## Build

In Dokploy, select:

- Build Type: `Dockerfile`
- Docker File: `Dockerfile` (or leave the default blank)
- Docker Context Path: `.`
- Docker Build Stage: `production` (blank also selects the final stage)

Add these public Docker build arguments:

```text
VITE_SUPABASE_URL=https://uwhugsimhtjtrnuotuki.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<Supabase publishable key>
VITE_MEND_API_URL=
```

Leave `VITE_MEND_API_URL` empty so the browser uses the same public origin as
the Mend container. Never pass service-role, Whatsmiau or OpenAI keys as build
arguments or as `VITE_*` values.

## Runtime

Expose container port `8787`, attach the public domain with HTTPS, and configure
the health check as `GET /api/ready`.

Set these runtime environment variables in Dokploy:

```text
PORT=8787
NODE_ENV=production
SUPABASE_URL=https://uwhugsimhtjtrnuotuki.supabase.co
SUPABASE_PUBLISHABLE_KEY=<Supabase publishable key>
SUPABASE_SERVICE_ROLE_KEY=<Supabase secret/service-role key>
WHATSMIAU_API_KEY=<Whatsmiau API key>
WHATSMIAU_WEBHOOK_SECRET=<same secret configured on the Edge Function>
WHATSMIAU_WEBHOOK_URL=https://uwhugsimhtjtrnuotuki.supabase.co/functions/v1/whats-mend-webhook
APP_BASE_URL=https://<mend-domain>
GOOGLE_CLIENT_ID=<Google OAuth client id>
GOOGLE_CLIENT_SECRET=<Google OAuth client secret>
GOOGLE_OAUTH_REDIRECT_URI=https://<mend-domain>/api/google/connections/oauth/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=<32-byte server secret>
OPENAI_API_KEY=<OpenAI project key>
SUPPORT_AI_MODEL=gpt-5-mini
CODEX_MODEL=gpt-5.6-luna
CODEX_REASONING_EFFORT=xhigh
CODEX_FALLBACK_MODEL=gpt-5
CODEX_MODEL_FALLBACK=1
CODEX_FALLBACK_REASONING_EFFORT=high
CODEX_MAX_TURNS=24
CODEX_MAX_RUNTIME_SECONDS=1200
CODEX_WORKSPACE_ROOT=/workspace/repos
CODEX_GIT_REMOTE=origin
DOKPLOY_API_URL=https://<dokploy-host>/api
DOKPLOY_API_KEY=<Dokploy API key>
DOKPLOY_APPLICATION_ID=<Dokploy application id>
MEND_WORKER_POLL_MS=2000
MEND_DEV_MODE=0
```

Do not set `VITE_MEND_LOCAL_OPERATOR_MODE`, `VITE_MEND_DEMO_MODE` or
`MEND_DEV_MODE=1` in production.

## Repository volume for Codex

Mount a persistent host directory at `/workspace/repos`. Every repository path
configured in Mend must resolve inside that directory. The container runs as
the non-root `node` user, so the mounted directory must be writable by UID/GID
`1000:1000`.

The container includes Git and npm. The release flow is intentionally gated:

1. Codex investigates and produces a diff plus checks.
2. A human approves the result, which creates a local branch and commit.
3. A separate “Publish branch” action pushes that branch to the configured Git
   remote (`origin` by default).
4. A separate “Deploy approved branch” action calls Dokploy only when the
   workspace AI policy allows deployments and all three Dokploy variables are
   configured.

Mend never pushes, merges or deploys as a side effect of triage or Codex
completion. Keep the Dokploy API key as a runtime secret; it is never stored
in Supabase or exposed to the browser.

## Supabase and Whatsmiau

Before routing production traffic:

1. Apply migrations with `supabase db push --linked`.
2. Deploy `whats-mend-webhook` with JWT verification disabled.
3. Set the Edge Function secret `WHATSMIAU_WEBHOOK_SECRET`.
4. Refresh the Whatsmiau connection in Mend so its webhook points to the Edge
   Function and sends `messages.upsert`, `messages.update`, `messages.delete`,
   `messages.set`, `connection.update` and `contacts.upsert`.
5. Send a new inbound WhatsApp message and confirm it appears once in Inbox.

`/api/health` is the liveness probe. `/api/ready` returns `503` until all core
server providers and the Codex workspace mount are present.
