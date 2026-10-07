# Mend design direction — Céu e Profundo

`DESIGN.md` is the single design source of truth for this repository. The full
brand kit (logo files, contrast tables, voice, applications and live component
previews) lives in the Mend design system artifact; this file holds the rules
every UI change must follow, and `src/styles/tokens.css` holds the values.

Mend is a quiet control room for founders who still own the customer
relationship. Every surface makes the next safe decision obvious: message,
context, evidence, verified fix.

## The idea

The whole brand comes from two places already in the product:

- **Céu** — the light, softly lit canvas where people work and read
  (`--canvas` with two glows, glass navigation, opaque white cards).
- **Profundo** — the deep blue of the finance result card: the brand's single
  dark moment, used **once per screen** for the thing that matters most.

The app, the site, authentication and the app icon all draw from these two.
There is no separate marketing palette. The older "Solaris" near-black stage and
"Midnight Control Room" directions are retired.

## Principles

1. **The next safe decision first.** One key result per screen (on Profundo)
   and one primary action per view.
2. **Evidence over assertion.** Show what was checked; never imply analysis,
   reconciliation or completeness that did not happen.
3. **Calm density.** Compact operational screens; calm comes from hierarchy,
   rules and space, not from hiding information.
4. **One sky, one deep, one loop.** Céu is the ground, Profundo the emphasis,
   the Closed Loop mark the only symbol.
5. **Bilingual by default.** `pt-BR` first, `en-US` always.

## Tokens (`src/styles/tokens.css`)

Use semantic names only; never hex values in feature CSS. Themes: `light`
(Céu, primary) and `dark` (Noite, the same sky at night). Profundo, `--brand`
and the action fill are identical in both themes.

| Role       | Tokens                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| Ground     | `--canvas`, `--canvas-glow`, `--canvas-glow-2`, `--canvas-gradient`                                          |
| Glass      | `--glass`, `--glass-line` (navigation only; opaque fallback `--surface-subtle`)                              |
| Surfaces   | `--surface` → `--surface-hover` → `--surface-selected`                                                       |
| Rules      | `--line`, `--line-strong`, `--line-control` (form controls, 3:1)                                             |
| Text       | `--text`, `--text-secondary`, `--text-muted`                                                                 |
| Brand blue | `--brand` (#2E7DFF): mark, app icon, halos — never text on light                                             |
| Action     | `--action`, `--action-strong`, `--action-wash`: links, focus, selection                                      |
| Primary    | `--action-fill-highlight` → `--action-fill`, `--on-action`                                                   |
| Profundo   | `--deep`, `--deep-shade`, `--deep-tint`, `--deep-glow`, `--deep-gradient`                                    |
| On deep    | `--on-deep`, `--on-deep-muted`, `--on-deep-{positive,caution,negative}`, arrows                              |
| States     | `--positive`, `--caution`, `--negative`, `--negative-text`; `--channel-whatsapp`                             |
| Radii      | `--radius-control` 10 · `--radius-nav` 12 · `--radius-card` 16 · `--radius-feature` 22 · `--radius-shell` 24 |
| Space      | `--space-1` … `--space-6` (4px grid) and the page-frame tokens                                               |
| Type       | `--font-display` (Geist), `--font-product` (Inter), `--font-technical` (JetBrains Mono)                      |

State tints are `color-mix(in oklch, var(--state) N%, transparent)` so they
follow the theme. Retired: olive, tertiary orange, purple, near-black stages,
decorative gradients.

## Materials

| Material | Where                                                        | Never               |
| -------- | ------------------------------------------------------------ | ------------------- |
| Glass    | Sidebar, period bar, toolbars, dropdowns                     | Under data          |
| Opaque   | Cards, tables, forms, messages, dialogs                      | Translucent         |
| Profundo | The one key result; site hero and closing CTA; app icon tile | Twice on one screen |

On Profundo the primary action inverts to a white fill with `--deep` text.

## Hierarchy

| Level               | Built with                                     | Per screen |
| ------------------- | ---------------------------------------------- | ---------- |
| L0 · Key result     | Profundo + hero figure (`--on-deep`)           | 0–1        |
| L1 · Page + primary | Page title (Geist 30) + one primary button     | 1 + 1      |
| L2 · Structure      | Section heading 17, panel title 18, figures 21 | A few      |
| L3 · Content        | Body 13 / body-strong 13·550 on `--surface`    | Most       |
| L4 · Context        | Supporting 12, label 11, `--text-muted`        | As needed  |

Actions rank: primary (one per view) → ghost (page alternatives, in-card
actions) → secondary (settings forms) → text link → row menu. Danger is never
primary and is always confirmed with `ConfirmDialog`.

## Type

Fonts are self-hosted variable files in `src/assets/fonts` (SIL OFL). Geist only
for page titles and the wordmark; Inter for everything else, including figures
(`tabular-nums` for money); JetBrains Mono only for real identifiers. Sentence
case everywhere: no uppercase eyebrows, no letter-spaced labels, nothing below
11px.

## Layout

- Every workspace page uses the shared page frame (`--page-padding-*`); see
  [Mend UI design patterns](docs/design/MEND_DESIGN_PATTERNS.md).
- Floating glass sidebar: 16px inset, `--radius-shell`, `--shadow-float`.
- Canonical screen order: header (title left, actions right, primary last) →
  controls (glass bar) → the one key thing → supporting cards.
- `--radius-feature` for top-level panels on the canvas (Profundo, attention,
  provider balances, ledger, inbox layout, settings sections);
  `--radius-card` for bars, dropdowns and nested cards.

## Logo

Use `BrandMark` / `BrandLockup` (`src/components/BrandLockup.tsx`) or
`public/mend-mark.svg`. The mark is `--brand`; never redraw, recolour by filter,
rotate or use it as a pattern. App icons put the mark on a Profundo (#16375C)
tile.

## Interaction and accessibility

- WCAG 2.2 AA in both themes. Text 4.5:1; control borders, icons and focus 3:1.
- Every control has an accessible name, a visible `:focus-visible` ring
  (`--focus-ring`) and a disabled state while its request is pending.
- Never communicate state with colour alone.
- Motion: 120–160ms transitions; a 280ms spring press on buttons only; no
  perpetual decoration; respect `prefers-reduced-motion` and reduced
  transparency.
- Confirmations use `ConfirmDialog`; never `alert`, `confirm` or `prompt`.
- Every visible string exists in `pt-BR` and `en-US` and passes
  `npm run i18n:check`.

## Finance specifics

Financial information appears only in Finance. The attention queue reports
deterministic coverage checks; it must not imply AI analysis, bank
reconciliation or completeness beyond them. On Financeiro, Profundo belongs to
the result card; Zelo totals and provider balances are opaque cards.

## Pending migration

The public landing (`src/features/marketing`, `marketing.css`) and
authentication (`auth.css`) still use the retired Solaris stage. They move to
Céu e Profundo next: a Profundo hero on Céu with a real product screen as proof,
opaque section cards, and a Profundo closing CTA.

## Review

Review every UI change at 1440×900 and 390×844 in both themes. Squint test:
one Profundo block, one blue button and the page title should read first.
