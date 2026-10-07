# Mend workspace design system

Status: approved by Vinicius following the interactive HTML review, October 2026.
This supersedes older workspace color, geometry and typography guidance in
DESIGN.md. Marketing and authentication retain their separate compositions.

## Intent and scope

An internal Diagium workspace with perceptible glass navigation, clear hierarchy
and satisfying, restrained motion. Preserve the real controls and information
density of Inbox, Issues, Settings and Finance. The approved prototype is a visual
reference, not a replacement data model. Never ship its synthetic records,
demonstration controls, fake agent suggestions or invented financial charts.

Finance belongs exclusively in Finance. Dashboard resumes real operational work.
Diagium is the company; Zelo is one of its projects. Projects have their own
sidebar page and link to filtered Finance views. Existing authorization, bridge,
mutations, error states, drafts and audit contracts remain intact.

## Typography

Use the existing font delivery; add no font dependency.

| Role                    | Family                     | Size / weight                |
| ----------------------- | -------------------------- | ---------------------------- |
| Page title and wordmark | Geist, Inter, system sans  | 28–34px / 600–700            |
| Section title           | Inter, system sans         | 16–20px / 600                |
| Body and controls       | Inter, system sans         | 13px / 400–600               |
| Supporting copy         | Inter, system sans         | 12px / 400–500               |
| Technical IDs and code  | JetBrains Mono, monospace  | 11–12px / 400                |
| Financial amounts       | Inter with tabular figures | 20px; primary result 42–60px |

Settings deliberately uses proportional Inter for Workspace, navigation groups,
breadcrumbs and labels. No uppercase mono eyebrows or wide tracking there.
Breadcrumbs are secondary (12px); page headings are primary (28px); section
headings are 17px. Monospace belongs only to actual technical identifiers.

## Color and material

Light canvas #edf2f7, ink #182d44, muted #52677e, opaque surface #ffffff.
Dark canvas #101b2a, ink #e1eaf7, muted #b2c3d9, surface #1b2b40.
Blue is the action and selection color. Green is verified/success; amber is
provisional/attention; red is negative/error. Color never replaces labels.

Use translucent, blurred material on the global navigation, toolbars and dropdown
surfaces. Tables, messages, settings forms and financial data remain opaque.
Provide solid fallbacks for reduced transparency and unsupported backdrop-filter.
The financial summary uses deep blue with high-contrast white numbers.

## Geometry and hierarchy

Reuse the shared page frame. Desktop sidebar floats with a 16px outer inset,
24px corners, and compact controls. Keep the existing collapsed and mobile modes.
Use 10px control, 16px card and 20px panel radii. No extra prototype header.
Financial summary and attention sit side by side when space permits; ledger below.
Inbox retains list, conversation, optional context panel, composer and all menus.
Issues retain list/board, filters, actions and mobile equivalents.
Settings navigation remains subordinate to the content, with a single reading
hierarchy and grouped form sections. Other settings routes inherit the system.

## Interaction and accessibility

Keep existing dropdown semantics, portals, keyboard behavior and focus restoration.
Use a short spring press on action buttons; avoid transforming resize handles,
switches or table rows. Pending state follows actual requests, never fake timers.
Reduced motion removes transforms and animation; reduced transparency is opaque.
Maintain visible focus, 44px mobile targets, readable secondary text and no page
overflow at 390px. Respect persisted theme and language settings.

## Implementation plan and acceptance

1. Establish workspace tokens/material/typography; document precedence in DESIGN.
2. Apply shared shell, controls, dropdown and settings styles to existing routes.
3. Remove Dashboard finance; compose real Finance summary and attention as approved.
4. Verify Inbox controls, Issues list/board, Settings forms and Finance in both
   themes and mobile. Keep all permission/error/pending behavior.
5. Run typecheck, build, lint, i18n, format, relevant tests and full E2E; inspect
   rendered screenshots. For this delivery Vinicius waived the independent QA
   gate and requested Luna implementation assistance with final review by Tibo.

The subsequent user-approved scope adds the project catalog migration, explicit
financial deletion controls (audited cancellation), and read-only provider fees,
balances and payouts. See the project/finance contract in the engineering docs.
Never infer missing fees or bank arrival dates. Provider balances are not revenue.

## Project and media extensions

Projects use the same page header and opaque cards, with proportional headings,
an inline editor, native confirmation dialog for archiving and direct Finance
links. Archived projects retain historical financial references.

Voice notes use a compact wave timeline, circular play/pause button, elapsed
time and an accessible seek range. Wave bars are decorative; their progress
follows the actual audio clock. Preserve message transcripts and error states.
