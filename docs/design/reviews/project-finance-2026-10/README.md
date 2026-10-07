# Projects, finance and workspace polish

This delivery follows the approved HTML and Vinicius's subsequent decisions:
Diagium owns projects (including Zelo), Projects has its own sidebar route,
Finance links to that catalog, and the inbox uses a waveform audio player.

## Visual evidence

The `desktop/` and `mobile/` folders contain light/dark screenshots from isolated
Playwright fixtures: projects, finance overview/editor, dashboard, inbox, issues
and settings. All values and identities are synthetic. The audio screenshots
mount the real player in a component preview over the demo inbox, with a generated
silent WAV; they are not evidence of a production message or provider connection.

## Verification performed

- Unit/integration: 804 tests passed in 124 files.
- Real SQL in isolated PGlite: 11 project scenarios and 15 finance scenarios passed.
  Includes RLS, explicit finance grants, immutable keys, conflicts, project totals
  and cancellation of a payment after its parent entry was cancelled.
- Full desktop/mobile E2E run: 214 passed, 10 skipped, 2 failed because the newly
  added audio fixture imported ReactDOM incorrectly. After correcting that test,
  all 4 audio scenarios passed (play, pause, seek and both themes). The remaining
  application scenarios passed in the full run. No skipped scenario is claimed
  as validated.
- Focused finance/projects/navigation regression: 68 passed.
- Typecheck, build and i18n checks passed; lint has no errors and 3 existing warnings.

## Review conclusions and limits

The new sidebar and project links preserve existing financial permissions.
Filtered totals run in SQL across the whole matching set, before list pagination.
Financial deletion is explicit audited cancellation, preserving history; automatic
provider transactions remain read-only. Provider balances are account-wide and
are never added to revenue. Known net receipts are separated from unknown fees.

Stripe fee/net is accepted only from a matching balance transaction. AbacatePay
fee/net requires a matching paid checkout and unambiguous deposit/fee statement
movements. No fee percentage or bank arrival date is guessed. Payout dates are
shown only where the provider supplies them. These contracts were tested with
fixtures; live credentials and provider access must be checked during activation.

Apply the additive project migration before releasing this app version. It seeds
Zelo and legacy project labels, without changing historical financial amounts.
See [project deployment details](../../../engineering/PROJECT_FINANCE.md) and
[provider permissions](../../../engineering/ZELO_FINANCE_CONNECTION.md).
No production migration, provider mutation or deploy was performed in this review.
