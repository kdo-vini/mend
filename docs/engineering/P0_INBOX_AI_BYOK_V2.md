# P0 Inbox AI via BYOK V2

## Runtime contract

Inbox AI resolves only the active `agent_connections` row with
`purpose = 'support'`, `provider = 'openai'`, and `auth_method = 'api_key'`.
The encrypted key lives in `agent_connection_secrets`; model roles live in
`agent_connections.support_config_json`:

- `supportModel`: triage, classification and drafts
- `visionModel`: images and PDFs
- `transcriptionModel`: audio
- `embeddingModel`: knowledge indexing and semantic search

Coding connections and subscription connections are never eligible for Inbox
AI. Support model selectors are constrained by the verified catalog
capabilities.

## Rollout order

1. Deploy the V2-only application code and stop creating new legacy credential
   writes.
2. Drain and restart all old workers. Confirm no worker is still running the
   legacy resolver.
3. Apply `20260814183727_p0_inbox_ai_byok_v2.sql` with the Supabase CLI. The
   migration invalidates incompatible Support rows, enforces one active Support
   connection per workspace, and drops `workspace_agent_credentials`.
4. Open `Settings → Agents & models → Support` and configure the Techne
   workspace with an OpenAI API key.
5. Verify all four roles: text, vision, transcription and embedding.
6. Resume paused conversations manually. Resume never replays messages that
   arrived before the explicit resume action.

Do not apply the destructive migration while old workers are still running.

## Verification

```text
npm run i18n:check
npm run i18n:frontend
npm run typecheck
npm test
npm run lint
npm run format:check
npm run test:e2e
```
