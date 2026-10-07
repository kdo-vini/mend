# Zelo transactions in Mend

Vinicius clarified on 2026-10-06 that Diagium is the company and Zelo is its project/product. Projects have their own sidebar page. Finance can show all projects or a selected project; the Zelo provider feed appears in the all-project and Zelo views. Provider transactions remain read-only and are never duplicated into manual ledger entries or used to change billing behavior.

## Contract

`GET /api/finance/zelo?period=YYYY-MM-01` uses Mend authentication, canonical workspace membership and the existing explicit finance grant. Every call checks these before reading the process cache. The caller cannot select a source project, table, customer, URL or credentials. Browser responses are `Cache-Control: no-store`.

The fixed Zelo project is `xnnjyrblpvsqrtsshawa`. PIX comes from `billing_payments`, filtered to `provider=abacatepay`; Stripe invoices are fetched directly and restricted to live invoices whose customer IDs belong to Zelo's Stripe subscriptions. Only minimal transaction fields leave the server: source/external ID, dates, status, currency and amounts. Customer identities, QR codes, payment codes and raw provider errors are omitted. No charges, refunds, webhook changes, database writes or ledger imports occur.

Figures are payment reporting, not accrual profit. Charges are counted by creation date, receipts by actual payment date in `America/Sao_Paulo`, including previous-month invoices paid in the selected month. Currencies stay separate. Gross receipts remain available for reconciliation; confirmed net receipts deduct only provider-reported payment fees. Stripe uses the matching live charge's balance transaction; AbacatePay uses a verified live checkout and its exact incoming credit/fee movements in the monthly bank statement. Missing or inconsistent fields yield unknown fee/net, never an estimated percentage. Refunds, disputes and payout fees require separate reconciliation. Pending is the current unpaid amount of charges created in the selected month, not a historical end-of-month balance.

The selected-project receipt rollup adds manual receipts to known BRL Zelo net receipts only for the same month. It is labelled as known/partial receipts, not profit or a bank balance. Provider balances and payouts are never added to revenue again.

`GET /api/finance/provider-balances` is protected by the same finance authorization before any request. It returns account-wide balances and pending/in-transit payouts separately for each provider. These may include other products in the credential's account, and the UI explicitly says so. Stripe `available_on` means balance availability; only payout `arrival_date` supplies a bank arrival estimate. AbacatePay currently exposes no confirmed arrival date or unambiguous payout net contract in this adapter, so those remain unknown. Reads have a shared 12-second deadline per provider and at most five pages of 100 payouts. No payout is created or changed.

AbacatePay enrichment verifies at most 100 exact `bill_*` IDs already returned by the Zelo feed through `checkouts/get`, four concurrent fixed-origin GETs and a shared 12-second deadline. It then reads only the selected month's bank statement, at most 10 pages of 100. A single statement item must match the checkout ID and currency, with exactly one incoming PIX transaction credit matching the known receipt and one fee debit. Extra movements, duplicates, incomplete pagination or invalid checkout/live-mode/amount/status leave net unknown. Unrelated transactions and customer data are never exposed. `pix/get` describes outgoing PIX and is deliberately not used for receipt fees.

Snapshots expire in 60 seconds; failed/incomplete snapshots in 5 seconds. The process cache retains six month snapshots and coalesces simultaneous reads. Source queries have 12-second deadlines, fixed HTTPS origins, no redirects and GET-only requests. Supabase pagination is capped at 10,000 rows; Stripe at 2,000 invoices, including nonmatching invoices traversed. Reaching a cap is visible as partial coverage, never a full result. Browser cache is in memory, scoped to the authenticated owner/generation and cleared on logout, account changes, revoked financial access or financial mutations.

## Infrastructure handoff (Roger)

Configure on the **Mend control/dashboard server**, not the frontend build or the runner:

- `MEND_ZELO_SUPABASE_SERVICE_ROLE_KEY`: Zelo project server credential already used by the Zelo PDV. This key is privileged; the Mend adapter performs only fixed-table GETs. Do not change RLS or grant frontend access. Prefer a narrowly scoped server read connection if the deployment already supports one.
- `MEND_ZELO_STRIPE_READ_KEY`: a live restricted Stripe key with read access to invoices, charges, balance transactions, balance and payouts. Missing permissions degrade the relevant fields/source without inventing values. Do not rotate existing credentials or change billing settings. Test-mode keys are rejected.
- `MEND_ZELO_ABACATEPAY_READ_KEY`: a server-only live AbacatePay credential permitted to read checkouts, bank statements, store balances and payout listings. This is additional configuration; it is not supplied by the Zelo Supabase key. The implementation does not assume it is deployed.

Transfer through the existing secure deployment channel. No secret belongs in this document, chat, tracked files, build arguments, `VITE_*` variables or screenshots. Source credentials are not written to the Mend repo by this implementation. The local live-read verification used the two relevant existing Zelo credentials in memory only.

After configuring, deploy the approved app SHA and verify:

1. Anonymous feed request returns 401; a member without finance permission gets 403.
2. An authorized operator sees each provider state, real transaction IDs, known fees/net and account balance scope. Manual totals remain independently auditable; the receipt rollup counts provider income once.
3. Revoking finance access denies the next request even with a valid JWT and a warm cache.
4. If either provider fails, the page names the affected source and marks coverage incomplete.

No temporary QA account or finance records are required for activation: an existing authorized operator can perform the read-only smoke test.

Contract sources: [Stripe balance transaction](https://docs.stripe.com/api/balance_transactions/object), [Stripe payout](https://docs.stripe.com/api/payouts/object), [AbacatePay store](https://docs.abacatepay.com/pages/store/get), [AbacatePay payouts](https://docs.abacatepay.com/pages/payouts/list), and [AbacatePay official OpenAPI](https://github.com/AbacatePay/documentation/blob/main/openapi.yaml) (`/checkouts/get`, `/bank-statement/list`, `BankStatementItem`, `BankStatementMovement`). Provider schema tests exercise these contracts with synthetic responses; this does not assert the new permissions are active in production.

## Verified source evidence

Local read-only integration against real providers on 2026-10-06 returned October: two PIX and two Stripe rows, BRL 207.00 gross confirmed receipts and BRL 99.00 pending charges. September returned three PIX and two Stripe rows, with partial PIX coverage due to missing paid amounts. These are sampled point-in-time results, not permanent expected totals. Machine-readable evidence is in the task folder's `zelo-finance-live-results.json`; no customer data or keys are exported.
