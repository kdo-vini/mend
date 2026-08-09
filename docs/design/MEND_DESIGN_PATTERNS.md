# Mend UI design patterns

Status: canonical implementation guidance for workspace UI.

Read this file together with [`DESIGN.md`](../../DESIGN.md) before changing a
feature UI. `DESIGN.md` defines the product mood, color semantics and system
contract; this file defines the layout rhythm that keeps pages aligned with the
Mend shell.

## Page frame

Every workspace page owns the same outer frame. The frame is part of the
product pattern, not a page-specific margin:

| Context                    | Block padding | Inline padding |
| -------------------------- | ------------: | -------------: |
| Desktop                    |        `29px` |         `34px` |
| Compact shell (`<= 820px`) |        `22px` |         `17px` |
| Mobile shell (`<= 650px`)  |        `16px` |         `13px` |

Use `var(--page-padding-block)` and `var(--page-padding-inline)` instead of
retyping these values. Use the compact tokens below `820px` and the mobile
tokens below `650px`.

The global sidebar is outside this frame. A page's first visible content must
start after the frame, including pages with a secondary navigation column.
Settings V2 therefore uses the same frame around its sidebar and content; the
secondary navigation must never touch the global sidebar edge.

## Spacing scale

The base scale is 4px:

| Token       |  Value | Use                                  |
| ----------- | -----: | ------------------------------------ |
| `--space-1` |  `4px` | icon/text detail, tiny metadata gaps |
| `--space-2` |  `8px` | controls, nav items, compact lists   |
| `--space-3` | `12px` | rows, toolbars, card padding         |
| `--space-4` | `16px` | form groups, dense surface padding   |
| `--space-5` | `20px` | local section separation             |
| `--space-6` | `24px` | larger local separation              |

The page frame tokens are intentionally separate from the base scale because
they preserve the existing Mend shell geometry. New spacing should use a token
or an existing component pattern; do not introduce one-off margins to visually
repair a page.

## Layout patterns

### Standard page

Use `.page` or `.inbox-page` for a single-column page. The shared
`PageHeader` owns the `25px` header-to-content rhythm. Toolbars use an `8px`
control gap and sit `12px` above the primary list/table.

### Secondary navigation

Use the Settings V2 geometry tokens:

- `--settings-nav-width`: `185px` desktop navigation column;
- `--settings-nav-gap`: `45px` between navigation and content;
- `--settings-nav-width-compact`: `150px` at intermediate widths;
- `--settings-nav-gap-compact`: `28px` at intermediate widths.

The secondary navigation is a navigation surface, not a card. Keep it quiet,
left aligned and visually subordinate to the page content.

### Sections and lists

- Section headers align to the section content and use a `15px` header gap.
- Sections close with a divider, `27px` bottom padding and `28px` outer
  separation, matching issue detail sections.
- Dense list rows use `12px` padding and a `7px` list gap when the rows are
  separate surfaces.
- Tables remain border-separated and dense; do not turn a table into spaced
  cards on desktop.

### Mobile

At `<= 820px`, secondary navigation becomes a labeled native selector and the
page uses the compact outer frame. At `<= 650px`, the shell switches to the
mobile frame, two-column forms stack and section actions become full-width
where needed. The page must not create horizontal overflow; actions remain
available through stacking or scrolling.

## Review contract

Before merging a UI change, verify:

- the first content edge matches another page at the same viewport;
- the page frame uses the shared tokens;
- secondary navigation has not changed the outer frame;
- section/list rhythm uses the documented patterns;
- mobile padding and control stacking are usable;
- keyboard focus and reduced motion remain covered by the shared system.
