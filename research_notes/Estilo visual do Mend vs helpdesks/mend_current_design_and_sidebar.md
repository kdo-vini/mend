# Mend: current visual design and the collapsed-sidebar bug

Scope: local codebase investigation of `C:/Users/Lenovo/Desktop/Repositorios Zelo/mend` at `main` (00a3032). No source files were modified. "Sources" are repository files cited as `path:line`. All paths are relative to the repo root.

## Q1. What do the governing docs say about visual design, positioning and constraints on fonts, colours and glass?

### Takeaway
The binding visual direction is "Céu e Profundo" in `DESIGN.md`: a light, softly glowing blue-grey canvas, glass used only for navigation chrome, opaque white cards for data, and a single deep-navy "Profundo" block per screen. Fonts are fixed: Geist for titles and wordmark, Inter for everything else, JetBrains Mono for identifiers. The product strategy doc that AGENTS.md calls mandatory is now marked historical: Mend is currently Diagium's internal dashboard, Portuguese only, and must stay "aligned with the existing design".

### Cited Findings
- AGENTS.md requires reading `docs/product/MEND_PRODUCT_STRATEGY_V1.md` first. For UI work it also requires `docs/design/MEND_DESIGN_PATTERNS.md` and `DESIGN.md`, the patterns file being "especially authoritative for page frames, spacing, responsive layout and visual review". UI must be pt-BR only and new confirmation flows must use the shared app-native confirmation. — [AGENTS.md](AGENTS.md)
- The strategy doc opens with a banner dated 2026-10-05: "Mend is the Diagium internal dashboard", single workspace, and the rest of the doc is "retained as historical context, not the active product specification". Current work follows `MEND_INTERNAL_PRODUCT_DIRECTION.md`. — [docs/product/MEND_PRODUCT_STRATEGY_V1.md:1](docs/product/MEND_PRODUCT_STRATEGY_V1.md)
- The internal direction requires the interface to be pt-BR only (internal use), responsive and "alinhada ao design existente". QA is mandatory before merging visible changes. — [docs/product/MEND_INTERNAL_PRODUCT_DIRECTION.md:29](docs/product/MEND_INTERNAL_PRODUCT_DIRECTION.md)
- The historical positioning is "AI Support Engineer", explicitly "not just a helpdesk". Its out-of-scope list includes "substituição completa de Intercom ou Zendesk", broad omnichannel, and "dashboards sofisticados sem métricas confiáveis". — [docs/product/MEND_PRODUCT_STRATEGY_V1.md:547-560, 598](docs/product/MEND_PRODUCT_STRATEGY_V1.md)
- DESIGN.md calls Mend "a quiet control room". Céu is the light, softly lit canvas (`--canvas` with two glows, glass navigation, opaque white cards). Profundo is the deep blue, the brand's single dark moment, used "once per screen". The older "Solaris" near-black and "Midnight Control Room" directions are retired. — [DESIGN.md:8-23](DESIGN.md)
- DESIGN.md principles: next safe decision first (one key result, one primary action per view), evidence over assertion, calm density, "one sky, one deep, one loop", Portuguese only. — [DESIGN.md:25-35](DESIGN.md)
- Glass rules: use it for the sidebar, period bar, toolbars and dropdowns, never under data. Cards, tables, forms, messages and dialogs are opaque. Profundo is never used twice on one screen. — [DESIGN.md:64-72](DESIGN.md)
- Retired colours: olive, tertiary orange, purple, near-black stages and decorative gradients. State tints use `color-mix(in oklch, var(--state) N%, transparent)`. Feature CSS must use semantic tokens, never hex. — [DESIGN.md:39-62](DESIGN.md)
- Type rules: Geist only for page titles and the wordmark. Inter for everything else, with `tabular-nums` for money. JetBrains Mono only for real identifiers. Sentence case everywhere, no uppercase eyebrows, no letter-spaced labels, nothing below 11px. — [DESIGN.md:88-94](DESIGN.md)
- Type hierarchy: page title Geist 30, section heading 17, panel title 18, figures 21, body 13 and 13/550, supporting text 12, label 11. — [DESIGN.md:76-82](DESIGN.md)
- Layout: the sidebar is a "floating glass sidebar" with a 16px inset, `--radius-shell` and `--shadow-float`. `--radius-feature` is for top-level panels, including the inbox layout. `--radius-card` is for bars, dropdowns and nested cards. — [DESIGN.md:96-105](DESIGN.md)
- Logo: use `BrandMark`/`BrandLockup`. The mark is `--brand` and must never be redrawn, recoloured by filter or rotated. App icons put the mark on a Profundo `#16375C` tile. — [DESIGN.md:107-112](DESIGN.md)
- Accessibility: WCAG 2.2 AA in both themes, every control has an accessible name and a `:focus-visible` ring, 120–160ms transitions, a 280ms spring only on buttons, and support for `prefers-reduced-motion` and reduced transparency. — [DESIGN.md:114-125](DESIGN.md)
- Review every UI change at 1440×900 and 390×844 in both themes. — [DESIGN.md:140-143](DESIGN.md)
- Page frame: desktop 29/34px, ≤820px 22/17px, ≤650px 16/13px. Spacing uses a 4px scale (`--space-1..6`). The global sidebar sits outside the page frame. The shell sidebar "is sticky and viewport-tall". — [docs/design/MEND_DESIGN_PATTERNS.md:15-91](docs/design/MEND_DESIGN_PATTERNS.md)

### Inferences
- Any redesign or helpdesk comparison has to keep the Céu/Profundo palette, the glass-only-for-chrome rule and the Geist/Inter/JetBrains trio, unless the user explicitly overrides DESIGN.md. Proposing a dark-first "Midnight" look or new accent colours would conflict with closed decisions.
- The historical strategy rules out "becoming Zendesk/Intercom". Borrowing helpdesk patterns for the inbox is fine, but adopting a full helpdesk feature set would expand scope and should be flagged.

### Gaps
- DESIGN.md mentions a "Mend design system artifact" with the full brand kit and contrast tables. It is not in the repo and was not consulted.

## Q2. What fonts are loaded, and what tokens define colour, radii, shadows and blur?

### Takeaway
There are three self-hosted variable WOFF2 fonts, declared with `@font-face` in `src/styles/fonts.css`. There are no Google Fonts and no fontsource packages, and `index.html` loads no font. All colour, radius, shadow, blur and motion tokens live in `src/styles/tokens.css`. Tailwind v4 maps them through `@theme inline` in `src/styles/index.css`.

### Cited Findings
**Fonts**
- `@font-face` declarations: "Geist" from `src/assets/fonts/Geist-Variable.woff2` (weights 100–900), "Inter" from `Inter-Variable-latin.woff2` (100–900), and "JetBrains Mono" from `JetBrainsMono-Variable-latin.woff2` (100–800), all `font-display: swap`. — [src/styles/fonts.css:2-22](src/styles/fonts.css)
- `index.html` has no font links. Its theme-color metas are `#edf2f7` (light) and `#101b2a` (dark). Note that `<html lang="en-US">` and the English `<title>`/description conflict with the pt-BR-only rule. — [index.html:2-30](index.html)
- `package.json` uses `tailwindcss` 4.3.3 and `@tailwindcss/vite`, with no `@fontsource/*` packages. — [package.json:31,49](package.json)
- Font stacks: `--font-product: Inter, ui-sans-serif, system-ui, sans-serif`, `--font-display: Geist, Inter, …`, `--font-technical: "JetBrains Mono", ui-monospace, monospace`. — [src/styles/tokens.css:95-97](src/styles/tokens.css)
- The Tailwind theme sets `--font-sans: Inter, …` and `--font-heading: var(--font-sans)`. — [src/styles/index.css:32-33](src/styles/index.css)
- The body default is `13px/1.45 Inter`. — [src/styles/base.css:13-14](src/styles/base.css)
- In the shell, the brand name uses `--font-display` at 22px. Page and inbox titles use `--font-display` at 30px with `-0.03em` tracking (inbox title 27px). — [src/styles/workspace-design.css:29-50](src/styles/workspace-design.css); [src/styles/prototype-inbox-shell.css:11-14](src/styles/prototype-inbox-shell.css)

**Colour tokens: light theme ("Céu")** — [src/styles/tokens.css:7-38](src/styles/tokens.css)

| Token | Value |
| --- | --- |
| `--canvas` | `#edf2f7` |
| `--canvas-glow` | `#c5ddf5` |
| `--canvas-glow-2` | `#deddf2` |
| `--glass` | `#ffffffa8` (white, about 66% alpha) |
| `--glass-line` | `#fffffff0` |
| `--surface` | `#ffffff` |
| `--surface-subtle` | `#f3f7fc` |
| `--surface-hover` | `#eaf1fa` |
| `--surface-selected` | `#d9e6f6` |
| `--line` | `#dce4ed` |
| `--line-strong` | `#b6c8dd` |
| `--line-control` | `#7a8ea6` |
| `--text` | `#182d44` |
| `--text-secondary` | `#304a65` |
| `--text-muted` | `#52677e` |
| `--action` | `#2468d8` |
| `--action-strong` | `#235bb1` |
| `--action-wash` | `#2468e815` |
| `--positive` | `oklch(0.48 0.13 150)` |
| `--caution` | `oklch(0.55 0.14 75)` |
| `--negative` | `oklch(0.55 0.18 25)` |
| `--channel-whatsapp` | `oklch(0.5 0.16 145)` |
| `--shadow-float` | `0 8px 28px #2444660c` |

**Colour tokens: dark theme ("Noite")** — [src/styles/tokens.css:40-66](src/styles/tokens.css)

| Token | Value |
| --- | --- |
| `--canvas` | `#101b2a` |
| glows | `#284969`, `#302b50` |
| `--glass` | `#263b53b8` |
| `--glass-line` | `#ffffff24` |
| `--surface` and `--surface-subtle` | `#1b2b40` |
| `--surface-hover` | `#263b54` |
| `--surface-selected` | `#314a69` |
| `--line` | `#ffffff18` |
| `--line-strong` | `#526780` |
| text | `#e1eaf7`, `#cddbee`, `#b2c3d9` |
| `--action` | `#75a7ff` |
| `--action-strong` | `#a6c7ff` |
| `--shadow-float` | `0 8px 28px #07132122` |

The dark dropdown surface is `--surface-selected`. — [src/styles/tokens.css:196-198](src/styles/tokens.css)

**Theme-invariant brand tokens** — [src/styles/tokens.css:68-92](src/styles/tokens.css)
- `--brand: #2e7dff`
- `--action-fill: #235fcf`, `--action-fill-highlight: #347af0`, `--on-action: #fff`
- Profundo: `--deep: #16375c`, `--deep-shade: #112e51`, `--deep-tint: #193e6a`, `--deep-glow: #376ba5`, `--on-deep-muted: #c8daee`
- `--deep-gradient`: a radial glow at 95% 0 plus `linear-gradient(115deg, deep-shade, deep-tint)`
- `--canvas-gradient`: two radial glows (8% 15% and 95% 5%) over `--canvas`

**Radii, space, motion and glass**
- Radii: `--radius: 0.625rem` (shadcn base), `--radius-small: 5px`, `--radius-control: 10px`, `--radius-nav: 12px`, `--radius-card: 16px`, `--radius-feature: 22px`, `--radius-shell: 24px`. — [src/styles/tokens.css:128-134](src/styles/tokens.css)
- Sizes: `--control-height: 32px`, `--action-min-height: 36px`, `--mobile-touch-target: 44px`. — [src/styles/tokens.css:118-120](src/styles/tokens.css)
- Motion: 120, 160 and 280ms. `--ease: cubic-bezier(0.22,0.8,0.24,1)`, `--ease-spring: cubic-bezier(0.2,1.45,0.35,1)`. `--focus-ring: 2px solid var(--action)`. — [src/styles/tokens.css:144-151](src/styles/tokens.css)
- Glass: `--glass-blur: 24px`, `--glass-surface: color-mix(in oklch, var(--surface) 88%, transparent)`. — [src/styles/tokens.css:154-156](src/styles/tokens.css)
- The token `--glass-blur` is not used by the actual blur rules, which are hard-coded:
  - Sidebar: `backdrop-filter: blur(24px) saturate(1.3)` — [src/styles/workspace-design.css:23](src/styles/workspace-design.css)
  - Toolbars and period bar: `blur(20px)` — [src/styles/workspace-design.css:86](src/styles/workspace-design.css)
  - Dropdowns: `blur(20px)` plus shadow `0 12px 30px #06162826` — [src/styles/workspace-design.css:94-95](src/styles/workspace-design.css)
- Primary button: `linear-gradient(--action-fill-highlight, --action-fill)` with shadow `inset 0 1px 0 #ffffff35, 0 4px 12px #2468e81c` and a scale(0.96) press. — [src/styles/workspace-design.css:63-79](src/styles/workspace-design.css)
- shadcn aliases: `--background: var(--canvas)`, `--primary: var(--action-fill)`, `--border: var(--line)`, `--ring: var(--action)`, `--sidebar-*` mapped to text, surface-hover and line. — [src/styles/tokens.css:166-193](src/styles/tokens.css)
- CSS import order matters for the sidebar bug: `shell.css` (line 15), `primitives.css` (16), `responsive.css` (24), `shared.css` (26), then `workspace-design.css` (89) and `prototype-inbox-shell.css` (92). — [src/styles/index.css:12-93](src/styles/index.css)

### Inferences
- The palette is a monochrome blue family: blue-grey canvas, navy text, a single blue action colour and a deep navy emphasis. The only non-blue hues are the state colours and WhatsApp green. Compared with typical helpdesks, the differentiators are the glass floating sidebar, the gradient canvas glows and the large radii (22–24px).
- Several hex values remain in feature CSS (for example the button shadow and dropdown shadow in workspace-design.css), which is a mild deviation from DESIGN.md's no-hex rule.

### Gaps
- No rendered screenshots were taken, so the exact on-screen colours after `color-mix` and backdrop blur were not measured.

## Q3. Which rules break the collapsed sidebar, and what is the fix?

### Takeaway
The collapsed rail is 58px wide (border-box) with 8px side padding and a 1px border, leaving only about 40px of content width. Yet the collapsed CSS keeps two horizontal flex rows: the logo plus hamburger in `.brand-row` (about 69px) and the three 30px utility buttons in `.sidebar-utilities` (about 94px). Both rows are centred, so they overflow symmetrically past both edges of the rounded glass rail. The fix is to widen the rail to 72px and stack both rows vertically, or replace the logo with the toggle. Nav links should also get accessible names and tooltips when collapsed.

### Cited Findings
**Component and state**
- The shell is `Sidebar` in `src/app/shell/WorkspaceShell.tsx:275-406`.
- `.brand-row` holds `<BrandMark/>`, a `<div>` with name and subtitle, and the `.icon-button.subtle.sidebar-collapse` hamburger (`Menu` 16px). — [WorkspaceShell.tsx:318-337](src/app/shell/WorkspaceShell.tsx)
- The footer is `.sidebar-bottom` > `.sidebar-bottom-header` > `.sidebar-utilities`, containing `NotificationCenter` (bell), the theme button (Sun/Moon) and logout, followed by `WorkspaceAvailability` (the user row). — [WorkspaceShell.tsx:359-403](src/app/shell/WorkspaceShell.tsx)
- The collapse state is `useState(false)` in `App.tsx`, which adds the class `sidebar-is-collapsed` to `.app-shell`. The state is not persisted to localStorage, unlike `mend.theme`. — [src/App.tsx:220, 1125-1129](src/App.tsx)

**Rail geometry**
- Collapsed geometry: `.sidebar-is-collapsed .sidebar { width: 58px; flex-basis: 58px; padding: 13px 8px; }`. — [src/styles/shared.css:265-269](src/styles/shared.css)
- `box-sizing: border-box` is global. — [src/styles/base.css:1-3](src/styles/base.css)
- So the content box is 58 − 16 − 2 (border) = 40px.
- The glass rail styles (`.app-shell .sidebar`) add a 1px `--glass-line` border, `--radius-shell` 24px, blur and `padding-top: 25px`. That rule loads after shared.css with equal specificity (0,2,0), so it overrides the collapsed top padding of 13px. — [src/styles/workspace-design.css:11-28](src/styles/workspace-design.css)
- No `overflow: hidden` is set on `.sidebar`, so overflowing children paint outside the rounded border.

**Bug 1: logo and hamburger cramped**
- `.sidebar-is-collapsed .brand-row { justify-content: center; padding: 0 0 17px; }` keeps the row horizontal. — [shared.css:270-273](src/styles/shared.css)
- Only the text `div` is hidden. — [shared.css:274-283](src/styles/shared.css)
- The hamburger stays visible with `margin-left: auto`. — [shell.css:71-73](src/styles/shell.css)
- Measurements:
  - `.brand-mark` is 28×20px. — [shell.css:39-46](src/styles/shell.css)
  - `.icon-button` is 30×30px. — [src/styles/primitives.css:94-105](src/styles/primitives.css)
  - The row gap is 11px. — [shell.css:326-329](src/styles/shell.css)
- Row width is 28 + 11 + 30 = 69px in a 40px box. The row is centred, so it overflows by about 14px on each side.
- Compare the ≤820px responsive rule, which hides `.sidebar-collapse` entirely. That is why the auto-collapsed rail at narrow widths looks fine, but leaves no way to expand it. — [src/styles/responsive.css:37-57](src/styles/responsive.css)

**Bug 2: footer icons spill outside the rail**
- `.sidebar-utilities { display: flex; align-items: center; gap: 2px; }` has no column override when collapsed. — [shell.css:176-180](src/styles/shell.css)
- `.sidebar-is-collapsed .sidebar-bottom-header { justify-content: center; padding: 0; }` centres the 94px row (3×30 + 2×2) inside 40px. It overflows by about 27px each side, which puts the bell over the left border and logout over the right border, as the user reported. — [shared.css:289-292](src/styles/shared.css)
- The notification badge (`top:-3px; right:-3px`) adds more horizontal spill. — [primitives.css:132-144](src/styles/primitives.css)

**Bug 3: user row centred alone**
- The avatar centring is intended: collapsed rules hide `.user-row > span:nth-child(2)`, which matches `span.user-row-name`, and centre `.user-row`. — [shared.css:280-301](src/styles/shared.css); [src/app/shell/WorkspaceAvailability.tsx:51-69](src/app/shell/WorkspaceAvailability.tsx)
- It looks orphaned because the row above it is broken.

**Bug 4 (accessibility): collapsed nav items lose their names**
- The `NavLink`s render only `<Icon/>` and a `<span>` label. — [WorkspaceShell.tsx:348-357](src/app/shell/WorkspaceShell.tsx)
- Collapsed CSS hides that span with `display: none`. — [shared.css:279](src/styles/shared.css)
- `display: none` removes the text from the accessibility tree, so the collapsed nav links and the search trigger (its span and kbd are hidden too) have no accessible name and no tooltip. This violates DESIGN.md's "Every control has an accessible name". — [DESIGN.md:117](DESIGN.md)
- The repo has no Tooltip component: `src/components/ui` contains alert-dialog, badge, button, dialog, dropdown-menu, input, label, scroll-area, select and table.

**Rule duplication**
- The collapsed rules in `shared.css:265-301` duplicate the `@media (max-width: 820px)` block in `responsive.css:37-76` and `shell.css:394-419`. The two copies have already diverged: the media query hides `.sidebar-collapse`, the class-based copy does not.

### Proposed fix (not applied)
CSS, replacing or extending `src/styles/shared.css:265-301`. Use `.app-shell.sidebar-is-collapsed` (specificity 0,3,0) so it also wins over `workspace-design.css`:

```css
.app-shell.sidebar-is-collapsed .sidebar {
  width: 72px;               /* content box 72-24-2 = 46px, room for a 36-44px target */
  flex-basis: 72px;
  padding: 20px 12px 12px;
  align-items: center;       /* centre every child column */
}
.app-shell.sidebar-is-collapsed .brand-row {
  flex-direction: column;    /* mark above toggle, or see the swap variant below */
  gap: var(--space-3);
  padding: 0 0 var(--space-3);
}
.app-shell.sidebar-is-collapsed .sidebar-collapse { margin-left: 0; }
.app-shell.sidebar-is-collapsed .sidebar-bottom-header { min-height: 0; }
.app-shell.sidebar-is-collapsed .sidebar-utilities {
  flex-direction: column;    /* bell / theme / logout stacked */
  gap: var(--space-1);
}
.app-shell.sidebar-is-collapsed :is(.sidebar-utilities .icon-button, .nav-item, .command-trigger) {
  width: 40px; height: 40px; min-height: 40px; padding: 0; justify-content: center;
}
```

Swap variant (Linear/Notion style, saves a row): when collapsed, hide `.brand-mark` and show only the toggle, or render the toggle in place of the mark on hover or focus. In JSX: `{collapsed ? null : <BrandMark/>}` or a single button that shows `BrandMark` and swaps to `PanelLeftOpen` on hover. Lucide's `PanelLeftClose`/`PanelLeftOpen` icons describe the toggle better than `Menu`.

JSX changes in `WorkspaceShell.tsx`:
- On each `NavLink` and on the `.command-trigger`, add `aria-label={collapsed ? label : undefined}` and `title={collapsed ? label : undefined}`, or add a small tooltip primitive (none exists, so one would need to be added and listed in `docs/engineering/catalog.md`). Also add `title` to the bell, theme and logout buttons, which currently have only `aria-label`.
- Optionally move the theme and logout buttons into the `WorkspaceAvailability` popover when collapsed. That leaves just the bell and avatar in the rail footer, as in Front, Linear and Intercom.

Other changes:
- Persist the collapse state with `localStorage` `mend.sidebar-collapsed`, matching `mend.theme` (`App.tsx:223,324`). Wrap the access in try/catch.
- Consolidate the duplicated collapsed rules into one selector list used by both `.sidebar-is-collapsed` and `@media (max-width: 820px)`. At ≤820px, either show the expand toggle or document that the rail is forced.
- Add `overflow: hidden` (or `overflow-x: clip`) on the collapsed `.sidebar` as a safety net, once the popovers and notification panel are confirmed to portal or position outside it. The notification panel already uses `createPortal` to `document.body` (`WorkspaceShell.tsx:164`). The availability popover is positioned absolutely inside the rail (`shell.css:232-244, 421-434`), so clipping would hide it. Prefer `overflow-x: clip` only after moving that popover to a portal.
- Add a Playwright regression test at 1440×900 that collapses the sidebar and asserts every `.sidebar *` bounding box stays within the `.sidebar` bounding box.

### Inferences
- The user's "~90px" estimate likely includes the 16px outer margin and the visible overflow. The computed rail width from CSS is 58px. A 72px rail matches DESIGN.md's 4px grid and leaves room for 40px hit targets plus padding. 44px targets would need 72 − 24 = 48px of content, which fits with 12px padding minus the 2px border, about 46px. That is tight, so 76px or 10px padding works if 44px targets are required.

### Gaps
- The collapsed state was not rendered in a browser, so pixel positions are computed from CSS, not measured.
- Whether `.icon-button` sizes are overridden in the shell by other rules was checked only for `workspace-design.css:58-62` (radius only) and `control-room.css:131-135` (mobile topbar only).

## Q4. What is the inbox three-pane layout and which files hold it?

### Takeaway
The inbox is one grid inside a single opaque, rounded "feature" card: a resizable conversation rail, the conversation panel (header, message canvas, composer), and a collapsible case-context column that hosts the Zelo customer panel. Almost everything is in one 4.5k-line page component.

### Cited Findings
- Page: `src/features/inbox/pages/InboxPage.tsx` (4,532 lines). It contains:
  - The layout root: `div.inbox-layout` with modifiers `mobile-conversation-open`, `no-visible-conversation` and `is-resizing-rail` (line 2405).
  - `section.conversation-rail` (2408), `section.conversation-panel` (2556) with `.message-canvas-shell` and `.message-canvas-scroll-area` (2582-2584), and `<InboxCaseContext>` (2763) wrapping `<ZeloCustomerPanel>` (2780).
  - `header.conversation-header` (3351) and the composer (`.composer-toolbar`, `.composer-input-row`, from 4301).
  - Context collapse is persisted under `mend.inbox-context-collapsed` (230).
  — [src/features/inbox/pages/InboxPage.tsx](src/features/inbox/pages/InboxPage.tsx)
- Components in `src/features/inbox/components/`: `InboxCaseContext.tsx` (toggles the `.collapsed` class, with a drawer mode on small screens, lines 26-60), `ZeloCustomerPanel.tsx`, `ContactAvatar.tsx`, `MessageMedia.tsx`, `AudioWavePlayer.tsx`, `NewChatDialog.tsx`, `ShareContactDialog.tsx`, `RecordingIndicator.tsx` and `WhatsAppText.tsx`. — [src/features/inbox/components/](src/features/inbox/components)
- Base grid: `.inbox-layout { --inbox-rail-width: 320px; grid-template-columns: var(--inbox-rail-width) minmax(0,1fr) minmax(260px,290px); height: calc(100vh - 113px); }`. — [src/styles/features/inbox.css:22-31](src/styles/features/inbox.css) (2,245 lines total)
- Live override: `.app-shell .inbox-layout { grid-template-columns: var(--inbox-rail-width, 250px) minmax(0,1fr) 235px; height: calc(100dvh - 139px); border-radius: var(--radius-feature); overflow: hidden; }`. The page padding is `25px 27px 27px`. The file header says the layout was mapped from `mend-financeiro-conceito.html`. — [src/styles/prototype-inbox-shell.css:1-26](src/styles/prototype-inbox-shell.css)
- At ≤1050px and ≤820px the grid drops to two columns (rail + panel). — [src/styles/responsive.css:19-21, 82-84](src/styles/responsive.css); [prototype-inbox-shell.css:179](src/styles/prototype-inbox-shell.css)
- The context column has `border-left: 1px solid var(--line-strong)`, and its body is hidden when `.collapsed`. — [inbox.css:414-420, 2231-2237](src/styles/features/inbox.css)
- Inbox visual treatment:
  - The layout card is `--surface` with `--radius-feature`. — [workspace-design.css:103-109](src/styles/workspace-design.css)
  - Conversation rows are inset by 8px with `--radius-nav`. The selected row is `--action-wash` with an inset `--line` ring. — [workspace-design.css:119-127](src/styles/workspace-design.css)
  - Inbound bubbles are `--surface-hover` with radius `4px 15px 15px 15px`. Outbound bubbles are `--action-fill` with white text and radius `15px 4px 15px 15px`. — [workspace-design.css:132-140](src/styles/workspace-design.css)
- Mobile (≤ phone breakpoint) hides `.sidebar` entirely and uses `.mobile-topbar` and `.mobile-bottom-nav` (Dashboard, Financeiro, Caixa de entrada, Chamados + "Mais"). — [src/styles/features/kanban.css:854-856](src/styles/features/kanban.css); [WorkspaceShell.tsx:408-577](src/app/shell/WorkspaceShell.tsx)

### Inferences
- Unlike most helpdesks, which use edge-to-edge panes with hairline dividers, the three panes live inside one rounded opaque card floating on the gradient canvas, next to a floating glass rail. With the sidebar collapsed this card can grow by about 176px (248 → 72), which is the main practical benefit of fixing the collapsed state.
- The live column widths come from `prototype-inbox-shell.css`, not `inbox.css`. Mockups should use 250px rail (resizable), fluid centre and a 235px context column.

### Gaps
- The exact breakpoint value for the mobile media query in `kanban.css` around line 854 was not read in full. It is presumably 650px, per MEND_DESIGN_PATTERNS.md, but this was not verified.
