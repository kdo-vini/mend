# Mend design direction

Mend is a quiet control room for founders who still own the customer
relationship. The interface should make the next safe product decision obvious:
message, context, evidence, verified fix.

The repository has two visual registers connected by the same brand system:

- Marketing is the Stitch x Solaris expression: a near-black stage, a compact
  floating navigation bar, controlled Signal Blue illumination, tightly set
  display type, and a dominant product window in the first fold. Later sections
  use dark framed capability surfaces, explicit workflow proof, and restrained
  state-driven motion.
- The authenticated workspace is the Midnight Control Room: compact, dark,
  operational, and dense enough for daily support work.

## Approved brand system

The Google Stitch brand board is the source of truth for the Mend identity.

- Mark: **Closed Loop**, the approved interlocking `all_inclusive` loop from the
  Google Stitch identity screen `e143bd917ab7407da35c7a0c023d74c6`. Use the
  shared `BrandMark` component or `public/mend-mark.svg`; do not redraw,
  approximate, or substitute it with a square, rotated diamond, elongated
  chain link, circle-and-dot, or generic sparkle.
- Wordmark: `Mend`, set with a clean, compact grotesk.
- Signal Blue: `#2E7DFF`. Use for primary actions, links, selection, and the
  relationship between objects.
- Ink / Main background: `#0B0E14`.
- Surface Low: `#10131B`.
- Surface Mid: `#191B23`.
- Operational Olive: `#849270`. Use only for calm, verified, or operational
  states.
- Tertiary Orange: `#D65F00`. Reserve for exceptional tertiary emphasis; it is
  not a brand accent.
- Neutral: `#747780` for technical muted content.

The marketing canvas is `#07090D`, with `#0B0E14`, `#10131B`, and `#171A22`
providing depth. Signal Blue may create one restrained radial illumination in
the hero, matching the Solaris composition; it is never used as gradient text.
Do not introduce purple, rainbow color, decorative gradients, default
glassmorphism, or a global WhatsApp green.

## Typography

- Geist is the display face for marketing headlines and the wordmark treatment.
- Inter is the body and product UI face.
- JetBrains Mono is the technical face for IDs, labels, evidence states, and
  implementation details; DM Mono remains a fallback for existing workspace
  surfaces during migration.
- Marketing display type is large and short: approximately 58–104px on
  desktop, 48–68px on mobile, with tight tracking and balanced wrapping.
- Product type stays compact: 10–12px metadata, 13px body, and 17–26px page
  headings.

## Geometry and layout

- Use a 4px base grid and the shared `--space-*`, `--radius-*`, `--z-*`, and
  focus tokens for product UI.
- Marketing uses a 1180px content frame with 24px desktop gutters and 16px
  mobile gutters. The floating navigation is capped at 1024px.
- Marketing mockups use a 14–16px outer radius. Product UI inside a mockup keeps
  the operational 12px, 8px, and 6px radii.
- Use 1px rules, flat surfaces, and restrained shadows. A marketing mockup is
  a proof object, not a decorative floating card.
- The landing page structure is: floating header, centered announcement + hero,
  product window filling the lower first fold, continuous proof strip,
  two-column capability surfaces, message-to-fix loop, founder / boundary
  section, design partner CTA, and minimal footer.
- The signature line is the Closed Loop relationship: it may connect real
  stages in a flow, but must not become a decorative background grid.

## Canonical landing example

The public landing is the executable reference for this system. Use it to
evaluate new marketing surfaces before inventing another composition:

- Implementation: `src/features/marketing/LandingPage.tsx`
- Scoped visual language: `src/styles/features/marketing.css`
- Copy contract: `src/i18n/locales/en-US/marketing.json` and
  `src/i18n/locales/pt-BR/marketing.json`
- Shared identity: `src/components/BrandLockup.tsx` and `public/mend-mark.svg`

The reference composition is intentionally specific: a centered hero inside a
quiet near-black stage, a capped floating header, one Signal Blue halo, a
large semantic product window in the first fold, a continuous proof strip,
two-column capability surfaces, the message-to-fix loop, a visible founder
approval boundary, and a restrained closing CTA.

When extending the system, preserve these decisions:

- Treat the product window as proof of the support loop, not as a decorative
  dashboard screenshot.
- Use blue to establish relationships and next actions; use olive for calm or
  verified states; keep exceptional colors semantic and sparse.
- Prefer flat framed surfaces, 1px rules, compact controls, and intentional
  hover/state motion over generic cards, glassmorphism, or ornamental effects.
- Keep the landing semantic and bilingual so the same visual reference can be
  reviewed in both locales and at `1440x900` and `390x844`.

`DESIGN.md` is the single design-system source of truth. Update this file and
the executable landing together when the shared visual direction changes; do
not create a second design-system document with competing tokens or layout
rules.

## Product register

The workspace remains the Midnight Control Room. The sidebar, page frame,
Inbox-first hierarchy, issue drawers, run ledger, and settings patterns should
stay compact and predictable. Use blue for selection and engineering state,
olive for calm operational state, green only for channel/success semantics,
amber for warning, and red for danger.

The app shell and marketing header must use the same `BrandMark`. Shared brand
changes belong in `src/components/BrandLockup.tsx` and its shell styles; do not
maintain a second logo in a page component.

## Interaction and accessibility

- Every interactive control needs an accessible name, visible `:focus-visible`
  state, and a disabled state while its operation is pending.
- Maintain AA contrast. Never communicate state with color alone.
- Marketing copy is bilingual by contract. Every visible string must exist in
  both `en-US` and `pt-BR`, pass through the active profile language, and pass
  `npm run i18n:check` plus `npm run i18n:frontend`.
- Mobile must stack or scroll intentionally. No clipped headline, hidden CTA,
  or horizontal page overflow.
- Motion is optional and subordinate to comprehension. Respect
  `prefers-reduced-motion`; do not add perpetual aura, tilt, or background
  animation.
- Product confirmations use the shared `ConfirmDialog` pattern. Do not use
  browser-native `alert`, `confirm`, or `prompt` in product UI.

## Implementation rules

- Read `docs/product/MEND_PRODUCT_STRATEGY_V1.md`,
  `docs/design/MEND_DESIGN_PATTERNS.md`, and the i18n contract before changing
  UI.
- Reuse `src/components/ui/` primitives and existing state patterns before
  adding a one-off control.
- Keep feature API calls in the feature's `api.ts`; UI does not create direct
  Supabase queries.
- New colors, spacing, radius, and layering values belong in tokens or the
  scoped marketing layer. Avoid arbitrary one-off values in product surfaces.
- Visual review is required at desktop `1440x900` and mobile `390x844`, with
  the Maestri QA portals when available.
