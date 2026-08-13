# Mend Workspace UI/UX Refactor Design

**Status:** Approved in product discussion on 2026-08-13

**Scope:** Authenticated workspace, Settings information architecture, and the
interactive product proof in the landing hero

**Product direction:**
[`MEND_PRODUCT_STRATEGY_V1.md`](../../product/MEND_PRODUCT_STRATEGY_V1.md)

**Design system:** [`DESIGN.md`](../../../DESIGN.md) and
[`MEND_DESIGN_PATTERNS.md`](../../design/MEND_DESIGN_PATTERNS.md)

## 1. Decision

Refactor the authenticated Mend workspace as one coherent **Midnight Control
Room**. The work changes information architecture, naming, layout, responsive
behavior, and visual hierarchy while preserving the existing support,
engineering, settings, and API contracts.

The selected approach is a shared control-room refactor with domain-specific
compositions. It is intentionally broader than a coat of paint and narrower
than an application rewrite.

The product must make one operational loop legible everywhere:

```text
customer signal
→ support context
→ triage decision
→ persisted issue
→ engineering evidence
→ controlled correction
→ verification and deploy
→ customer reply
```

Desktop remains the primary surface for team operations, issue organization,
Kanban work, configuration, and dense review. Mobile is a first-class response
and supervision surface for a solo founder away from a desk.

## 2. Why the current experience needs a structural refactor

The current application already uses the approved identity, dark palette,
shared page frame, product fonts, and bilingual catalogs. The observed
problems are structural rather than cosmetic:

- Issues and Kanban expose the same shared work as separate top-level product
  destinations.
- The personal planner is visually equal to the support-to-fix loop even though
  it is secondary to Mend's product strategy.
- Issues exposes every filter at once, especially overwhelming on mobile.
- The Inbox is an effective conversation surface but does not keep the case,
  evidence, AI state, and next safe action continuously visible on desktop.
- Wide Kanban and engineering stage rails clip instead of adapting at common
  desktop widths.
- Knowledge rows spend width on prose excerpts instead of making publication
  and AI eligibility easy to scan.
- Settings exposes implementation concepts and individual providers directly
  in the secondary navigation. Labels such as “Coding connections” and
  “Coding routing” describe system construction, not user decisions.
- Repeated connection cards make provider health and automation eligibility
  difficult to compare.
- The landing hero product window is static even though the product promise is
  a sequence of connected actions.

## 3. Goals

### 3.1 Product goals

- Make the support-to-verified-fix loop understandable without reading product
  documentation.
- Keep the founder's next safe action visible and distinguish it from passive
  system status.
- Reduce top-level destinations and repeated navigation.
- Name settings by what the founder controls rather than provider or control
  plane implementation.
- Preserve dense, efficient desktop operation for small SaaS teams.
- Support the minimum complete mobile founder journey: respond, review triage,
  follow investigation, act at approval boundaries, confirm the outcome, and
  return to the customer.
- Make the landing hero demonstrate the actual loop rather than display a
  decorative screenshot.

### 3.2 Engineering goals

- Reuse the existing tokens, `PageHeader`, resource states, confirmation flow,
  shadcn/Radix primitives, feature APIs, and route-level lazy loading.
- Keep new abstractions limited to patterns genuinely reused across multiple
  surfaces.
- Preserve workspace scoping, authorization, and server-side secret handling.
- Keep all product copy in matching `pt-BR` and `en-US` catalogs.
- Retain stable legacy URLs through redirects or aliases.
- Add no animation or UI dependency.

## 4. Non-goals

- No backend domain rewrite, database migration, or new provider integration.
- No new autonomous product capability.
- No enterprise navigation, role matrix, dashboard suite, or omnichannel
  expansion.
- No attempt to make Kanban editing or deep Settings configuration equally
  powerful on mobile.
- No new design system, competing token layer, glassmorphism, decorative grid,
  global gradient, or ornamental motion.
- No prerecorded marketing video asset. The product proof is a lightweight,
  semantic React/CSS playback built from the existing specimen.

## 5. Approaches considered

### 5.1 Visual polish only

Change spacing, type scale, borders, and colors without changing page
structure. This is low-risk but leaves duplicated navigation, Settings
taxonomy, mobile filter overload, and missing case context intact.

### 5.2 Shared control room with domain compositions — selected

Preserve the shell, tokens, APIs, and feature boundaries while reorganizing
navigation and giving each domain a purpose-built layout. This addresses the
real usability problems without coupling the refactor to backend changes.

### 5.3 Full shell and feature rewrite

Replace routes, state ownership, primitives, and feature pages together. This
offers maximal freedom but expands risk and review surface without a product
requirement that justifies it.

## 6. Visual system

No new visual language is introduced. The refactor applies the approved system
more consistently.

### 6.1 Palette

- **Ink:** `#0B0E14` — product canvas.
- **Surface Low:** `#10131B` — primary operational surface.
- **Surface Mid:** `#191B23` — selected and elevated state.
- **Signal Blue:** `#2E7DFF` — selection, relationship, primary action, and
  active engineering stage.
- **Operational Olive:** `#849270` — calm, verified, or operational state.
- **Neutral:** `#747780` — muted technical content.

Green remains channel/success semantics, amber remains warning, and red remains
danger. State is never communicated by color alone.

### 6.2 Typography

- Inter remains the product UI face.
- JetBrains Mono is used for identifiers, evidence types, run events, and
  implementation metadata.
- Geist remains restricted to marketing display and identity contexts.
- Product headings stay within the existing 17–26px scale; body and metadata
  remain compact enough for daily operation.

### 6.3 Geometry and rhythm

- Every workspace page uses the canonical page padding tokens.
- Desktop tables remain dense and border-separated rather than becoming card
  grids.
- Controls use the existing 32px desktop height. Mobile primary controls and
  critical icon actions provide a minimum 44px touch target without globally
  inflating desktop density.
- Surfaces use 1px rules, flat depth, and existing radii.
- Secondary navigation stays quiet and outside card styling.

### 6.4 Signature element: the case thread

A restrained relationship line connects real stages of the active case. It
appears only where it communicates sequence: Inbox context, issue history,
engineering run progress, and the landing playback. Blue marks the active
relationship; olive marks verified stages. It never becomes a decorative
background.

This is the single visual signature. All other surfaces remain disciplined.

## 7. Global information architecture

### 7.1 Primary workspace navigation

```text
Inbox
Issues
Runs
Knowledge
Settings
```

User-facing labels are:

| Route         | English   | Portuguese           |
| ------------- | --------- | -------------------- |
| `/inbox`      | Inbox     | Caixa de entrada     |
| `/issues`     | Issues    | Casos                |
| `/agent-runs` | Runs      | Execuções            |
| `/knowledge`  | Knowledge | Base de conhecimento |
| `/settings`   | Settings  | Configurações        |

The internal `Issue` type and existing issue identifiers remain unchanged.

### 7.2 Issues and Board

Issues owns two local views:

```text
Issues  [List] [Board]
```

- List is the default and preserves the dense table.
- Board is the existing shared Kanban workflow, repositioned as an issue view.
- `/kanban` redirects to `/issues?view=board`.
- `/kanban?mode=personal` redirects to `/my-work`.

### 7.3 Personal planning

The existing personal tasks and calendar remain available as **My work / Meu
trabalho** at `/my-work`. They move to the operator menu, command palette, and
mobile More menu instead of occupying primary workspace navigation.

This preserves the feature while making its product priority honest.

### 7.4 Mobile navigation

The persistent bottom navigation contains:

```text
Inbox | Issues | Runs | More
```

Knowledge, My work, Settings, Profile, theme, and sign-out remain reachable
from More. Unread or decision-required counts are shown when the existing live
data provides them and omitted otherwise.

## 8. Workspace shell

- Keep the approved `BrandMark` and current sidebar geometry.
- Shorten the brand descriptor footprint so primary navigation begins sooner.
- Preserve global search and keyboard access.
- Apply one selected-state grammar across desktop sidebar, mobile navigation,
  secondary settings navigation, and local view tabs.
- Keep notification controls in the session area on desktop and top bar on
  mobile.
- Resolve conversation notifications to
  `/inbox?conversation=<conversation-id>`. Resolve issue notifications by
  matching the loaded issue id and opening `/issues/<identifier>`; if the issue
  is not loaded, fall back to `/issues`. A run notification, when supplied by
  existing data, opens `/agent-runs?run=<run-id>`.
- Keep desktop and mobile shell state independent of feature data ownership.

## 9. Inbox

### 9.1 Desktop composition

At widths of at least 1280px, Inbox uses three working regions:

```text
┌─────────────────┬─────────────────────────────┬──────────────────┐
│ Conversations   │ Customer thread             │ Case context     │
│ search + filters│ messages + sticky composer  │ AI + next action │
└─────────────────┴─────────────────────────────┴──────────────────┘
```

- Conversation rail: approximately 300–330px.
- Case context rail: approximately 260–300px.
- Thread takes the remaining width and enforces readable bubble widths.
- Existing AI decision and draft content moves into the case context rail.
- The active issue, triage state, evidence readiness, assignee, and next safe
  action stay together.
- The composer remains sticky and preserves files, voice, draft insertion, and
  current send behavior.

Between 820px and 1279px, the context rail becomes a labeled drawer or
disclosure opened from the conversation header. No context is discarded.

### 9.2 Mobile founder response

- The conversation list and active thread remain separate full-screen states.
- Opening a conversation puts the latest customer signal and response composer
  ahead of secondary metadata.
- The composer is sticky above the bottom navigation and remains usable with
  the software keyboard open.
- Triage summary and case progress appear in a compact disclosure with an
  explicit current state and next action.
- A founder can take over, resume AI, assign, link/open the issue, insert a
  draft, and send a response without switching to a desktop layout.
- Destructive or externally consequential actions use the shared app-native
  confirmation flow.

## 10. Issues

### 10.1 List view

- Page header contains the List/Board switch and the single primary “New
  issue” action.
- Search, status, and assignee are the always-visible filters on desktop.
- Priority, label, customer, type, and date filters live in an advanced filter
  disclosure with an active-filter count.
- Mobile initially shows search and a single Filters action; filters open in a
  full-width sheet/disclosure rather than a multi-row control wall.
- Desktop retains the table. Columns prioritize issue, state, assignee, source,
  and recency; secondary metadata can be hidden at narrower widths.
- Mobile uses compact issue rows with identifier, title, state, priority, and
  decision-required indicator. It does not render a squeezed desktop table.

### 10.2 Board view

- Shared issue statuses remain the board columns.
- At workspace widths of at least 1080px, the six active columns use
  `minmax(180px, 1fr)` and fit without page-level overflow. Below that content
  width, columns use a 220px minimum inside an explicitly horizontally
  scrollable board region.
- Horizontal scrolling remains available when data or viewport width requires
  it, but no column is clipped without an intentional scroll affordance.
- Cards show identifier, title, priority/state signal, owner, and at most two
  useful metadata items.
- Drag-and-drop and dense organization are desktop-first.
- Mobile Board becomes a status-grouped issue list with quick status actions;
  it does not imitate six draggable desktop columns.

### 10.3 Issue detail

- Desktop keeps a detail page/drawer pattern with sections for customer signal,
  triage, evidence, runs, and outcome.
- Mobile opens a full-screen detail surface.
- The top mobile block answers: what happened, what Mend decided, what is
  happening now, and whether the founder must act.
- Related conversation and current run are one-tap destinations.

## 11. Engineering runs

### 11.1 Desktop

- Preserve the ledger/detail layout.
- Keep the run ledger near 300–330px and make its selected state unmistakable.
- The case chain remains the primary detail surface.
- The horizontal stage rail scrolls or adapts intentionally instead of
  clipping.
- Evidence, changed files, checks, and operational timeline use progressive
  disclosure after the active stage and decision block.
- A required approval or retry action remains visible while reviewing the
  relevant evidence.

### 11.2 Mobile supervision contract

The mobile run page is optimized for supervision, not code review parity:

- The selected run begins with issue, current stage, latest meaningful event,
  elapsed time, and decision requirement.
- The case chain becomes a vertical timeline with completed, current, blocked,
  and pending labels.
- Evidence summaries are readable before raw logs or changed-file details.
- Approve, reject, retry, cancel, merge, deploy, health-check, and customer
  notification actions remain available only when the existing state machine
  permits them.
- A sticky action bar appears only when a decision is currently required.
- Every action returns visible pending, success, or failure feedback and keeps
  the user on the same case.
- The founder can move from notification → issue → run → verified/deployed
  state → customer conversation without navigating through collection roots.

## 12. Knowledge

- Preserve search, category filtering, published/draft behavior, and article
  creation/editing.
- Replace prose-heavy wide rows with scan-first rows: title, concise summary,
  category, status, AI eligibility, and updated time.
- At content widths of at least 1100px, selecting an article opens an adjacent
  preview/detail region; editing continues through the existing controlled form
  behavior.
- Mobile keeps a single-column list and full-screen editor/detail.
- The published-only AI rule remains visible as operational guidance, not a
  decorative footer.

## 13. Settings information architecture

### 13.1 Secondary navigation

```text
Workspace
  Overview
  Team
  Audit log

Support
  WhatsApp
  Automation

Engineering
  Repositories
  Agents & models

Connections
  Integrations
```

| Current label      | New destination                       |
| ------------------ | ------------------------------------- |
| AI behavior        | Automation → Replies                  |
| Support flows      | Automation → Intake                   |
| All integrations   | Integrations                          |
| GitHub             | Integrations → GitHub detail          |
| Google Calendar    | Integrations → Google Calendar detail |
| MCP plugins        | Integrations → MCP tools detail       |
| Coding connections | Agents & models → Providers           |
| Coding routing     | Agents & models → Run policy          |

Legacy route paths redirect to the new destination and preserve query state
where meaningful.

Canonical Settings routes are:

```text
/settings
/settings/team
/settings/audit
/settings/channels/whatsapp
/settings/automation/replies
/settings/automation/intake
/settings/engineering/repositories
/settings/engineering/agents/providers
/settings/engineering/agents/run-policy
/settings/integrations
/settings/integrations/github
/settings/integrations/google
/settings/integrations/mcp
```

### 13.2 Automation

Automation contains two local tabs:

- **Replies / Respostas:** conversation mode, reply policy, knowledge
  requirement, handoff, escalation, and allowed support actions.
- **Intake / Entrada:** when the flow starts and what the customer sees before
  AI triage.

Copy distinguishes support automation from engineering automation without
asking the user to understand internal routing terms.

### 13.3 Agents & models

Agents & models contains two local tabs:

- **Providers / Provedores:** provider credentials or subscriptions, verified
  catalogs, connection state, and automation eligibility.
- **Run policy / Política de execução:** provider/model selection, budget,
  fallback, and approval boundary for investigate, propose, implement, review,
  and verification stages already supported by the current control plane.

Connected providers render as a comparison-friendly table/list rather than a
stack of large cards. Each row exposes connection, authentication, catalog,
automation eligibility, state, and an action menu. Duplicate labels remain
distinct through their connection metadata; the UI does not silently merge
records.

### 13.4 Integrations

- Integrations begins with a status directory for GitHub, Google Calendar, and
  trusted MCP tools.
- Each provider opens its existing settings content inside the Integrations
  area rather than adding another persistent sidebar entry.
- Status rows distinguish connected, needs attention, and not configured with
  text plus icon.
- Write-capable MCP controls retain explicit confirmation and access-boundary
  copy.

### 13.5 Responsive Settings

- At `<= 820px`, the secondary navigation becomes the canonical labeled native
  selector.
- Local tabs scroll or wrap intentionally and retain selected state.
- Long provider lists become stacked comparison rows with actions grouped in a
  menu.
- Deep configuration remains accessible but is not promoted into mobile bottom
  navigation.

## 14. Landing interactive case playback

The existing hero `ProductWindow` becomes an interactive case playback built
from the same semantic specimen.

### 14.1 Scenes

1. **Signal:** a customer reports a checkout regression.
2. **Context:** Mend retrieves release and conversation context, then marks the
   suspected issue.
3. **Investigate:** the persisted issue opens a controlled engineering run and
   evidence advances.
4. **Verify and reply:** checks pass, deployment health is verified, and the
   customer update is ready/sent.

### 14.2 Interaction

- Autoplay advances every 3.2 seconds for a 12.8-second four-scene loop.
- A simulated pointer moves only to real controls and shows a restrained click
  pulse.
- Scene controls are semantic buttons with selected state.
- Users can select a scene, pause, or resume.
- Autoplay pauses while the specimen is hovered, focused, or manually
  controlled.
- `prefers-reduced-motion` disables autoplay and pointer travel while keeping
  all scenes selectable.
- Touch devices use scene selection and state transitions without hover-only
  behavior.
- The playback is bilingual and uses the current marketing catalogs.

No canvas renderer, video file, animation library, or continuous
`requestAnimationFrame` loop is added.

## 15. Mobile founder journey and acceptance contract

The mobile product is considered functional only if the following journey is
possible at 390×844 without desktop fallback:

```text
push/in-app notification
→ relevant customer or issue context
→ AI triage summary and evidence state
→ current engineering stage
→ required founder decision, if any
→ correction/check/deploy outcome
→ customer reply or notification state
```

Acceptance criteria:

- No page-level horizontal overflow.
- A notification reaches the closest supported entity, not merely the app
  home.
- The current status and next required action appear before raw event detail.
- Critical actions are keyboard accessible and provide at least a 44px mobile
  touch target.
- The reply composer remains usable with the virtual keyboard.
- Current run progress uses a vertical mobile representation.
- Decision-required actions are not hidden inside hover or an unlabeled
  overflow menu.
- Slow or failed requests keep localized retry feedback and never imply that an
  external action completed.
- Board reordering and deep configuration may be desktop-first, but viewing
  issues, responding, changing an allowed state, and supervising a run are not.

## 16. State, data, and error handling

- Feature data continues to flow through its existing feature API or the
  current App-owned state contract.
- UI components do not query Supabase or backend adapters directly.
- Route reorganization does not change workspace scoping.
- Existing optimistic updates retain rollback behavior.
- Empty states explain the next available action.
- Loading states preserve the destination's approximate geometry.
- Errors remain calm, localized, actionable, and technically honest.
- A failed or uncertain external action never advances the visible case to a
  verified state.
- Confirmations continue to use `useConfirmation` and `ConfirmDialog`.

## 17. Accessibility and motion

- Every control has an accessible name and visible `:focus-visible` state.
- Local view switches use proper tab semantics or links according to whether
  they change route state.
- Drawers, dialogs, and mobile disclosures preserve focus order and escape
  behavior through existing primitives.
- Table alternatives retain equivalent labels and actions on mobile.
- Motion uses transform and opacity, is subordinate to state comprehension,
  and respects reduced motion.
- The case thread and state pills always include text or accessible labels.
- AA contrast remains the minimum.

## 18. React and performance constraints

- Preserve route-level lazy imports.
- Do not subscribe to page state that is only needed inside an event handler.
- Derive view state during render instead of synchronizing it through effects.
- Hoist static navigation and playback scene metadata outside components.
- Avoid inline component definitions and unnecessary memoization.
- Long provider and conversation lists use CSS `content-visibility` when it is
  safe and beneficial; virtualization is not added without measured need.
- Independent data requests remain parallel.
- Marketing playback uses one low-frequency timer and CSS transitions, not a
  perpetual animation loop.
- No new dependency is authorized by this design.

## 19. Internationalization

- Every changed visible string, aria label, tooltip, empty state, status, and
  action is present in `en-US` and `pt-BR`.
- Stable semantic values remain untranslated in data and are translated only at
  render time.
- Navigation metadata stores identifiers rather than English display copy
  where practical.
- The Profile language switch updates the refactored surfaces without reload.
- Required gates are `npm run i18n:check` and `npm run i18n:frontend`.

## 20. Testing and visual verification

Behavior changes follow red-green-refactor.

Required automated coverage:

- navigation and legacy route mappings;
- Settings group/item taxonomy and selected route resolution;
- Issues List/Board state and legacy Kanban redirection;
- personal planning route preservation;
- advanced filter disclosure behavior;
- mobile conversation/detail transitions and sticky reply affordance;
- mobile issue/run navigation and decision-required action visibility;
- landing playback scene selection, pause/resume, and reduced-motion fallback;
- locale catalog parity and frontend translation guard.

Required verification:

- focused Vitest tests during each task;
- `npm test`;
- `npm run typecheck`;
- `npm run lint`;
- `npm run format:check`;
- `npm run i18n:check`;
- `npm run build`;
- relevant Playwright scenarios and then `npm run test:e2e`;
- real-browser screenshots and interaction review at desktop `1440×900` and
  mobile `390×844` for landing, Inbox, Issues List, Issues Board, Runs,
  Knowledge, and representative Settings pages;
- keyboard focus, reduced motion, long Portuguese copy, and horizontal overflow
  review.

## 21. Delivery boundaries

The work is delivered in independent reviewable slices:

1. shared shell, route taxonomy, and responsive foundations;
2. Inbox case context and mobile response path;
3. Issues List/Board consolidation and personal planning relocation;
4. Runs and Knowledge operational layouts;
5. Settings information architecture and provider presentation;
6. landing interactive playback;
7. cross-feature integration, React review, accessibility, i18n, and visual QA.

Parallel implementation begins only after a task-level implementation plan
defines exclusive file ownership or explicit coordination boundaries.

## 22. Success definition

The refactor succeeds when:

- the primary navigation expresses Mend's product loop without duplicate work
  destinations;
- the founder can identify the current case state and next safe action in
  Inbox, Issues, and Runs;
- Settings uses the approved outcome-oriented taxonomy and no longer requires
  users to understand “coding connections” versus “coding routing”;
- the desktop product remains dense and efficient for a SaaS team;
- the complete mobile founder supervision journey is usable at 390×844;
- the landing hero visibly demonstrates the message-to-verified-fix loop;
- all existing backend/API/security contracts remain intact;
- bilingual, accessibility, build, test, and visual review gates pass.
