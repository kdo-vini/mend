# Mend landing — Tier A review rubric

## Reference benchmark

Measured from `https://solaris.shadcn.io` at 1920 × 895:

- Page height before footer: approximately 6,873px.
- Eight major narrative sections.
- Hero: approximately 1,288px.
- Logo/social-proof rail: approximately 220px.
- Large 2 × 2 capabilities: approximately 1,120px.
- Compact 3 × 2 capabilities: approximately 788px.
- Use cases: approximately 804px.
- Testimonial: approximately 776px.
- Pricing: approximately 1,042px.
- Final CTA: approximately 316px.
- Separate full multi-column footer.

The pre-rebuild Mend landing measured approximately 2,596px with four sections. A visually polished but similarly short page does not meet the brief.

## Acceptance gates

### Composition

- Floating navigation reads as a deliberate object, not a full-width app toolbar.
- Hero has centered hierarchy, meaningful product proof, and enough vertical breathing room.
- Section pacing varies; not every section repeats the same heading + equal card grid formula.
- The page includes all eight narrative beats plus a real footer.

### Brand translation

- Solaris product names, logos, illustrations, enterprise claims, and metrics are absent.
- Mend positioning is clear in the first viewport.
- WhatsApp → context → issue → run → review is visible, not only described.
- Copy speaks to solo founders, SaaS teams, and vibe coders.

### Motion

- Hero entrance is orchestrated once.
- Pointer-reactive cards track the cursor on fine pointers.
- At least two card visuals communicate real Mend states.
- Mobile menu, carousel, pricing toggle, and CTAs have complete state transitions.
- Touch devices do not execute hover tilt.
- Reduced-motion mode remains composed and complete.

### UX and accessibility

- All buttons and links are semantic and keyboard reachable.
- Focus is visible.
- Carousel and pricing controls expose selected state.
- No content or action depends only on hover or color.
- PT-BR and EN-US have full key parity and no mojibake.

### Engineering

- No backend or authenticated workspace behavior changes.
- No copied minified Solaris JavaScript.
- No unnecessary dependency or oversized always-running animation loop.
- Offscreen work is paused or CSS-driven.
- Typecheck, lint, formatting, i18n, build, unit, and E2E validations pass.

## Review verdict

Approve only when the new page is structurally complete, visually comparable to the reference, smooth at desktop and mobile widths, and clearly belongs to Mend.
