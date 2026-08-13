# Mend Workspace UI/UX Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize and refactor the authenticated Mend workspace and landing
product proof so the support-to-verified-fix loop is clear, Settings is
outcome-oriented, desktop remains operationally dense, and a solo founder can
respond and supervise the loop from mobile.

**Architecture:** Preserve the current React/Vite shell, App-owned live/demo
state, feature API boundaries, route-level lazy loading, and canonical design
tokens. Introduce small pure routing helpers, one shared tab primitive, and
feature-local layout components; reorganize existing pages and routes without
changing backend contracts. Each task owns its feature files and leaves shared
integration to the final task.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, React Router 7, i18next,
Radix/shadcn primitives, Lucide, Vitest, Playwright, CSS custom properties.

## Global Constraints

- The binding design is
  `docs/superpowers/specs/2026-08-13-workspace-ui-ux-refactor-design.md`.
- Follow `docs/product/MEND_PRODUCT_STRATEGY_V1.md`, `DESIGN.md`, and
  `docs/design/MEND_DESIGN_PATTERNS.md`.
- Reuse the existing `BrandMark`, page-frame tokens, spacing scale, controls,
  resource states, `useConfirmation`, and `ConfirmDialog`.
- Do not add dependencies, backend routes, database migrations, direct
  Supabase calls from UI, or new autonomous product behavior.
- Keep feature API calls in each feature's `api.ts` and preserve all existing
  workspace scoping and authorization behavior.
- Every changed visible string, tooltip, aria label, empty state, status, and
  action must exist in both `en-US` and `pt-BR` and render through i18n.
- Dark and light modes are equal release targets. Reuse the existing semantic
  theme tokens; do not add feature-local hardcoded dark surfaces or reset UI
  state when the Profile theme control changes.
- Preserve route-level lazy loading and avoid inline component declarations,
  mirrored derived state, unnecessary memoization, and animation loops.
- Product desktop controls remain 32px; critical mobile actions provide a
  minimum 44px touch target.
- Canonical responsive review widths are desktop `1440×900` and mobile
  `390×844`; no page-level horizontal overflow is allowed. The final visual
  matrix covers both themes and both `en-US`/`pt-BR` locales.
- The Inbox context rail is persistent at `>=1280px`, disclosed below that,
  and full-screen/staged on mobile.
- Shared Board columns use `minmax(180px, 1fr)` at content widths `>=1080px`
  and 220px scroll columns below that.
- Landing playback has four scenes, advances every 3.2 seconds, pauses during
  interaction, and disables autoplay/pointer travel under reduced motion.
- Use TDD for every behavior change: write the smallest real test, run it and
  observe the intended failure, write minimal production code, and rerun.
- Do not write tests that assert source text, mocks, or framework behavior.
- Each task ends with focused tests, `npm run typecheck`, and a conventional
  commit. Do not proceed past an open Important/Critical review finding.

---

## File and ownership map

| Area                     | Primary files                                                                                                                                         | Responsibility                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Shared routing and shell | `src/app/routes/*`, `src/app/shell/*`, `src/App.tsx`, `src/shared/ui/ViewTabs.tsx`, `src/styles/{shell,shared,responsive,tokens}.css`, common locales | Canonical destinations, legacy redirects, navigation, shared view switch                         |
| Issues and planning      | `src/features/issues/**`, `src/features/kanban/**`, issue/kanban styles and locales                                                                   | List/Board consolidation, filters, adaptive board, My work                                       |
| Inbox                    | `src/features/inbox/**`, inbox styles/locales                                                                                                         | Case context rail, mobile reply and context disclosure                                           |
| Runs                     | `src/features/runs/**`, runs styles/locales                                                                                                           | URL-selected run, vertical mobile case chain, decision action bar                                |
| Knowledge                | `src/features/knowledge/**`, knowledge styles/locales                                                                                                 | Scan-first list, desktop preview, mobile detail                                                  |
| Settings routes          | `src/features/settings/settings-navigation*`, `SettingsLayout.tsx`, `SettingsWorkspacePage.tsx`, settings E2E/locales                                 | Outcome-oriented taxonomy and legacy route compatibility                                         |
| Settings content         | settings automation/engineering/integration pages and settings CSS/locales                                                                            | Replies/Intake, Providers/Run policy, provider comparison table                                  |
| Marketing                | `src/features/marketing/**`, marketing styles/locales, marketing E2E                                                                                  | Interactive four-scene hero playback                                                             |
| Integration and release  | notification destination helper, issue/run cross-links, cross-feature E2E, Dokploy release checks                                                     | End-to-end mobile founder journey, theme/locale QA, production deployment and smoke verification |

Tasks are sequential in the shared worktree. Use a fresh implementation
subagent and a fresh task reviewer for each task. Tasks 3–5 and 8 are logically
independent after Task 1, but must not commit concurrently in the same worktree.

---

### Task 0: Freeze the plan and create the isolated implementation worktree

**Files:**

- Modify: `.gitignore`
- Commit: the approved spec and this implementation plan on `main`
- Create: ignored worktree `.worktrees/workspace-ui-refactor`
- Create: branch `codex/workspace-ui-refactor`

**Contract:**

- The original checkout must be clean before worktree creation and remain the
  delivery checkout; all implementation happens in the linked worktree.
- The feature branch begins at the documentation commit containing the approved
  spec and executable plan, not at stale `origin/main`.
- Record the immutable implementation-base SHA in the ignored SDD ledger for
  later whole-branch review and release comparison.
- Never create or reuse the worktree if its resolved path is outside the
  repository's `.worktrees` directory or if `.worktrees/` is not ignored.

- [ ] **Step 1: Commit the approved planning baseline**

From the original checkout, add `.worktrees/` to `.gitignore`, format and verify
both documents, then commit only the planning files and ignore rule:

```powershell
npx prettier --check docs/superpowers/specs/2026-08-13-workspace-ui-ux-refactor-design.md docs/superpowers/plans/2026-08-13-workspace-ui-ux-refactor.md
git diff --check
git add .gitignore docs/superpowers/specs/2026-08-13-workspace-ui-ux-refactor-design.md docs/superpowers/plans/2026-08-13-workspace-ui-ux-refactor.md
git commit -m "docs: add workspace ui refactor plan"
git status --short
```

Expected: the commit succeeds and the original checkout is clean.

- [ ] **Step 2: Verify isolation prerequisites**

```powershell
$repoRoot = (git rev-parse --show-toplevel).Trim()
$gitDir = (git rev-parse --git-dir).Trim()
$gitCommonDir = (git rev-parse --git-common-dir).Trim()
$branch = (git branch --show-current).Trim()
$implementationBase = (git rev-parse HEAD).Trim()
if ($gitDir -ne $gitCommonDir -or $branch -ne 'main') {
  throw 'Planning checkout must be the normal main worktree'
}
git check-ignore -q .worktrees/workspace-ui-refactor
if ($LASTEXITCODE -ne 0) { throw '.worktrees must be ignored' }
if (git status --porcelain) { throw 'Original checkout must be clean' }
```

Expected: the checkout is the normal `main` worktree, `.worktrees` is ignored,
and `$implementationBase` is the planning commit SHA.

- [ ] **Step 3: Create the branch and worktree**

```powershell
$repoRoot = (git rev-parse --show-toplevel).Trim()
$gitDir = (git rev-parse --git-dir).Trim()
$gitCommonDir = (git rev-parse --git-common-dir).Trim()
$branch = (git branch --show-current).Trim()
$implementationBase = (git rev-parse HEAD).Trim()
if ($gitDir -ne $gitCommonDir -or $branch -ne 'main') {
  throw 'Planning checkout must still be the normal main worktree'
}
git check-ignore -q .worktrees/workspace-ui-refactor
if ($LASTEXITCODE -ne 0) { throw '.worktrees must be ignored' }
if (git status --porcelain) { throw 'Original checkout must still be clean' }
$worktreeRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot '.worktrees'))
$worktreePath = [System.IO.Path]::GetFullPath((Join-Path $worktreeRoot 'workspace-ui-refactor'))
if (-not $worktreePath.StartsWith(
  $worktreeRoot + [System.IO.Path]::DirectorySeparatorChar,
  [System.StringComparison]::OrdinalIgnoreCase
)) {
  throw 'Resolved worktree path escaped .worktrees'
}
if (Test-Path -LiteralPath $worktreePath) { throw 'Worktree path already exists' }
git show-ref --verify --quiet refs/heads/codex/workspace-ui-refactor
if ($LASTEXITCODE -eq 0) { throw 'Feature branch already exists; inspect before reuse' }
git worktree add $worktreePath -b codex/workspace-ui-refactor $implementationBase
```

Expected: the linked worktree is on `codex/workspace-ui-refactor` at the exact
implementation-base SHA. Store `$repoRoot`, `$worktreePath`, and
`$implementationBase` in the ignored SDD progress ledger.

- [ ] **Step 4: Install and prove the baseline**

From `$worktreePath`:

```powershell
npm install
npm test
npm run typecheck
git status --short --branch
```

Expected: dependencies install without manifest changes, tests/typecheck pass,
and the feature worktree is clean. If the baseline fails, stop and diagnose
before changing product code.

---

### Task 1: Canonical workspace routes, navigation, and shell

**Files:**

- Create: `src/app/routes/workspace-routing.ts`
- Create: `src/app/routes/workspace-routing.test.ts`
- Create: `src/shared/ui/ViewTabs.tsx`
- Modify: `src/app/routes/WorkspaceRoutes.tsx`
- Modify: `src/app/shell/navigation.ts`
- Modify: `src/app/shell/WorkspaceShell.tsx`
- Modify: `src/App.tsx`
- Modify: `src/features/kanban/pages/KanbanPage.tsx`
- Modify: `src/styles/shell.css`
- Modify: `src/styles/shared.css`
- Modify: `src/styles/responsive.css`
- Modify: `src/styles/tokens.css`
- Modify: `src/i18n/locales/en-US/common.json`
- Modify: `src/i18n/locales/pt-BR/common.json`
- Create: `e2e/navigation-refactor.spec.ts`

**Interfaces:**

- Produces:
  `IssueWorkspaceView = "list" | "board"`,
  `issueWorkspaceView(search: string): IssueWorkspaceView`,
  `issueViewHref(view: IssueWorkspaceView, search: string): string`, and
  `legacyKanbanDestination(search: string): string`.
- Produces shared
  `ViewTabs({ label, items }: { label: string; items: ViewTabItem[] })`, where
  `ViewTabItem` is `{ id: string; label: string; href: string; active: boolean }`.
- Changes `WorkspaceRouteElements` to consume `issuesList`, `issuesBoard`, and
  `myWork`; removes the standalone `kanban` destination.
- Adds `fixedMode?: "shared" | "personal"` to `KanbanPageProps`; when set, the
  Shared/Personal switch is not rendered.

- [ ] **Step 1: Write the failing routing tests**

Create `src/app/routes/workspace-routing.test.ts` with literal expectations:

```ts
import { describe, expect, it } from "vitest";
import {
  issueViewHref,
  issueWorkspaceView,
  legacyKanbanDestination,
} from "./workspace-routing";

describe("workspace routing", () => {
  it("defaults unknown issue views to the list", () => {
    expect(issueWorkspaceView("?demo=1")).toBe("list");
    expect(issueWorkspaceView("?view=timeline&demo=1")).toBe("list");
    expect(issueWorkspaceView("?view=board&demo=1")).toBe("board");
  });

  it("switches issue views without dropping unrelated query state", () => {
    expect(issueViewHref("board", "?demo=1&status=open")).toBe(
      "/issues?demo=1&status=open&view=board",
    );
    expect(issueViewHref("list", "?demo=1&view=board")).toBe("/issues?demo=1");
  });

  it("redirects legacy shared and personal Kanban routes", () => {
    expect(legacyKanbanDestination("?demo=1")).toBe(
      "/issues?demo=1&view=board",
    );
    expect(legacyKanbanDestination("?mode=personal&demo=1")).toBe(
      "/my-work?demo=1",
    );
  });
});
```

- [ ] **Step 2: Run the unit test and verify RED**

Run:

```powershell
npm test -- src/app/routes/workspace-routing.test.ts
```

Expected: FAIL because `workspace-routing.ts` does not exist.

- [ ] **Step 3: Implement the pure routing contract**

Create `src/app/routes/workspace-routing.ts`:

```ts
export type IssueWorkspaceView = "list" | "board";

export function issueWorkspaceView(search: string): IssueWorkspaceView {
  return new URLSearchParams(search).get("view") === "board" ? "board" : "list";
}

export function issueViewHref(
  view: IssueWorkspaceView,
  search: string,
): string {
  const params = new URLSearchParams(search);
  if (view === "board") params.set("view", "board");
  else params.delete("view");
  const query = params.toString();
  return `/issues${query ? `?${query}` : ""}`;
}

export function legacyKanbanDestination(search: string): string {
  const params = new URLSearchParams(search);
  const personal = params.get("mode") === "personal";
  params.delete("mode");
  if (!personal) params.set("view", "board");
  else params.delete("view");
  const query = params.toString();
  return `${personal ? "/my-work" : "/issues"}${query ? `?${query}` : ""}`;
}
```

- [ ] **Step 4: Run the routing test and verify GREEN**

Run the Step 2 command. Expected: 3 tests PASS.

- [ ] **Step 5: Write failing navigation E2E coverage**

Create `e2e/navigation-refactor.spec.ts` with these behaviors:

```ts
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mend.interface-language", "en-US");
  });
});

test("workspace navigation exposes the product loop without standalone Kanban", async ({
  page,
}, testInfo) => {
  await page.goto("/inbox?demo=1");
  const navigation =
    testInfo.project.name === "mobile"
      ? page.locator(".mobile-bottom-nav")
      : page.locator(".primary-nav");
  await expect(navigation.getByText("Inbox", { exact: true })).toBeVisible();
  await expect(navigation.getByText("Issues", { exact: true })).toBeVisible();
  await expect(navigation.getByText("Runs", { exact: true })).toBeVisible();
  await expect(navigation.getByText("Kanban", { exact: true })).toHaveCount(0);
});

test("legacy Kanban destinations preserve demo state", async ({ page }) => {
  await page.goto("/kanban?demo=1");
  await expect(page).toHaveURL(/\/issues\?demo=1&view=board$/);
  await page.goto("/kanban?mode=personal&demo=1");
  await expect(page).toHaveURL(/\/my-work\?demo=1$/);
});

test("mobile More keeps secondary work and controls reachable", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await page.goto("/inbox?demo=1");
  await page.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("link", { name: "My work" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Profile" })).toBeVisible();
  await expect(page.getByRole("button", { name: /theme/i })).toBeVisible();
  await page.getByRole("link", { name: "My work" }).click();
  await expect(page).toHaveURL(/\/my-work\?demo=1$/);
});
```

- [ ] **Step 6: Run the E2E test and verify RED**

Run:

```powershell
npx playwright test e2e/navigation-refactor.spec.ts --project=desktop --project=mobile
```

Expected: FAIL because Kanban is still a top-level link and legacy routes do
not redirect.

- [ ] **Step 7: Implement route composition and fixed Kanban modes**

In `WorkspaceRoutes.tsx`, use two small route components backed by the tested
helpers:

```tsx
function IssuesWorkspaceRoute({
  list,
  board,
}: {
  list: ReactNode;
  board: ReactNode;
}) {
  const { search } = useLocation();
  return issueWorkspaceView(search) === "board" ? board : list;
}

function LegacyKanbanRedirect() {
  const { search } = useLocation();
  return <Navigate replace to={legacyKanbanDestination(search)} />;
}
```

Register `/issues` with `IssuesWorkspaceRoute`, `/my-work` with the personal
element, and `/kanban` with `LegacyKanbanRedirect`. Keep `/issues/:identifier`
unchanged.

In `KanbanPage.tsx`, retain local state only for backwards-compatible internal
use and derive the rendered mode directly:

```ts
const [localMode, setLocalMode] = useState<Mode>(initialMode);
const mode = fixedMode ?? localMode;
```

Render the Shared/Personal switch only when `fixedMode === undefined`. Update
`App.tsx` so the issue board receives `fixedMode="shared"` and `/my-work`
receives `fixedMode="personal"`.

- [ ] **Step 8: Replace English navigation constants with semantic ids**

Change `navigation.ts` items to ids:

```ts
export type WorkspaceNavigationId =
  | "inbox"
  | "issues"
  | "runs"
  | "knowledge"
  | "settings";

export const navItems = [
  { id: "inbox", to: "/inbox", icon: InboxIcon },
  { id: "issues", to: "/issues", icon: CircleDot },
  { id: "runs", to: "/agent-runs", icon: TerminalSquare },
  { id: "knowledge", to: "/knowledge", icon: BookOpen },
  { id: "settings", to: "/settings", icon: SettingsIcon },
] as const;
```

Map ids directly to `navigation.<id>` translations. Desktop shows all five.
Mobile bottom navigation shows Inbox, Issues, Runs, and More; Knowledge,
My work, Settings, and Profile live in More. Add `navigation.myWork` and use
`Runs` / `Execuções` for the short navigation label. Keep the existing theme
and sign-out actions inside More and give the theme control a translated
accessible name.

Define `--mobile-bottom-nav-height: 62px` in `tokens.css`, use it for the mobile
shell navigation height and content clearance, and compose safe-area padding in
one place. Later sticky mobile actions consume this shared token rather than a
feature-local literal.

- [ ] **Step 9: Add the shared semantic view tabs and shell styling**

Create `ViewTabs.tsx`:

```tsx
import { Link } from "react-router-dom";

export interface ViewTabItem {
  id: string;
  label: string;
  href: string;
  active: boolean;
}

export function ViewTabs({
  label,
  items,
}: {
  label: string;
  items: ViewTabItem[];
}) {
  return (
    <nav className="view-tabs" aria-label={label}>
      {items.map((item) => (
        <Link
          key={item.id}
          className={item.active ? "active" : ""}
          aria-current={item.active ? "page" : undefined}
          to={item.href}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
```

Add `--mobile-touch-target: 44px` to tokens. Style `.view-tabs` as a compact
flat segmented control with existing surface, line, radius, focus, and active
blue relationship rules. At `<=650px`, links have a 44px minimum touch target.

- [ ] **Step 10: Verify Task 1 and commit**

Run:

```powershell
npm test -- src/app/routes/workspace-routing.test.ts
npx playwright test e2e/navigation-refactor.spec.ts
npm run i18n:check
npm run typecheck
git diff --check
```

Expected: all commands exit 0. Commit:

```powershell
git add src/app src/App.tsx src/shared/ui/ViewTabs.tsx src/features/kanban/pages/KanbanPage.tsx src/styles src/i18n/locales/en-US/common.json src/i18n/locales/pt-BR/common.json e2e/navigation-refactor.spec.ts
git commit -m "refactor: simplify workspace navigation"
```

---

### Task 2: Consolidate Issues, Board, and My work

**Files:**

- Modify: `src/features/issues/pages/IssuesPage.tsx`
- Modify: `src/features/kanban/pages/KanbanPage.tsx`
- Modify: `src/styles/features/issues.css`
- Modify: `src/styles/features/kanban.css`
- Modify: `src/i18n/locales/en-US/issues.json`
- Modify: `src/i18n/locales/pt-BR/issues.json`
- Modify: `src/i18n/locales/en-US/kanban.json`
- Modify: `src/i18n/locales/pt-BR/kanban.json`
- Create: `e2e/issues-workspace-refactor.spec.ts`

**Interfaces:**

- Consumes `ViewTabs`, `issueViewHref`, and `fixedMode` from Task 1.
- Preserves all existing issue callbacks and Kanban persistence APIs.
- Produces selectors `.issues-desktop-table`, `.issues-mobile-list`,
  `.issue-advanced-filters`, `.kanban-board-scroll`, and
  `.kanban-mobile-status-list` for responsive verification.

- [ ] **Step 1: Write failing List/Board behavior tests**

Create `e2e/issues-workspace-refactor.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mend.interface-language", "en-US");
  });
});

test("Issues owns list and board views", async ({ page }) => {
  await page.goto("/issues?demo=1");
  await expect(page.getByRole("link", { name: "List" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.getByRole("link", { name: "Board" }).click();
  await expect(page).toHaveURL(/view=board/);
  await expect(page.getByText("Triage", { exact: true }).first()).toBeVisible();
});

test("advanced filters stay behind one explicit control", async ({ page }) => {
  await page.goto("/issues?demo=1");
  const advanced = page.getByRole("region", { name: "Advanced filters" });
  await expect(advanced).toBeHidden();
  await page.getByRole("button", { name: "More filters" }).click();
  await expect(advanced).toBeVisible();
  await expect(page.getByLabel("Priority")).toBeVisible();
  await expect(page.getByLabel("Labels")).toBeVisible();
});

test("mobile issues use compact rows and a grouped board", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/issues?demo=1");
  await expect(page.locator(".issues-mobile-list")).toBeVisible();
  await expect(page.locator(".issues-desktop-table")).toBeHidden();
  await page.getByRole("link", { name: "Board" }).click();
  await expect(page.locator(".kanban-mobile-status-list")).toBeVisible();
  expect(
    await page.evaluate(() => document.body.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
```

- [ ] **Step 2: Run the feature E2E and verify RED**

Run:

```powershell
npx playwright test e2e/issues-workspace-refactor.spec.ts
```

Expected: FAIL because List/Board tabs, the advanced filter disclosure, and
adaptive mobile rows do not exist.

- [ ] **Step 3: Add the List/Board header and progressive filters**

In `IssuesPage`, add `useLocation`, a boolean `advancedFiltersOpen`, and the
shared tabs. Keep search, status, and assignee in the primary toolbar. Move
priority, type, customer, label, and remaining filters into:

```tsx
<button
  className="button button-ghost"
  type="button"
  aria-expanded={advancedFiltersOpen}
  aria-controls="issue-advanced-filters"
  onClick={() => setAdvancedFiltersOpen((open) => !open)}
>
  <ListFilter size={14} /> {t("ui.moreFilters")}
  {activeAdvancedFilterCount > 0 ? (
    <span className="filter-count">{activeAdvancedFilterCount}</span>
  ) : null}
</button>
<div
  id="issue-advanced-filters"
  className="issue-advanced-filters"
  role="region"
  aria-label={t("ui.advancedFilters")}
  hidden={!advancedFiltersOpen}
>
  {advancedFilterControls}
</div>
```

`activeAdvancedFilterCount` counts non-default values directly during render;
do not synchronize it through an effect.

- [ ] **Step 4: Render separate desktop and mobile issue collections**

Keep the existing table behavior under `.issues-desktop-table`. Add a semantic
mobile list whose button opens the same issue callback:

```tsx
<div className="issues-mobile-list" aria-label={t("ui.issueList")}>
  {filtered.map((issue) => (
    <button
      className="issue-mobile-row"
      type="button"
      key={issue.id}
      onClick={() => onOpenIssue(issue.id)}
    >
      <span className="issue-mobile-row-top">
        <code>{issue.identifier}</code>
        <StatusPill status={issue.status} />
      </span>
      <strong>{issue.title}</strong>
      <span className="issue-mobile-row-meta">
        <PriorityDot priority={issue.priority} showLabel />
        <span>{assigneeLabel(issue.assignee)}</span>
        <time>{issue.updatedAt}</time>
      </span>
    </button>
  ))}
</div>
```

Use existing data display primitives; do not duplicate status translation
logic.

- [ ] **Step 5: Recompose Board and My work headers**

For `fixedMode="shared"`, title the page Issues/Casos, render the List/Board
tabs, remove the Shared/Personal switch, and keep New issue as the single
primary action. For `fixedMode="personal"`, title the page My work/Meu
trabalho, omit issue view tabs, and retain Today/Week/All, task creation, and
event behavior.

The desktop board wrapper must be:

```tsx
<div className="kanban-board-scroll" tabIndex={0} aria-label={t("ui.board")}>
  <DesktopBoard />
</div>
```

On mobile shared mode, render the existing issues grouped by status in
`.kanban-mobile-status-list`; keep quick status actions but do not render six
draggable columns.

- [ ] **Step 6: Apply exact responsive geometry**

In `kanban.css`:

```css
.kanban-board-scroll {
  min-width: 0;
  overflow-x: auto;
  overscroll-behavior-inline: contain;
}

.kanban-board {
  display: grid;
  width: max-content;
  grid-template-columns: repeat(6, 220px);
  gap: var(--space-2);
}

@container issue-workspace (min-width: 1080px) {
  .kanban-board {
    width: 100%;
    min-width: 1080px;
    grid-template-columns: repeat(6, minmax(180px, 1fr));
    gap: max(0px, min(var(--space-2), calc((100% - 1080px) / 5)));
  }
}

@media (max-width: 650px) {
  .kanban-desktop-view {
    display: none;
  }

  .kanban-mobile-status-list {
    display: grid;
    gap: var(--space-3);
  }
}
```

Set `container: issue-workspace / inline-size` on the shared Issues/Board page
content. At exactly 1080px the six 180px columns use no gap; the gap grows to
the normal token as width becomes available. Below 1080px, six fixed 220px
columns live inside the explicit scroll wrapper. Update the E2E to assert
computed `display: grid`, six computed columns, `scrollWidth <= clientWidth` at
a 1440px viewport, and `scrollWidth > clientWidth` at the compact desktop
viewport before the mobile grouped-list breakpoint.

The feature page root must use that exact `issue-workspace` container name; do
not substitute the generic `workspace-page` name because the Board query would
never match. In `issues.css`, show desktop table above 650px and mobile rows
at/below 650px.

- [ ] **Step 7: Add bilingual copy**

Add matching locale keys for `ui.list`, `ui.board`, `ui.moreFilters`,
`ui.advancedFilters`, `ui.issueList`, and the My work labels. Use `Issues` /
`Casos`; keep internal identifiers and domain values unchanged.

- [ ] **Step 8: Verify Task 2 and commit**

Run:

```powershell
npx playwright test e2e/issues-workspace-refactor.spec.ts
npm run i18n:check
npm run typecheck
git diff --check
```

Expected: all commands exit 0. Commit:

```powershell
git add src/features/issues src/features/kanban src/styles/features/issues.css src/styles/features/kanban.css src/i18n/locales/en-US/issues.json src/i18n/locales/pt-BR/issues.json src/i18n/locales/en-US/kanban.json src/i18n/locales/pt-BR/kanban.json e2e/issues-workspace-refactor.spec.ts
git commit -m "refactor: unite issues list and board"
```

---

### Task 3: Add Inbox case context and mobile response path

**Files:**

- Create: `src/features/inbox/components/InboxCaseContext.tsx`
- Modify: `src/features/inbox/pages/InboxPage.tsx`
- Modify: `src/styles/features/inbox.css`
- Modify: `src/i18n/locales/en-US/inbox.json`
- Modify: `src/i18n/locales/pt-BR/inbox.json`
- Create: `e2e/inbox-context-refactor.spec.ts`

**Interfaces:**

- Produces `InboxCaseContext` with props
  `{ conversation, issue, open, onClose, onOpenIssue, children }`.
- Preserves all existing conversation, message, AI mode, draft insertion,
  media, assignment, and send callbacks.
- Produces `.inbox-case-context`, `.inbox-context-trigger`, and
  `.inbox-context-backdrop` selectors.

- [ ] **Step 1: Write failing desktop and mobile Inbox tests**

Create `e2e/inbox-context-refactor.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mend.interface-language", "en-US");
  });
});

test("desktop Inbox keeps active case context beside the conversation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/inbox?demo=1");
  const context = page.getByRole("complementary", { name: "Case context" });
  await expect(context).toBeVisible();
  await expect(context.getByText("TEC-24", { exact: false })).toBeVisible();
  await expect(context.getByText("Next action", { exact: true })).toBeVisible();
});

test("mobile founder can open context and return to the reply composer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/inbox?demo=1");
  await page
    .getByRole("button", { name: /Open conversation with/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Open case context" }).click();
  await expect(
    page.getByRole("complementary", { name: "Case context" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close case context" }).click();
  await expect(page.getByPlaceholder("Write a reply…")).toBeVisible();
  expect(
    await page.evaluate(() => document.body.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
```

- [ ] **Step 2: Run the Inbox E2E and verify RED**

Run:

```powershell
npx playwright test e2e/inbox-context-refactor.spec.ts
```

Expected: FAIL because no complementary case context or context trigger exists.

- [ ] **Step 3: Create the context rail component**

Implement the structural component without duplicating AI decision logic:

```tsx
import type { ReactNode } from "react";
import { X } from "lucide-react";
import type { Conversation, Issue } from "../../../types";

export function InboxCaseContext({
  conversation,
  issue,
  open,
  onClose,
  onOpenIssue,
  children,
}: {
  conversation: Conversation;
  issue?: Issue;
  open: boolean;
  onClose: () => void;
  onOpenIssue: (issueId: string) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation("inbox");
  return (
    <aside
      className={`inbox-case-context ${open ? "open" : ""}`}
      aria-label={t("context.title")}
    >
      <header className="inbox-case-context-header">
        <div>
          <span className="page-kicker">{t("context.eyebrow")}</span>
          <h2>{t("context.title")}</h2>
        </div>
        <button
          className="icon-button subtle inbox-context-close"
          type="button"
          aria-label={t("context.close")}
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </header>
      <section className="inbox-case-next-action">
        <span>{t("context.nextAction")}</span>
        <strong>
          {issue ? t("context.followIssue") : t("context.reviewTriage")}
        </strong>
      </section>
      {issue ? (
        <button
          className="inbox-linked-case"
          type="button"
          onClick={() => onOpenIssue(issue.id)}
        >
          <code>{issue.identifier}</code>
          <strong>{issue.title}</strong>
          <span>{issue.status}</span>
        </button>
      ) : null}
      <div className="inbox-case-ai">{children}</div>
      <footer>
        {conversation.automationState === "human_paused"
          ? t("context.human")
          : t("context.ai")}
      </footer>
    </aside>
  );
}
```

Import `useTranslation`; translate the rendered issue status through the
existing common status mapping rather than leaving `issue.status` raw in the
final implementation.

- [ ] **Step 4: Recompose `InboxPage` into three regions**

Add `contextOpen` state. Keep the conversation rail and message panel behavior,
but place the existing AI decision and draft cards inside `InboxCaseContext`.
Add an `aria-expanded` context trigger to the conversation header at widths
where the rail is not persistent. The root layout is:

```tsx
<div className="inbox-layout">
  <section className="conversation-rail">{conversationRail}</section>
  <section className="conversation-panel">{conversationThread}</section>
  <InboxCaseContext>{aiCards}</InboxCaseContext>
</div>
```

The sticky composer remains inside `conversation-panel`; do not move message
state or send effects into the new component.

- [ ] **Step 5: Apply desktop, compact, and mobile geometry**

Use exact grid behavior:

```css
.inbox-layout {
  grid-template-columns: minmax(280px, 320px) minmax(0, 1fr) minmax(
      260px,
      290px
    );
}

.inbox-case-context {
  min-width: 0;
  border-left: 1px solid var(--line-strong);
  background: var(--surface);
}

.inbox-context-trigger,
.inbox-context-close {
  display: none;
}

@media (max-width: 1279px) {
  .inbox-layout {
    grid-template-columns: minmax(280px, 320px) minmax(0, 1fr);
  }

  .inbox-context-trigger,
  .inbox-context-close {
    display: inline-grid;
  }

  .inbox-case-context {
    position: fixed;
    inset: var(--mobile-topbar-height, 0) 0 0 auto;
    z-index: var(--z-drawer);
    width: min(360px, 100vw);
    transform: translateX(100%);
    transition: transform var(--duration-normal) var(--ease);
  }

  .inbox-case-context.open {
    transform: translateX(0);
  }
}

@media (max-width: 650px) {
  .inbox-layout,
  .inbox-layout.mobile-conversation-open {
    grid-template-columns: minmax(0, 1fr);
  }

  .inbox-case-context {
    width: 100vw;
  }

  .composer {
    padding-bottom: max(var(--space-3), env(safe-area-inset-bottom));
  }
}
```

Preserve existing mobile list/detail visibility rules and reduced-motion
fallbacks.

- [ ] **Step 6: Add bilingual context copy**

Add the `context` keys used above plus accessible labels for opening and
closing context. Keep copy concise and action-oriented in both locales.

- [ ] **Step 7: Verify Task 3 and commit**

Run:

```powershell
npx playwright test e2e/inbox-context-refactor.spec.ts
npm run i18n:check
npm run typecheck
git diff --check
```

Expected: all commands exit 0. Commit:

```powershell
git add src/features/inbox src/styles/features/inbox.css src/i18n/locales/en-US/inbox.json src/i18n/locales/pt-BR/inbox.json e2e/inbox-context-refactor.spec.ts
git commit -m "refactor: surface active case context in inbox"
```

---

### Task 4: Make engineering runs mobile-supervisable

**Files:**

- Create: `src/features/runs/run-selection.ts`
- Create: `src/features/runs/run-selection.test.ts`
- Modify: `src/features/runs/pages/RunsPage.tsx`
- Modify: `src/styles/features/runs.css`
- Modify: `src/i18n/locales/en-US/runs.json`
- Modify: `src/i18n/locales/pt-BR/runs.json`
- Create: `e2e/runs-mobile-refactor.spec.ts`

**Interfaces:**

- Produces
  `selectRun(runs: CodingRun[], requestedId: string | null): CodingRun | null`.
- `RunsPage` reads/writes `?run=<id>` and preserves other search params.
- Produces `.run-loop-track-mobile` behavior through responsive CSS and
  `.run-mobile-decision-bar` for state-authorized decisions.

- [ ] **Step 1: Write the failing run-selection unit test**

Create `run-selection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CodingRun } from "../../types";
import { selectRun } from "./run-selection";

const runs = [
  { id: "run-current", status: "Running" },
  { id: "run-complete", status: "Completed" },
] as CodingRun[];

describe("selectRun", () => {
  it("honors a valid deep link and falls back to the first run", () => {
    expect(selectRun(runs, "run-complete")?.id).toBe("run-complete");
    expect(selectRun(runs, "missing")?.id).toBe("run-current");
    expect(selectRun([], "run-current")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the unit test and verify RED**

Run:

```powershell
npm test -- src/features/runs/run-selection.test.ts
```

Expected: FAIL because `run-selection.ts` is missing.

- [ ] **Step 3: Implement selection and URL state**

Create the helper:

```ts
import type { CodingRun } from "../../types";

export function selectRun(
  runs: CodingRun[],
  requestedId: string | null,
): CodingRun | null {
  return runs.find((run) => run.id === requestedId) ?? runs[0] ?? null;
}
```

In `RunsPage`, use `useSearchParams`; derive `selectedRun` with `selectRun` in
render. When a ledger row is chosen, clone the current params, set `run`, and
call `setSearchParams`. Do not mirror the selected object in another effect.

- [ ] **Step 4: Run the unit test and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Write failing mobile supervision E2E coverage**

Create `e2e/runs-mobile-refactor.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("mobile run deep links expose a vertical case chain and current action", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mend.interface-language", "en-US");
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/agent-runs?demo=1&run=run-204");
  await expect(page).toHaveURL(/run=run-204/);
  await expect(page.getByRole("heading", { name: /TEC-24/ })).toBeVisible();
  const progress = page.getByRole("list", { name: "Case progress" });
  await expect(progress).toHaveCSS("flex-direction", "column");
  await expect(page.getByText("Current stage", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => document.body.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
```

`run-204` is the seeded running `Propose fix` run for `TEC-24`; assert its 68%
progress or `investigation` current stage so this test cannot silently select a
different run.

- [ ] **Step 6: Run the mobile E2E and verify RED**

Run:

```powershell
npx playwright test e2e/runs-mobile-refactor.spec.ts --project=mobile
```

Expected: FAIL because query selection and vertical progress do not exist.

- [ ] **Step 7: Recompose run summary and responsive progress**

Keep the desktop ledger/detail composition. Add a mobile summary above the case
chain with issue identifier, current stage, latest meaningful event, elapsed
time, and decision state. Reuse existing run fields; do not synthesize events.

At `<=650px`, convert the existing ordered stage list:

```css
.run-loop-track {
  display: grid;
  grid-template-columns: repeat(14, minmax(76px, 1fr));
  overflow-x: auto;
}

@media (max-width: 650px) {
  .run-loop-track {
    display: flex;
    flex-direction: column;
    gap: 0;
    overflow: visible;
  }

  .run-loop-track li {
    min-height: 48px;
    grid-template-columns: 24px minmax(0, 1fr);
  }

  .run-mobile-decision-bar {
    position: sticky;
    bottom: calc(
      var(--mobile-bottom-nav-height, 62px) + env(safe-area-inset-bottom)
    );
    z-index: var(--z-sticky);
    min-height: var(--mobile-touch-target);
  }
}
```

Render `.run-mobile-decision-bar` only when the current run already exposes an
allowed approve/reject/retry/cancel/merge/deploy/health/customer action. Reuse
the existing callbacks and pending states.

- [ ] **Step 8: Add bilingual supervision copy**

Add keys for `mobile.currentStage`, `mobile.latestEvent`,
`mobile.decisionRequired`, `mobile.noDecision`, and the `Case progress` aria
label in both locales.

- [ ] **Step 9: Verify Task 4 and commit**

Run:

```powershell
npm test -- src/features/runs/run-selection.test.ts
npx playwright test e2e/runs-mobile-refactor.spec.ts
npm run i18n:check
npm run typecheck
git diff --check
```

Expected: all commands exit 0. Commit:

```powershell
git add src/features/runs src/styles/features/runs.css src/i18n/locales/en-US/runs.json src/i18n/locales/pt-BR/runs.json e2e/runs-mobile-refactor.spec.ts
git commit -m "refactor: make runs mobile supervisable"
```

---

### Task 5: Make Knowledge scan-first with responsive detail

**Files:**

- Create: `src/features/knowledge/components/KnowledgeCollection.tsx`
- Modify: `src/features/knowledge/pages/KnowledgePage.tsx`
- Modify: `src/features/knowledge/pages/KnowledgeWorkspacePage.tsx`
- Modify: `src/styles/features/knowledge.css`
- Modify: `src/i18n/locales/en-US/knowledge.json`
- Modify: `src/i18n/locales/pt-BR/knowledge.json`
- Create: `e2e/knowledge-refactor.spec.ts`

**Interfaces:**

- Produces `KnowledgeCollection` with
  `{ articles, selectedId, onSelect, actionsFor? }`.
- Demo and live pages keep their current state and persistence behavior; only
  collection/detail presentation is shared.

- [ ] **Step 1: Write failing responsive Knowledge tests**

Create `e2e/knowledge-refactor.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mend.interface-language", "en-US");
  });
});

test("desktop Knowledge opens a scan-first adjacent preview", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/knowledge?demo=1");
  await page
    .getByRole("button", { name: /Handle pending Pix payments/ })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Article preview" }),
  ).toBeVisible();
  await expect(
    page.getByText("Available to AI", { exact: true }),
  ).toBeVisible();
});

test("mobile Knowledge uses one column without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/knowledge?demo=1");
  await expect(page.locator(".knowledge-collection")).toBeVisible();
  expect(
    await page.evaluate(() => document.body.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
```

- [ ] **Step 2: Run the Knowledge E2E and verify RED**

Run:

```powershell
npx playwright test e2e/knowledge-refactor.spec.ts
```

Expected: FAIL because rows are not selectable and no preview exists.

- [ ] **Step 3: Create the shared collection presentation**

`KnowledgeCollection` renders a two-region shell and uses the existing
`StatusArticle` primitive:

```tsx
<div className="knowledge-workspace">
  <div className="knowledge-collection" aria-label={t("ui.articleList")}>
    {articles.map((article) => (
      <button
        className={
          article.id === selectedId ? "knowledge-row selected" : "knowledge-row"
        }
        type="button"
        key={article.id}
        onClick={() => onSelect(article.id)}
      >
        <span className="knowledge-row-main">
          <strong>{article.title}</strong>
          <span>{article.excerpt}</span>
        </span>
        <span className="knowledge-row-state">
          <StatusArticle status={article.status} />
          <small>{article.category}</small>
        </span>
      </button>
    ))}
  </div>
  {selected ? (
    <aside className="knowledge-preview" aria-label={t("ui.preview")}>
      <header>
        <StatusArticle status={selected.status} />
        <span>
          {selected.status === "Published"
            ? t("ui.availableToAi")
            : t("ui.internalDraft")}
        </span>
      </header>
      <h2>{selected.title}</h2>
      <p>{selected.excerpt}</p>
      {actionsFor ? actionsFor(selected) : null}
    </aside>
  ) : null}
</div>
```

Use the selected article derived from `articles.find`; do not store a duplicate
article object.

- [ ] **Step 4: Integrate demo and live pages**

Add `selectedArticleId` to each page. Preserve demo article creation and live
save/delete/editor behavior. After creating an article, select its id. After
deleting the selected article, select the first remaining id or `null`.

At content widths `>=1100px`, use a `minmax(0, 1fr) minmax(300px, 380px)`
grid. Below 1100px, preview becomes a full-width region after the list. At
`<=650px`, selecting a row shows a full-screen detail with an explicit Back
button and 44px actions.

- [ ] **Step 5: Add bilingual eligibility and preview copy**

Add exact matching keys for `ui.articleList`, `ui.preview`,
`ui.availableToAi`, `ui.internalDraft`, and `ui.backToArticles`.

- [ ] **Step 6: Verify Task 5 and commit**

Run:

```powershell
npx playwright test e2e/knowledge-refactor.spec.ts
npm run i18n:check
npm run typecheck
git diff --check
```

Expected: all commands exit 0. Commit:

```powershell
git add src/features/knowledge src/styles/features/knowledge.css src/i18n/locales/en-US/knowledge.json src/i18n/locales/pt-BR/knowledge.json e2e/knowledge-refactor.spec.ts
git commit -m "refactor: add scan-first knowledge workspace"
```

---

### Task 6: Replace Settings taxonomy and preserve legacy routes

**Files:**

- Modify: `src/features/settings/settings-navigation.ts`
- Modify: `src/features/settings/settings-navigation.test.ts`
- Modify: `src/features/settings/components/SettingsLayout.tsx`
- Modify: `src/features/settings/pages/SettingsWorkspacePage.tsx`
- Modify: `src/i18n/locales/en-US/settings.json`
- Modify: `src/i18n/locales/pt-BR/settings.json`
- Modify: `e2e/settings.spec.ts`

**Interfaces:**

- Replaces route ids with `overview`, `team`, `audit`, `whatsapp`,
  `automation`, `repositories`, `agents`, and `integrations`.
- Each nav item provides a canonical `path` and `matchPrefix`.
- Produces `legacySettingsRoute(pathname: string, search: string): string | null`
  in addition to the existing legacy `tab` mapping.
- Settings routes use the exact canonical paths from the design spec.

- [ ] **Step 1: Replace the navigation unit expectations before production**

Update `settings-navigation.test.ts` first:

```ts
it("keeps settings outcome-oriented and compact", () => {
  expect(
    settingsNavigation.map((group) => ({
      id: group.id,
      items: group.items.map((item) => item.id),
    })),
  ).toEqual([
    { id: "workspace", items: ["overview", "team", "audit"] },
    { id: "support", items: ["whatsapp", "automation"] },
    { id: "engineering", items: ["repositories", "agents"] },
    { id: "connections", items: ["integrations"] },
  ]);
});

it("matches nested settings pages to one stable navigation item", () => {
  expect(findSettingsNavItem("/settings/automation/intake").id).toBe(
    "automation",
  );
  expect(
    findSettingsNavItem("/settings/engineering/agents/run-policy").id,
  ).toBe("agents");
  expect(findSettingsNavItem("/settings/integrations/mcp").id).toBe(
    "integrations",
  );
});

it("redirects old implementation-shaped routes", () => {
  expect(
    legacySettingsRoute("/settings/engineering/coding/connections", "?demo=1"),
  ).toBe("/settings/engineering/agents/providers?demo=1");
  expect(legacySettingsRoute("/settings/automation/flows", "?demo=1")).toBe(
    "/settings/automation/intake?demo=1",
  );
});
```

- [ ] **Step 2: Run the Settings unit test and verify RED**

Run:

```powershell
npm test -- src/features/settings/settings-navigation.test.ts
```

Expected: FAIL because the old 13-item taxonomy remains.

- [ ] **Step 3: Implement the exact navigation model**

Use this shape:

```ts
export interface SettingsNavItem {
  id: SettingsRouteId;
  path: string;
  matchPrefix: string;
  icon: LucideIcon;
}
```

The canonical items are:

```ts
[
  ["overview", "/settings", "/settings"],
  ["team", "/settings/team", "/settings/team"],
  ["audit", "/settings/audit", "/settings/audit"],
  ["whatsapp", "/settings/channels/whatsapp", "/settings/channels/whatsapp"],
  ["automation", "/settings/automation/replies", "/settings/automation"],
  [
    "repositories",
    "/settings/engineering/repositories",
    "/settings/engineering/repositories",
  ],
  [
    "agents",
    "/settings/engineering/agents/providers",
    "/settings/engineering/agents",
  ],
  ["integrations", "/settings/integrations", "/settings/integrations"],
] as const;
```

Keep display copy entirely in locale catalogs. `findSettingsNavItem` compares
`matchPrefix`, selecting the longest match, and special-cases exact `/settings`
so Overview does not capture every route.

- [ ] **Step 4: Implement legacy route redirects and canonical routes**

`legacySettingsRoute` preserves every query parameter and maps:

```text
/settings/automation/ai → /settings/automation/replies
/settings/automation/flows → /settings/automation/intake
/settings/engineering/coding/connections → /settings/engineering/agents/providers
/settings/engineering/coding/routing → /settings/engineering/agents/run-policy
```

The `SettingsWorkspacePage` checks both the legacy `tab` query and legacy
pathname before rendering routes. Register canonical routes for replies,
intake, providers, and run-policy while preserving integration detail routes.

- [ ] **Step 5: Update layout copy and navigation rendering**

`SettingsLayout` maps only four group ids and eight item ids. Breadcrumbs use
the active item label. Mobile selector options use canonical item paths.
Remove hardcoded English `label` and `description` fields from the navigation
configuration.

- [ ] **Step 6: Update Settings E2E before implementation is considered green**

Change `e2e/settings.spec.ts` expectations to:

```ts
await expect(
  page.getByRole("link", { name: "Agents & models", exact: true }),
).toBeVisible();
await expect(page.getByRole("link", { name: "GitHub" })).toHaveCount(0);
await page.getByRole("link", { name: "Agents & models" }).click();
await expect(page).toHaveURL(
  /\/settings\/engineering\/agents\/providers\?demo=1/,
);
```

Add a legacy route test for Coding connections and a mobile selector test for
Automation. Run the test once before production changes to confirm RED, then
again after Steps 3–5.

- [ ] **Step 7: Add bilingual taxonomy**

Use these labels:

| id           | `en-US`         | `pt-BR`               |
| ------------ | --------------- | --------------------- |
| overview     | Overview        | Visão geral           |
| team         | Team            | Equipe                |
| audit        | Audit log       | Registro de auditoria |
| whatsapp     | WhatsApp        | WhatsApp              |
| automation   | Automation      | Automação             |
| repositories | Repositories    | Repositórios          |
| agents       | Agents & models | Agentes e modelos     |
| integrations | Integrations    | Integrações           |

Group labels are Workspace/Espaço de trabalho, Support/Suporte,
Engineering/Engenharia, and Connections/Conexões.

- [ ] **Step 8: Verify Task 6 and commit**

Run:

```powershell
npm test -- src/features/settings/settings-navigation.test.ts
npx playwright test e2e/settings.spec.ts
npm run i18n:check
npm run typecheck
git diff --check
```

Expected: all commands exit 0. Commit:

```powershell
git add src/features/settings/settings-navigation.ts src/features/settings/settings-navigation.test.ts src/features/settings/components/SettingsLayout.tsx src/features/settings/pages/SettingsWorkspacePage.tsx src/i18n/locales/en-US/settings.json src/i18n/locales/pt-BR/settings.json e2e/settings.spec.ts
git commit -m "refactor: simplify settings navigation"
```

---

### Task 7: Consolidate Settings controls around user decisions

**Files:**

- Modify: `src/features/settings/pages/SettingsAutomationPage.tsx`
- Modify: `src/features/settings/pages/SettingsEngineeringPages.tsx`
- Modify: `src/features/settings/pages/SettingsIntegrationPages.tsx`
- Modify: `src/features/settings/pages/SettingsWorkspacePage.tsx`
- Modify: `src/features/settings/components/SettingsShared.tsx`
- Modify: `src/styles/features/settings.css`
- Modify: `src/i18n/locales/en-US/settings.json`
- Modify: `src/i18n/locales/pt-BR/settings.json`
- Create: `e2e/settings-content-refactor.spec.ts`

**Interfaces:**

- Consumes `ViewTabs` from Task 1 and canonical routes from Task 6.
- Produces `SettingsAutomationPage` sections `replies | intake`.
- Produces `SettingsAgentsPage` sections `providers | run-policy` while reusing
  the existing connection/routing implementations.
- Provider collection becomes a semantic table on desktop and comparison rows
  on mobile; APIs and connection records remain unchanged.

- [ ] **Step 1: Write failing Settings content E2E**

Create `e2e/settings-content-refactor.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mend.interface-language", "en-US");
  });
});

test("Automation separates customer replies from intake", async ({ page }) => {
  await page.goto("/settings/automation/replies?demo=1");
  await expect(page.getByRole("link", { name: "Replies" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.getByRole("link", { name: "Intake" }).click();
  await expect(page).toHaveURL(/\/settings\/automation\/intake/);
});

test("Agents and models separates providers from run policy", async ({
  page,
}) => {
  await page.goto("/settings/engineering/agents/providers?demo=1");
  await expect(
    page.getByRole("heading", { name: "Agents & models" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Providers" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.getByRole("link", { name: "Run policy" }).click();
  await expect(page).toHaveURL(/\/settings\/engineering\/agents\/run-policy/);
});

test("integration providers remain details, not sidebar destinations", async ({
  page,
}) => {
  await page.goto("/settings/integrations?demo=1");
  await expect(page.getByRole("link", { name: "GitHub" })).toBeVisible();
  await expect(
    page.locator(".settings-v2-nav").getByText("GitHub"),
  ).toHaveCount(0);
});
```

- [ ] **Step 2: Run the Settings content E2E and verify RED**

Run:

```powershell
npx playwright test e2e/settings-content-refactor.spec.ts
```

Expected: FAIL because the new local tabs and headings do not exist.

- [ ] **Step 3: Recompose Automation with one page header and local tabs**

`SettingsAutomationPage` receives the route section and renders one shared
header:

```tsx
<div className="settings-v2-page">
  <SettingsPageHeader
    title={t("v2.automation.title")}
    description={t("v2.automation.description")}
  />
  <ViewTabs
    label={t("v2.automation.sections")}
    items={[
      {
        id: "replies",
        label: t("v2.automation.replies"),
        href: "/settings/automation/replies" + search,
        active: section === "replies",
      },
      {
        id: "intake",
        label: t("v2.automation.intake"),
        href: "/settings/automation/intake" + search,
        active: section === "intake",
      },
    ]}
  />
  {section === "intake" ? <IntakeSettings /> : <ReplySettings />}
</div>
```

Remove duplicate child page headers. Keep all existing save, policy,
confirmation, and flow state behavior.

- [ ] **Step 4: Add `SettingsAgentsPage` as a composition wrapper**

In `SettingsEngineeringPages.tsx`, export:

```tsx
export function SettingsAgentsPage({
  section,
  ...props
}: SettingsWorkspacePageProps & { section: "providers" | "run-policy" }) {
  const { search } = useLocation();
  const { t } = useTranslation("settings");
  return (
    <div className="settings-v2-page">
      <SettingsPageHeader
        title={t("v2.agents.title")}
        description={t("v2.agents.description")}
      />
      <ViewTabs
        label={t("v2.agents.sections")}
        items={[
          {
            id: "providers",
            label: t("v2.agents.providers"),
            href: `/settings/engineering/agents/providers${search}`,
            active: section === "providers",
          },
          {
            id: "run-policy",
            label: t("v2.agents.runPolicy"),
            href: `/settings/engineering/agents/run-policy${search}`,
            active: section === "run-policy",
          },
        ]}
      />
      {section === "providers" ? (
        <CodingProvidersContent {...props} />
      ) : (
        <CodingRunPolicyContent {...props} />
      )}
    </div>
  );
}
```

Extract the current page bodies into the two content components without
changing data fetching or mutations. Routes pass the literal section.

- [ ] **Step 5: Replace provider cards with comparison rows**

Render connected providers as a semantic desktop table using the existing
shadcn table primitive:

```tsx
<Table className="settings-provider-table">
  <TableHeader>
    <TableRow>
      <TableHead>{t("v2.agents.connection")}</TableHead>
      <TableHead>{t("v2.agents.authentication")}</TableHead>
      <TableHead>{t("v2.agents.catalog")}</TableHead>
      <TableHead>{t("v2.agents.automation")}</TableHead>
      <TableHead>{t("v2.agents.status")}</TableHead>
      <TableHead className="settings-provider-actions">
        {t("v2.agents.actions")}
      </TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>{providerRows}</TableBody>
</Table>
```

Each row retains its own record id, label, provider/auth metadata, catalog
count, automation checkbox, status, verify/catalog/revoke actions, and shared
confirmation. Do not merge duplicate labels. At `<=650px`, hide the table
header and display each row as a labeled comparison grid with a single action
menu.

- [ ] **Step 6: Keep integration providers in the directory**

The Integrations landing remains a status directory and links to existing
GitHub, Google Calendar, and MCP detail routes. Add visible Connected / Needs
attention / Not configured text plus icon. Do not add provider items back to
the Settings sidebar.

- [ ] **Step 7: Add bilingual outcome-oriented copy**

Add `v2.automation.*` and `v2.agents.*` keys used above. Replace user-visible
“coding connections” with Providers and “coding routing” with Run policy.
Technical provider names and model ids remain unchanged.

- [ ] **Step 8: Verify Task 7 and commit**

Run:

```powershell
npx playwright test e2e/settings-content-refactor.spec.ts
npm run i18n:check
npm run typecheck
git diff --check
```

Expected: all commands exit 0. Commit:

```powershell
git add src/features/settings src/styles/features/settings.css src/i18n/locales/en-US/settings.json src/i18n/locales/pt-BR/settings.json e2e/settings-content-refactor.spec.ts
git commit -m "refactor: organize settings by founder decisions"
```

---

### Task 8: Turn the landing specimen into interactive case playback

**Files:**

- Create: `src/features/marketing/playback.ts`
- Create: `src/features/marketing/playback.test.ts`
- Modify: `src/features/marketing/LandingPage.tsx`
- Modify: `src/styles/features/marketing.css`
- Modify: `src/i18n/locales/en-US/marketing.json`
- Modify: `src/i18n/locales/pt-BR/marketing.json`
- Modify: `e2e/mvp.spec.ts`

**Interfaces:**

- Produces `playbackScenes`, `PlaybackSceneId`, and
  `nextPlaybackScene(scene: PlaybackSceneId): PlaybackSceneId`.
- `ProductWindow` owns scene/play/pause/interaction state but no external data.
- Scene controls expose `aria-current`; the product window exposes
  `data-scene` and `data-playing` for CSS and verification.

- [ ] **Step 1: Write the failing playback unit test**

Create `playback.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextPlaybackScene, playbackScenes } from "./playback";

describe("marketing playback", () => {
  it("advances through the support loop and wraps", () => {
    expect(playbackScenes).toEqual([
      "signal",
      "context",
      "investigate",
      "verify",
    ]);
    expect(nextPlaybackScene("signal")).toBe("context");
    expect(nextPlaybackScene("verify")).toBe("signal");
  });
});
```

- [ ] **Step 2: Run the unit test and verify RED**

Run:

```powershell
npm test -- src/features/marketing/playback.test.ts
```

Expected: FAIL because `playback.ts` is missing.

- [ ] **Step 3: Implement playback metadata**

Create:

```ts
export const playbackScenes = [
  "signal",
  "context",
  "investigate",
  "verify",
] as const;

export type PlaybackSceneId = (typeof playbackScenes)[number];

export function nextPlaybackScene(scene: PlaybackSceneId): PlaybackSceneId {
  const index = playbackScenes.indexOf(scene);
  return playbackScenes[(index + 1) % playbackScenes.length];
}
```

- [ ] **Step 4: Run the unit test and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Add failing interactive and reduced-motion E2E coverage**

Extend the landing test in `e2e/mvp.spec.ts`:

```ts
test("landing product proof can play and select support-loop scenes", async ({
  page,
}) => {
  await page.goto("/");
  const playback = page.getByLabel("Interactive Mend case playback");
  await expect(playback).toHaveAttribute("data-scene", "signal");
  await page.getByRole("button", { name: "Investigate" }).click();
  await expect(playback).toHaveAttribute("data-scene", "investigate");
  await page.getByRole("button", { name: "Pause playback" }).click();
  await expect(playback).toHaveAttribute("data-playing", "false");
});

test("reduced motion keeps playback static and manually selectable", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const playback = page.getByLabel("Interactive Mend case playback");
  await expect(playback).toHaveAttribute("data-playing", "false");
  await page.waitForTimeout(3400);
  await expect(playback).toHaveAttribute("data-scene", "signal");
  await page.getByRole("button", { name: "Verified reply" }).click();
  await expect(playback).toHaveAttribute("data-scene", "verify");
});
```

- [ ] **Step 6: Run the new landing E2E and verify RED**

Run:

```powershell
npx playwright test e2e/mvp.spec.ts --grep "playback|reduced motion" --project=desktop
```

Expected: FAIL because controls and playback state do not exist.

- [ ] **Step 7: Implement the four-scene React state machine**

Hoist scene metadata outside `ProductWindow`. Inside, initialize reduced-motion
and playback state, then use one interval only while playback is active:

```tsx
const [scene, setScene] = useState<PlaybackSceneId>("signal");
const [reducedMotion, setReducedMotion] = useState(
  () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
);
const [playing, setPlaying] = useState(() => !reducedMotion);
const [interacting, setInteracting] = useState(false);

useEffect(() => {
  if (!playing || interacting || reducedMotion) return undefined;
  const timer = window.setInterval(
    () => setScene((current) => nextPlaybackScene(current)),
    3200,
  );
  return () => window.clearInterval(timer);
}, [interacting, playing, reducedMotion]);
```

Subscribe to the media query `change` event and stop playback when reduced
motion becomes true. The playback root receives `data-scene`, `data-playing`,
pointer enter/leave, and focus-within handlers. When focus leaves the root,
resume only if the user has not manually paused.

- [ ] **Step 8: Render semantic scene and play controls**

Use four buttons labeled from i18n and one Play/Pause button. Scene selection
sets the scene without forcing autoplay. The existing specimen nodes gain
scene-state classes; no duplicate screenshot tree is introduced.

Add one simulated cursor element whose position is determined by
`data-scene`. CSS animates only transform and opacity. Under reduced motion,
hide the cursor and remove scene transition duration.

- [ ] **Step 9: Add bilingual playback copy and responsive styling**

Add labels for Signal, Context, Investigate, Verified reply, Play playback,
Pause playback, and the playback aria label. Controls remain reachable and
readable at 390px. No content depends on the simulated pointer.

- [ ] **Step 10: Verify Task 8 and commit**

Run:

```powershell
npm test -- src/features/marketing/playback.test.ts
npx playwright test e2e/mvp.spec.ts --grep "landing|playback|reduced motion"
npm run i18n:check
npm run typecheck
git diff --check
```

Expected: all commands exit 0. Commit:

```powershell
git add src/features/marketing src/styles/features/marketing.css src/i18n/locales/en-US/marketing.json src/i18n/locales/pt-BR/marketing.json e2e/mvp.spec.ts
git commit -m "feat: add interactive support-loop playback"
```

---

### Task 9: Connect the mobile founder journey and verify the whole product

**Files:**

- Create: `src/app/shell/notification-destination.ts`
- Create: `src/app/shell/notification-destination.test.ts`
- Modify: `src/app/shell/WorkspaceShell.tsx`
- Modify: `src/App.tsx`
- Modify: `src/features/issues/components/IssueOverlays.tsx`
- Modify: `src/styles/control-room.css`
- Modify: `e2e/mvp.spec.ts`
- Create: `e2e/mobile-founder-loop.spec.ts`
- Modify only if a verified regression requires it: feature files from Tasks
  2–8, with a failing regression test added first.

**Interfaces:**

- Produces
  `notificationDestination(notification, issues): string` using only sanitized
  notification rows and loaded issue DTOs.
- `NotificationCenter` consumes
  `resolveDestination(notification): string`; it does not learn issue domain
  mapping.
- Issue run rows navigate to `/agent-runs?run=<id>`.
- Final mobile journey links conversation → issue → run → issue/customer
  without returning to unrelated collection roots.

- [ ] **Step 1: Write the failing notification destination test**

Create `notification-destination.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { WorkspaceNotification } from "../../api/notifications";
import type { Issue } from "../../types";
import { notificationDestination } from "./notification-destination";

const notification = (entityType: string, entityId: string) =>
  ({ entity_type: entityType, entity_id: entityId }) as WorkspaceNotification;
const issues = [{ id: "issue-24", identifier: "TEC-24" }] as Issue[];

describe("notificationDestination", () => {
  it("opens the closest supported entity", () => {
    expect(
      notificationDestination(notification("conversation", "conv-1"), issues),
    ).toBe("/inbox?conversation=conv-1");
    expect(
      notificationDestination(notification("issue", "issue-24"), issues),
    ).toBe("/issues/TEC-24");
    expect(
      notificationDestination(notification("issue", "missing"), issues),
    ).toBe("/issues");
    expect(
      notificationDestination(notification("agent_run", "run-24"), issues),
    ).toBe("/agent-runs?run=run-24");
  });
});
```

- [ ] **Step 2: Run the unit test and verify RED**

Run:

```powershell
npm test -- src/app/shell/notification-destination.test.ts
```

Expected: FAIL because the helper is missing.

- [ ] **Step 3: Implement safe destination resolution**

Create:

```ts
import type { WorkspaceNotification } from "../../api/notifications";
import type { Issue } from "../../types";

export function notificationDestination(
  notification: WorkspaceNotification,
  issues: Issue[],
): string {
  const entityId = notification.entity_id;
  if (notification.entity_type === "conversation" && entityId)
    return `/inbox?conversation=${encodeURIComponent(entityId)}`;
  if (notification.entity_type === "issue" && entityId) {
    const issue = issues.find(
      (candidate) =>
        candidate.id === entityId || candidate.identifier === entityId,
    );
    return issue
      ? `/issues/${encodeURIComponent(issue.identifier)}`
      : "/issues";
  }
  if (
    (notification.entity_type === "agent_run" ||
      notification.entity_type === "run") &&
    entityId
  )
    return `/agent-runs?run=${encodeURIComponent(entityId)}`;
  return "/inbox";
}
```

Pass a resolver from `App` through desktop and mobile shell props. Keep marking
the notification read before navigation.

- [ ] **Step 4: Run the unit test and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Write the failing mobile founder-loop E2E**

Create `e2e/mobile-founder-loop.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("solo founder can follow a triaged customer case into its run and back", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mend.interface-language", "en-US");
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/issues/TEC-24?demo=1");
  await expect(
    page.getByText("TEC-24", { exact: false }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: /run-204/i }).click();
  await expect(page).toHaveURL(/\/agent-runs\?run=run-204/);
  await expect(page.getByText("Current stage", { exact: true })).toBeVisible();
  await expect(page.getByText(/68%|Investigation/).first()).toBeVisible();
  await page.getByRole("button", { name: "Open issue" }).click();
  await expect(
    page.getByText("TEC-24", { exact: false }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: /Cliente Exemplo/ }).click();
  await expect(page).toHaveURL(/\/inbox\?conversation=/);
  await expect(page.getByPlaceholder("Write a reply…")).toBeVisible();
  expect(
    await page.evaluate(() => document.body.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
```

Use the actual accessible name rendered by the existing `RunRow`; keep the
assertion tied to a visible run id/mode, not a CSS selector.

- [ ] **Step 6: Run the founder-loop E2E and verify RED**

Run:

```powershell
npx playwright test e2e/mobile-founder-loop.spec.ts --project=mobile
```

Expected: FAIL because the issue run row currently reopens the issue instead of
navigating to the run.

- [ ] **Step 7: Connect issue and run deep links**

In `IssueDetailPage`, change each issue run row to:

```tsx
<RunRow
  key={run.id}
  run={run}
  onClick={() => navigate(`/agent-runs?run=${encodeURIComponent(run.id)}`)}
/>
```

In Runs, keep Open issue using the existing issue callback; on mobile, ensure
the issue detail becomes the active full-screen surface rather than a clipped
desktop drawer. Preserve the linked customer conversation action.

- [ ] **Step 8: Run automated React best-practices review**

Review every modified TSX file against the requested Vercel checklist:

- route lazy loading remains intact;
- no new sequential independent requests;
- no inline component definitions;
- no effects used for derived view state;
- no repeated expensive array scans inside row loops when a map suffices;
- global listeners and media-query listeners are cleaned up;
- long lists do not receive speculative memoization or a new dependency.

Any correction begins with a focused regression test when behavior changes.

- [ ] **Step 9: Run the full automated gate**

Run in this order and stop on the first failure:

```powershell
npm test
npm run i18n:check
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run test:e2e
git diff --check
```

Expected: every command exits 0 with no failing tests or TypeScript/ESLint/
i18n/Prettier errors.

- [ ] **Step 10: Perform real-browser visual and interaction verification**

Start the app in demo mode and capture/review these routes at both `1440×900`
and `390×844`, first in dark mode and then in light mode:

```text
/
/inbox?demo=1
/issues?demo=1
/issues?view=board&demo=1
/my-work?demo=1
/agent-runs?demo=1
/knowledge?demo=1
/settings?demo=1
/settings/automation/replies?demo=1
/settings/engineering/agents/providers?demo=1
```

For each route verify first-content alignment, no horizontal page overflow,
keyboard focus, touch targets, reduced motion, selected state, semantic status
contrast, and that the current status/next action appears before raw detail on
mobile. Run the complete route matrix in `en-US`; repeat Inbox, Issues Board,
Runs, Knowledge, Automation, and Agents & models in `pt-BR` to exercise long
copy. Switch theme and language from Profile at least once without reloading and
assert that the current route, active tab, filters, selected record, and draft
state do not reset. Record screenshots under the plan's ignored SDD workspace,
not the repository.

If a defect is found, add a failing Playwright regression assertion, observe
RED, implement the smallest CSS/TSX correction, rerun the focused scenario,
then rerun affected full gates.

- [ ] **Step 11: Commit the integration and verification changes**

```powershell
git add src/app/shell src/App.tsx src/features/issues/components/IssueOverlays.tsx src/styles/control-room.css e2e/mvp.spec.ts e2e/mobile-founder-loop.spec.ts
git commit -m "refactor: connect the founder support loop"
```

Then generate the whole-branch review package from the implementation base to
HEAD, dispatch the final code reviewer, fix all Critical/Important findings in
one reviewed fix wave, and rerun the complete gate. Do not start Task 10 until
Task 9 and the final whole-branch review pass with no open Critical/Important
finding.

---

### Task 10: Release to Dokploy production and verify the published app

**Files:**

- Create: `e2e/production-smoke.spec.ts`
- Read: `docs/DOKPLOY.md`
- Read: `docs/OPERATIONS_RUNBOOK.md`

**Contract:**

- The release is the exact reviewed commit that passed Task 9; do not rebuild
  or amend code between the release SHA and production verification.
- Production remains `https://app.techneia.com.br`, served by the Dokploy
  `mend-control-plane` application from `main`.
- This UI-only release does not run migrations, modify secrets, redeploy the
  private Agent runner, or mutate production workspace data.
- Production smoke checks are read-only and use the landing page plus demo
  routes. They cover dark/light, `en-US`/`pt-BR`, desktop/mobile, health,
  readiness, navigation, and horizontal overflow.
- If production health or a core smoke check fails, stop the rollout, capture
  the failing SHA/evidence, and use the platform's recoverable rollback to the
  last healthy control-plane deployment before diagnosing.

- [ ] **Step 1: Write the production smoke test before release**

Create `e2e/production-smoke.spec.ts`. Gate the file on an explicit production
base URL so the normal local suite remains hermetic:

```ts
import { expect, test } from "@playwright/test";

const productionBaseUrl = process.env.MEND_PRODUCTION_BASE_URL;

test.describe("production smoke", () => {
  test.skip(!productionBaseUrl, "MEND_PRODUCTION_BASE_URL is required");

  test("published support loop is responsive and theme-aware", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("mend.interface-language", "en-US");
      window.localStorage.setItem("mend.theme", "dark");
    });
    await page.goto(`${productionBaseUrl}/issues?demo=1`);
    await expect(page.getByRole("heading", { name: "Issues" })).toBeVisible();
    expect(
      await page.evaluate(() => document.body.scrollWidth),
    ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
    await page.getByRole("link", { name: "Board" }).click();
    await expect(page).toHaveURL(/view=board/);
    await page.getByRole("link", { name: "Runs" }).click();
    await expect(
      page.getByText("Current stage", { exact: true }),
    ).toBeVisible();
  });
});
```

During implementation, confirm the actual theme storage key from the existing
theme provider and use that key. Add a second mobile test at `390×844` that
opens Inbox, the case context, and the reply composer. Add a locale/theme matrix
test that sets each supported value before navigation and verifies the expected
localized primary heading and a computed non-transparent page background.
Never sign in, send a reply, approve a run, or change Settings in this suite.

- [ ] **Step 2: Prove the smoke test targets production only**

Run without the environment variable:

```powershell
npx playwright test e2e/production-smoke.spec.ts --project=desktop
```

Expected: the production suite is skipped and makes no network request.

Run the existing local E2E suite once more and confirm this new file does not
change local results:

```powershell
npm run test:e2e
```

- [ ] **Step 3: Commit the reviewed release candidate**

```powershell
git add e2e/production-smoke.spec.ts docs/superpowers/plans/2026-08-13-workspace-ui-ux-refactor.md
git commit -m "test: add production ui smoke coverage"
git status --short
git log -1 --format="%H %s"
```

Expected: clean worktree and one immutable release SHA. Run the complete Task 9
gate against that SHA. If any file changes, commit the reviewed fix and repeat
the gate before proceeding.

- [ ] **Step 4: Reconcile with the remote main branch**

From the isolated worktree:

```powershell
git fetch origin
git merge-base --is-ancestor origin/main HEAD
```

Expected: exit 0. If remote `main` advanced after the implementation base,
merge `origin/main` into the feature branch (do not rebase the reviewed branch),
resolve only intentional conflicts, rerun the complete gate and final review,
then record the new release SHA. The merge keeps the original planning commit
as an ancestor so the delivery checkout can still fast-forward. Never
force-push production history.

Use `superpowers:finishing-a-development-branch` with the already-authorized
delivery decision: fast-forward the original `main` worktree to the reviewed
branch, then push `main` to `origin`. Before each operation verify the original
worktree is clean and points at the expected repository.

```powershell
$featureBranch = 'codex/workspace-ui-refactor'
$releaseSha = (git rev-parse HEAD).Trim()
if ((git branch --show-current).Trim() -ne $featureBranch) {
  throw 'Release must run from the reviewed feature worktree'
}
$commonGitDir = (git rev-parse --path-format=absolute --git-common-dir).Trim()
$deliveryRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $commonGitDir))
if ((git -C $deliveryRoot branch --show-current).Trim() -ne 'main') {
  throw 'Delivery checkout must be on main'
}
if (git -C $deliveryRoot status --porcelain) {
  throw 'Delivery checkout must be clean'
}
git -C $deliveryRoot merge --ff-only $featureBranch
if ((git -C $deliveryRoot rev-parse HEAD).Trim() -ne $releaseSha) {
  throw 'Fast-forwarded main does not match reviewed release SHA'
}
git -C $deliveryRoot push origin main
```

Record the pushed SHA and confirm it equals the reviewed release SHA.

- [ ] **Step 5: Observe the Dokploy control-plane rollout**

Check whether the `main` push started `mend-control-plane` automatically. If it
did not, use the authenticated Dokploy control panel to deploy that exact main
SHA. Do not expose or modify secrets. Do not redeploy `mend-agent-runner` for
this frontend-only change.

Poll at short bounded intervals while keeping the user updated. The rollout is
ready only when the platform reports success and both endpoints return 2xx:

```text
https://app.techneia.com.br/api/health
https://app.techneia.com.br/api/ready
```

Confirm the deployed commit shown by Dokploy matches the pushed SHA. If the
platform cannot expose a commit, verify the new UI's unique navigation/playback
behavior after health passes and record that as deployment evidence.

- [ ] **Step 6: Run automated smoke tests against production**

```powershell
$env:MEND_PRODUCTION_BASE_URL='https://app.techneia.com.br'
npx playwright test e2e/production-smoke.spec.ts --project=desktop --project=mobile
Remove-Item Env:MEND_PRODUCTION_BASE_URL
```

Expected: all read-only production smoke tests pass in both projects. Preserve
the Playwright report and screenshots in ignored test output.

- [ ] **Step 7: Inspect the deployed product in a real browser**

Open production in a real browser and manually verify:

1. landing playback advances, pauses, selects scenes, and respects reduced
   motion;
2. `/inbox?demo=1` permits the mobile list → conversation → context → composer
   path without clipping;
3. Issues List/Board, Runs, Knowledge, and representative Settings pages render
   at `1440×900` and `390×844` without page overflow;
4. theme switching preserves the active route and readable status contrast;
5. language switching updates the complete surface in `pt-BR` and `en-US`
   without raw translation keys;
6. legacy `/kanban?demo=1` redirects to the canonical Board route.

Compare production screenshots with the approved local screenshots. A small
font-rasterization difference is acceptable; missing content, clipped controls,
wrong theme, untranslated strings, failed navigation, or broken interaction is
not.

- [ ] **Step 8: Close the release**

Run:

```powershell
git status --short
git rev-parse HEAD
git ls-remote origin refs/heads/main
```

Report the release SHA, production URL, health/readiness results, automated
smoke result, desktop/mobile and dark/light browser evidence, locale evidence,
and any non-blocking residual risk. Mark the implementation plan checkboxes for
completed tasks in one final documentation commit only if that commit itself is
also deployed and re-smoked; otherwise keep execution evidence in the ignored
SDD ledger and leave the reviewed release immutable.

---

### Task 11: Replace the Inbox "New issue" action with "New chat"

Added 2026-08-13, after Tasks 0-8, on the product owner's approval of a bounded
design. Sequenced after Task 8 and before Task 9 so the cross-feature QA and
visual matrix cover this surface. Full step-by-step brief lives in the ignored
SDD workspace as `task-11-brief.md`; this section is the durable record of
scope, rationale, and the constraint it overrides.

**Constraint override (owner decision, not an implementer ruling):** this task
adds one backend route, which the Global Constraints above forbid. The owner
approved that override knowing it puts backend changes into the whole-branch
review and the Dokploy release. The override covers the single route below and
nothing else — no new dependency, no migration, no direct Supabase call from
the UI, no autonomous behavior.

**Problem:** the Inbox header's primary action is New issue / Novo chamado
(`InboxPage.tsx:1214` desktop, `:2089` mobile), duplicating the primary action
of the Issues page. Creating an issue is not the job being done in the Inbox.
Starting a conversation is, and the app offers no way to do it.

**Existing machinery this task reuses rather than reinvents:**

- `normalizePhoneNumber` (`server/whatsmiau.ts:183`) reduces any input to
  digits, which is the normalization for DDI + DDD + number.
- `inbox_ingest_message`, called from `InboxService.ingestMessage`
  (`server/inbox-service.ts:386`), already creates contact + conversation +
  message from a phone number and accepts `direction: "outbound"`.
- Outbound-first conversations are an established schema concept
  (`supabase/migrations/20260811125008_classify_outbound_first_conversations.sql`),
  landing at `attention_state = 'none'` rather than `needs_attention`.
- `WhatsAppService.sendText` (`server/whatsapp-service.ts:148`) already does
  provider-send then record-outbound, in that order.

**Scope:**

- `POST /api/conversations` returning `{ conversationId, created }`, with the
  auth and workspace scoping of its neighbours in `conversation-routes.ts`.
  Existing conversation for that phone: return it with `created: false` and
  send nothing. New phone: send, then record as outbound.
- A phone lookup on `ConversationPort` (`server/contracts/api-ports.ts:234`),
  implemented in the Supabase adapter, workspace-scoped.
- `NewChatDialog` in the Inbox, reusing Task 3's Radix Dialog focus/Escape/
  restore contract. Channel selector only when more than one channel is
  connected. Visible advisory that messaging a number which never wrote first
  carries WhatsApp account risk.
- `startConversation()` in `src/features/inbox/api.ts`.
- New issue removed from the Inbox on desktop and mobile, including the
  `onNewIssue` prop threading that exists only to serve it. The Issues page
  keeps its own New issue action unchanged.
- Bilingual copy, 44px mobile targets, semantic theme tokens, no overflow.

**The test that matters most:** a phone number that already has a conversation
must return `created: false` and send nothing. An accidental send into an
existing customer thread is the failure mode this design exists to prevent.
