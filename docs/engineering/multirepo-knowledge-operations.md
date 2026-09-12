# Multirepo knowledge operations

Mend maintains one knowledge scope per support product. A workspace can map
many repositories to a product and can map shared repositories to several
products. Repository content is indexed at an exact commit and is never made
active merely because indexing succeeded.

## Configure a source

1. Connect the repository through the workspace GitHub App.
2. In **Knowledge → Sources**, create ZeloPDV, ZeloChat and ZeloMenu with their
   customer-facing aliases.
3. Connect each verified repository to every product it implements. Verify the
   README, package metadata and production service before mapping it.
4. Request the first sync. Mend resolves the configured branch to an exact SHA,
   downloads a read-only archive and extracts only allowlisted text files.
5. Inspect the indexed revision and sample documents. Activate that SHA only
   after confirming it matches production.

Default extraction includes product documentation, OpenAPI files, translations
and TypeScript implementation files. Hard exclusions cover environment files,
credentials, databases, dependencies, build output and binary content. The
extractor executes no repository code.

## GitHub delivery

Set the same `MEND_GITHUB_WEBHOOK_SECRET` on the public control service and the
runner. Configure the GitHub webhook URL as
`https://<mend-host>/webhooks/github/knowledge`, send a ping, then verify a push
to a non-configured ref queues no sync and a push to the configured ref queues
exactly one job for its commit SHA.

## Freshness and activation

- `observed_sha` is the latest commit reported or resolved for the configured ref.
- `indexed_sha` is the latest successfully indexed commit.
- `active_sha` is the commit an operator verified as deployed.

Repository evidence is eligible only when all three revisions agree. A failed
sync leaves the previous active index intact. Pausing a source stops new syncs
and leaves reviewed manual articles available.

## Quality and cost gates

`workflow_facts` records sync outcomes, counts of files and chunks, embedding
inputs, elapsed time, retrieval sufficiency, product ambiguity, deep research
and rejected replies. Metadata contains IDs and aggregates only, never customer
message text.

Run the sanitized 75-case corpus through `evaluateKnowledgeRelease`. Safe
auto-send stays disabled unless the latest run has zero tenant leakage,
wrong-product evidence, stale evidence, invented citations and internal-detail
leakage; at least 95% single-product routing and ambiguous-case handling; and
100% citation coverage for supported factual answers.

## Rollback

1. Disable safe auto-send for knowledge routes.
2. Set repository sources to `paused`.
3. Continue using reviewed manual articles.
4. Keep indexed revisions for diagnosis.
5. Revert application code if needed. Remove schema only in a later reviewed
   migration after exporting the data.
