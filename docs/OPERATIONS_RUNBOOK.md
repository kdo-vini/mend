# Mend operations runbook

This is the shortest path from the local MVP to a production workspace. The browser never receives provider secrets.

## Local start

```powershell
npm install
npm run dev -- --host 0.0.0.0 --port 5174
npm run server
```

Health check:

```powershell
Invoke-WebRequest http://localhost:8787/api/health
```

Quality gate:

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

## Supabase release

1. Confirm the target ref is `uwhugsimhtjtrnuotuki` and the region is `sa-east-1`.
2. Apply migrations through the authenticated Supabase CLI (`supabase db push`) after linking the ref.
3. Generate and commit database types after every schema change.
4. Configure Auth redirect URLs for the production app and add the first workspace member.
5. Run the security and performance advisors before enabling live traffic.

Never put a service-role key, Whatsmiau API key, webhook secret, or OpenAI key in `VITE_*` variables.

## Provider setup

Set these server-side values in the deployment secret manager:

- `WHATSMIAU_API_KEY`, `WHATSMIAU_WEBHOOK_SECRET`, and `WHATSMIAU_BASE_URL`.
- `OPENAI_API_KEY` and `SUPPORT_AI_MODEL`.
- `CODEX_WORKSPACE_ROOT`, `CODEX_MODEL`, and `CODEX_MAX_RUNTIME_SECONDS`.
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` for the trusted API/worker process. Keep the service key server-only.
- `APP_BASE_URL` so channel creation can register the webhook callback.
- `MEND_API_TOKEN` for protected operator-only provider administration routes.
- `VITE_SUPABASE_URL` and the publishable Supabase key are safe for the browser; all writes still require RLS.

Configure the Whatsmiau webhook to the public `/webhooks/whatsmiau` endpoint and verify the authorization header with a signed test event before connecting a customer number.

## First live workspace setup

1. Start the API with `WHATSMIAU_API_KEY` available only to the server. For local loopback testing, `MEND_DEV_MODE=1` allows the Vite app to call the safe connection summaries without an admin token; this is rejected when `NODE_ENV=production`.
2. In Settings → WhatsApp, create or select the real Whatsmiau channel, connect it and scan the QR code. A channel is considered connected only after the provider state reports `open`.
3. Configure the provider webhook to `/webhooks/whatsmiau` with `WHATSMIAU_WEBHOOK_SECRET`, then send a test message from a real contact. Confirm the conversation and message appear in Inbox; an empty inbox is a valid state before the first message.
4. In Knowledge, create articles describing products, systems, procedures and escalation rules. Keep drafts private; publish only reviewed articles. AI drafts are allowed to use published articles from the same workspace as reference context.
5. Keep the default AI mode as `draft` until message persistence, article grounding and human approval have been verified with a real test conversation.

## First-use workspace bootstrap

`server/bootstrap.ts` provides the authenticated first-use boundary without introducing a second workspace-creation path:

- `listBootstrapWorkspaces(auth)` delegates to `listMyWorkspaces` and validates returned roles.
- `createFirstWorkspace(auth, input)` validates the existing `workspaceCreateSchema`, refuses to create when the user already has a visible workspace, and delegates creation to the existing `create_workspace` RPC wrapper.
- After the RPC, it reads the user's visible workspaces again and requires the new row to have the requested slug and `owner` role.

The RPC derives the membership from `auth.uid()`. The bootstrap API does not accept a user id, invent a membership, or write remote data during module initialization. The browser onboarding screen calls this boundary after Supabase Auth sign-up/sign-in; no sample workspace or records are created.

## Incident response

1. Turn the workspace AI policy to `AI off`.
2. Pause the worker/jobs consumer; the webhook should continue to acknowledge quickly.
3. Inspect `audit_log`, `jobs`, and provider error rates. Do not paste customer content or secrets into logs.
4. Revoke and rotate the affected provider secret.
5. Replay only idempotent jobs after the provider and queue are healthy.
6. Document the incident and restore the workspace policy deliberately.

## Backup and recovery

Use Supabase's managed backups/PITR for the database and verify one restore drill per release cycle. Keep media in the private bucket, use short-lived signed URLs, and test restoring both metadata and media references.

## Production launch gate

- [ ] Auth, workspace membership, RLS and audit events verified with two workspaces.
- [ ] Migration applied to the target project and advisors clean.
- [ ] Whatsmiau webhook signature, idempotency and retry/dead-letter behavior verified.
- [ ] OpenAI draft/triage tested with fixture conversations and unsafe-content block tested.
- [ ] No live auto-send enabled until human review and rollback are proven.
- [ ] Codex runner tested with a disposable repository; push/merge/deploy remain blocked.
- [ ] E2E, accessibility keyboard pass, observability alerts and backup restore drill complete.
