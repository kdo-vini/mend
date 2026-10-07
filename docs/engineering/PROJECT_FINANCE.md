# Projects and company finance

Decision from Vinicius, 2026-10-06: Diagium is the company. Zelo is a
product/project belonging to Diagium; future websites and bespoke systems are
projects too. This replaces the earlier separate-business presentation.

## Data and permissions

`projects` is a workspace-scoped catalog with immutable `id` and `key`, editable
name/description, active/archived status and optimistic version. The stable key
matches the existing `finance_entries.project` and recurring-template fields.
Renaming a project therefore preserves historical financial links. Existing
nonempty project labels are seeded into the catalog; Zelo is seeded once. Empty
project remains the company/general bucket. No existing finance amounts change.

All workspace members may read the catalog. Writes require owner/admin role or
the existing explicit finance grant, enforced both by API and RLS. `project_save`
derives the canonical workspace; callers cannot select a workspace or actor.
Projects are archived, never physically deleted. Archived references stay valid.
The UI only offers active projects for new assignments and preserves an existing
archived/legacy assignment when editing a financial record.

`GET/POST /api/projects` use the authenticated operator's database client.
`GET /api/finance/summary?period=...&project=...` calls
`finance_project_summary`; filtered totals are computed across all matching
records in SQL, not the current table page. Lists filter before pagination;
settlements/references filter through their parent entry. Omitting project means
all projects; an empty value means general expenses/income. Monthly coverage
review remains company-wide and does not imply a project-specific close.

## User flows

- Sidebar **Projects** opens the catalog, create/edit/archive/restore actions.
- Each project links to `/financeiro?project=<key>`; Finance links back to Projects.
- Finance defaults to all projects and preselects a selected project in new
  income/expense forms. Zelo automatic receipts appear in all-project/Zelo views.
- Explicit Delete on manual entries and receipts opens a reason-required
  confirmation editor. It uses audited cancellation and optimistic locking;
  linked receipts/payments are independently cancelled, never silently erased.
- Provider transactions are read-only and changed at their source. Their
  balances, known fees and payouts follow [the provider contract](ZELO_FINANCE_CONNECTION.md).

## Delivery and verification

Apply `20261007010000_project_catalog.sql` before deploying the new project API.
This is additive and seeds labels, but still changes production data/schema;
production application is separate from isolated validation. Do not drop the
catalog to roll back the app: retaining the additive schema preserves new records.

`npm run test:projects-db` executes the real migration/RPCs with isolated PGlite,
including RLS, finance grants, stale updates, immutable keys, legacy seeds and
monthly summaries. HTTP boundary tests cover membership and payload spoofing.
Playwright mocks cover user flows without touching real projects or payments.
