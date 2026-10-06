# Zelo transactions in Mend

Vinicius authorized this connection on 2026-10-06: show Zelo transactions in a separate finance view, without merging Zelo receipts into Diagium's ledger or changing billing behavior. This supersedes the previous exclusion of Zelo payment visibility only for this read-only connection.

## Contract

`GET /api/finance/zelo?period=YYYY-MM-01` uses Mend authentication, canonical workspace membership and the existing explicit finance grant. Every call checks these before reading the process cache. The caller cannot select a source project, table, customer, URL or credentials. Browser responses are `Cache-Control: no-store`.

The fixed Zelo project is `xnnjyrblpvsqrtsshawa`. PIX comes from `billing_payments`, filtered to `provider=abacatepay`; Stripe invoices are fetched directly and restricted to live invoices whose customer IDs belong to Zelo's Stripe subscriptions. Only minimal transaction fields leave the server: source/external ID, dates, status, currency and amounts. Customer identities, QR codes, payment codes and raw provider errors are omitted. No charges, refunds, webhook changes, database writes or ledger imports occur.

Figures are payment reporting, not accrual profit. Charges are counted by creation date, receipts by actual payment date in `America/Sao_Paulo`, including previous-month invoices paid in the selected month. Currencies stay separate. Receipts are gross: gateway fees, refunds, disputes and bank payout timing are not deducted. Pending is the current unpaid amount of charges created in the selected month, not a historical end-of-month balance. Missing payment values are never replaced by expected amounts. Missing dates/amounts, read limits and provider failures make coverage partial or unavailable.

Snapshots expire in 60 seconds; failed/incomplete snapshots in 5 seconds. The process cache retains six month snapshots and coalesces simultaneous reads. Source queries have 12-second deadlines, fixed HTTPS origins, no redirects and GET-only requests. Supabase pagination is capped at 10,000 rows; Stripe at 2,000 invoices, including nonmatching invoices traversed. Reaching a cap is visible as partial coverage, never a full result. Browser cache is in memory, scoped to the authenticated owner/generation and cleared on logout, account changes, revoked financial access or financial mutations.

## Infrastructure handoff (Roger)

Configure on the **Mend control/dashboard server**, not the frontend build or the runner:

- `MEND_ZELO_SUPABASE_SERVICE_ROLE_KEY`: Zelo project server credential already used by the Zelo PDV. This key is privileged; the Mend adapter performs only fixed-table GETs. Do not change RLS or grant frontend access. Prefer a narrowly scoped server read connection if the deployment already supports one.
- `MEND_ZELO_STRIPE_READ_KEY`: a live Stripe key from the Zelo account. Prefer a restricted key with **Invoices: Read**. If reusing the existing account credential, do not rotate it or change billing settings. Test-mode keys are rejected.

Transfer through the existing secure deployment channel. No secret belongs in this document, chat, tracked files, build arguments, `VITE_*` variables or screenshots. Source credentials are not written to the Mend repo by this implementation. The local live-read verification used the two relevant existing Zelo credentials in memory only.

After configuring, deploy the approved app SHA and verify:

1. Anonymous feed request returns 401; a member without finance permission gets 403.
2. An authorized operator sees both provider states, real transaction IDs and monthly totals; Diagium totals stay unchanged.
3. Revoking finance access denies the next request even with a valid JWT and a warm cache.
4. If either provider fails, the page names the affected source and marks coverage incomplete.

No temporary QA account or finance records are required for activation: an existing authorized operator can perform the read-only smoke test.

## Verified source evidence

Local read-only integration against real providers on 2026-10-06 returned October: two PIX and two Stripe rows, BRL 207.00 gross confirmed receipts and BRL 99.00 pending charges. September returned three PIX and two Stripe rows, with partial PIX coverage due to missing paid amounts. These are sampled point-in-time results, not permanent expected totals. Machine-readable evidence is in the task folder's `zelo-finance-live-results.json`; no customer data or keys are exported.
