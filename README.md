# Mend

Mend is an AI-first WhatsApp support and engineering workspace. Operators receive live conversations, answer customers, turn support context into native issues, ground AI drafts with reviewed knowledge, and run a constrained local Codex workflow without pushing, merging, deploying, or exposing secrets.

OpenAI is the first provider. The support-AI boundary is provider-shaped so another enterprise model can be added without changing the Inbox or issue workflow.

## Requirements

- Node.js 20+
- npm 10+
- Supabase CLI (authenticated and linked for remote operations)
- Docker Desktop only when running the local Supabase stack/reset
- A Whatsmiau account and WhatsApp Business number for live messaging

## Local setup

```powershell
Copy-Item .env.example .env
npm install
```

Fill the non-`VITE_*` secrets in `.env`. Provider keys, webhook secrets and the Supabase service-role key are server-only.

Start the API/worker and UI in separate terminals:

```powershell
npm run server
```

```powershell
npm run dev
```

Open `http://localhost:5173/inbox`. Check the API with `Invoke-WebRequest http://localhost:8787/api/health`.

Live mode requires Supabase Auth. Sign up, create the first workspace, then use Settings. No customer, conversation, issue or article is created automatically. The removable seed in `src/data.ts` is available only with `VITE_MEND_DEMO_MODE=1` or `?demo=1` and is labeled as demo data.

## Environment

Copy every key from `.env.example`; the important groups are:

- Browser: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_MEND_API_URL`.
- Supabase API/worker: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- WhatsApp: `WHATSMIAU_BASE_URL`, `WHATSMIAU_API_KEY`, `WHATSMIAU_WEBHOOK_SECRET`, `WHATSMIAU_WEBHOOK_URL`.
- Support AI: `OPENAI_API_KEY`, `SUPPORT_AI_MODEL`.
- Codex: `CODEX_MODEL`, `CODEX_REASONING_EFFORT`, fallback settings, limits and `CODEX_WORKSPACE_ROOT`.
- Google connections: server-only `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` and `GOOGLE_TOKEN_ENCRYPTION_KEY`.
- Local API: `PORT`, optional `MEND_API_TOKEN`, `MEND_WORKER_POLL_MS`.

`MEND_DEV_MODE=1` and `VITE_MEND_LOCAL_OPERATOR_MODE=1` are loopback-only escape hatches. They must be disabled in production. Never put `WHATSMIAU_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` or any other secret in a `VITE_*` variable.

## Connect WhatsApp

1. Start both local processes and sign in.
2. Open Settings → WhatsApp.
3. Create/select an instance, click Connect and scan the QR code in WhatsApp Business.
4. Keep Settings open while Mend polls the provider. Connected is shown only after Whatsmiau reports `open`.
5. Send a message from another number and verify that it appears in Inbox.

Localhost cannot receive internet webhooks. For a stable public receiver, deploy `supabase/functions/whats-mend-webhook` and set `WHATSMIAU_WEBHOOK_URL` to its HTTPS URL, or expose the API endpoint through a trusted HTTPS tunnel for development. Configure the same `WHATSMIAU_WEBHOOK_SECRET` at both boundaries. The receiver acknowledges quickly; normalization, idempotent persistence, media and AI work run asynchronously.

## Knowledge and AI drafts

Open Knowledge, create an article, and choose Draft or Published for AI. Only published articles from the same workspace are eligible for grounding. Keep conversation mode at Draft replies until the team has reviewed the knowledge base and tested escalation cases. Safe-auto is bounded by the stored policy and triage safety gates.

## Configure Codex

1. Set `CODEX_WORKSPACE_ROOT` to the parent directory that is allowed to contain repositories.
2. Open Settings → Repositories and register a repository path inside that root, its default branch and approved commands.
3. Open an issue and click Run Codex.
4. Review timeline, changed files, diff and checks.
5. Approve only after review. Approval may create a local branch and commit; it never pushes, merges, deploys or runs database migrations.

## Configure Google connections

Set the four server-only Google variables, register the callback URI in the
Google OAuth client, then open Settings → Connections. Multiple accounts can
be linked to the same workspace and each account has an explicit calendar
selection. If the variables are missing, the UI reports the configuration gap
and does not claim that an external connection succeeded.

On Windows, approved npm commands run through the fixed command allowlist using `cmd.exe`; command names and arguments never come from user input. npm cache/config state is kept outside the isolated workspace so it cannot pollute the review diff.

## Database and seed

Migrations live in `supabase/migrations/` and create workspaces/memberships, channels, contacts, conversations/messages, issue tracking, knowledge, jobs, audit, private media storage, Codex repositories/runs/events, transactional issue identifiers and RLS.

With Docker running, prove a clean local rebuild:

```powershell
supabase start
supabase db reset
supabase db lint --local
```

For the linked remote project:

```powershell
supabase migration list
supabase db push
supabase db lint --linked
```

The current machine does not have Docker Desktop available, so a local `db reset` is a required release check rather than a completed claim. The linked migration history and remote lint can still be verified through the authenticated CLI.

## Quality gate

```powershell
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

Playwright runs the operator flows on desktop and a Pixel-size mobile viewport. Install Chromium once with `npx playwright install chromium` if the bundled browser is unavailable. Tests use fakes/seed mode and never call real Whatsmiau or OpenAI APIs.

## Architecture

- `src/App.tsx`: responsive operator shell, Inbox, issues, Codex review, knowledge, settings and command palette.
- `src/api/`: authenticated API/Supabase actions, mappers and Realtime reconciliation.
- `server/api-router.ts`: validated HTTP boundary and workspace-role authorization.
- `server/whatsmiau.ts`, `server/whatsapp-service.ts`: provider adapter and WhatsApp application service.
- `server/jobs.ts`, `server/worker.ts`, `server/media.ts`: durable retries/dead letters, idempotency, private media and SSRF protection.
- `server/providers.ts`, `server/triage.ts`: support AI provider and safety/triage policy.
- `server/codex.ts`, `server/codex-service.ts`: isolated tools, bounded output, secret redaction, diff/check persistence and local approval.
- `supabase/migrations/`: schema, RPCs, grants, indexes, storage and RLS.

## Deployment

The production image serves the SPA, API and worker from one process on port
`8787`. For Dokploy, use **Build Type: Dockerfile**. See
[docs/DOKPLOY.md](docs/DOKPLOY.md) for the exact build arguments, runtime
variables, health check and Codex repository volume.

Security decisions and the current dependency-audit exception are documented in
[docs/SECURITY.md](docs/SECURITY.md).

Deploy the Vite build to a static host and the API/worker to a trusted Node host with persistent access to configured repositories. Put all server keys in the platform secret manager, set production Auth redirect URLs, deploy the webhook receiver, run migrations through the CLI, and keep `MEND_DEV_MODE=0`. Follow `docs/OPERATIONS_RUNBOOK.md` before enabling live traffic.

## Troubleshooting

- QR scans but Mend stays connecting: click Refresh, confirm the provider state is `open`, inspect API logs and verify the instance name/channel mapping.
- Message does not appear: confirm the public webhook URL/secret, inspect jobs/dead letters, and verify the event was accepted once (provider message IDs are idempotent).
- Reply fails: confirm channel state, API authentication and Whatsmiau credentials; failed optimistic messages remain marked Failed.
- Media fails: local files are limited to 8 MB in the browser and an allowlisted MIME type; remote media must use a public HTTPS URL.
- AI draft is empty: publish at least one relevant article and confirm `OPENAI_API_KEY`/`SUPPORT_AI_MODEL` on the server.
- Codex will not start: configure a repository inside `CODEX_WORKSPACE_ROOT`; only install/lint/test/build are allowed.
- Local Supabase reset fails: start Docker Desktop, then rerun `supabase start` and `supabase db reset`.

See `PRODUCT.md`, `DESIGN.md`, `docs/OPERATIONS_RUNBOOK.md` and `.env.example` for product, visual and operational decisions.
