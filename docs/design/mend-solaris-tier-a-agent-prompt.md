# Mend × Solaris — Tier A implementation brief

You are the senior brand designer and frontend engineer responsible for rebuilding the public Mend landing page to Tier A quality.

## Outcome

Rebuild `/` with the same level of composition, pacing, interaction density, responsive behavior, and completeness as `https://solaris.shadcn.io`, while replacing the Solaris product story with the Mend rebrand.

This is a faithful visual and behavioral adaptation, not a loose moodboard exercise. Reproduce the reference's major page architecture and interaction grammar, but do not copy proprietary minified source code, logos, illustrations, or claims.

## Mend positioning

- Product: Mend
- Descriptor: AI support for SaaS builders
- Audience: solo founders, small SaaS teams, and vibe coders handling customer support through WhatsApp
- Tagline: Keep shipping. Mend the support loop.
- Core loop: WhatsApp conversation → contextual reply → native issue → controlled Agent run → reviewed fix
- Voice: founder-first, precise, technical, direct; never enterprise theater
- Runtime languages: PT-BR and EN-US

## Reference material

- Live reference: `https://solaris.shadcn.io`
- Screenshots:
  - `C:/Users/Vinicius/AppData/Local/Temp/codex-clipboard-a62c7f15-129e-4b39-a96e-22ac299d5a79.png`
  - `C:/Users/Vinicius/AppData/Local/Temp/codex-clipboard-92dfff9c-f72e-4478-8d99-ba6c8afe8076.png`
- Product constraints: `PRODUCT.md`
- Design system: `DESIGN.md`
- Current implementation:
  - `src/features/marketing/LandingPage.tsx`
  - `src/styles/features/marketing.css`
  - `src/i18n/locales/en-US/marketing.json`
  - `src/i18n/locales/pt-BR/marketing.json`

## Required page architecture

1. Floating/pill navigation with Mend identity, anchored section links, login, and primary CTA. Mobile gets a polished animated menu.
2. Centered cinematic hero with the official tagline, concise founder-facing explanation, two CTAs, and an immediate product proof surface.
3. Product preview that looks like the real Mend Inbox and visibly communicates WhatsApp → reply → issue → run.
4. A capability grid comparable in weight to Solaris: six cards, varied content and visual treatments, pointer-reactive border/spotlight, and product-specific animated diagrams.
5. A second, larger 2×2 capability/story grid with meaningful mini-scenes rather than repeated icon cards.
6. Use-case or audience section for solo founders, SaaS teams, and vibe coders.
7. Social proof/testimonial narrative with a functional, accessible carousel or stepped story.
8. Complete pricing section with monthly/annual interaction, clear plan hierarchy, founder-appropriate copy, and no fabricated enterprise compliance claims.
9. Final CTA band and a complete multi-column footer with product, resources, company, legal, and language controls where appropriate.

## Motion direction

- The page should feel alive before the user touches it, but motion must remain controlled.
- Use one orchestrated first-load sequence for hero/nav/product preview.
- Use section-specific reveals, not the same fade-up repeated everywhere.
- Cursor-reactive cards must track pointer position with a focused blue glow, subtle 3D tilt, and active border.
- Animated card diagrams should communicate product state: incoming WhatsApp signal, AI draft, issue creation, Agent execution, review, and shipped fix.
- Pricing toggle, carousel, menu, buttons, and nav all need proper transition states.
- Mobile must avoid desktop tilt and prioritize transform/opacity/clip-path effects that stay smooth.
- Respect `prefers-reduced-motion` with a polished static fallback.
- No bounce or elastic easing. Prefer quart/expo curves.

## Visual rules

- Dark-first, near-black field, crisp white typography, blue-indigo action signal.
- Olive remains a small operational signal. WhatsApp green only denotes the channel.
- Preserve Inter/DM Mono for this phase.
- Avoid gradient text, decorative grid backgrounds, glassmorphism, huge radii, ghost-card shadows, and generic icon-heading-copy repetition.
- Cards max at 16px radius. Use either a border or a restrained short shadow, not a wide soft shadow plus border.
- Hero display max 96px and letter-spacing no tighter than -0.04em.
- Visible keyboard focus, semantic controls, sufficient contrast, no hover-only information.

## Engineering constraints

- Preserve existing backend/API contracts and authenticated app behavior.
- Scope implementation to the public marketing surface and its locale resources unless a shared primitive is truly required.
- Keep every visible string in typed i18n resources for PT-BR and EN-US.
- Do not regress the `/?auth=1` sign-in path.
- Avoid new dependencies unless they materially improve motion and cannot be achieved reliably with existing tools.
- Prefer transforms, opacity, clip-path, CSS custom properties, IntersectionObserver, and the Web Animations API.
- Pause or avoid work when content is offscreen; target smooth performance on mid-range mobile.

## Definition of done

- The visual hierarchy and completeness are recognizably comparable to Solaris at desktop and mobile widths.
- Header, hero, capability grids, testimonial/use-case narrative, pricing, CTA, and footer are all finished—not placeholders.
- Pointer interactions work on fine pointers and gracefully disable on touch.
- PT-BR and EN-US both render without hardcoded or corrupted text.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run i18n:lint`, `npm run build`, and relevant tests pass.
- Inspect the result in a real browser at desktop and mobile widths and iterate at least once after screenshots.

Implement directly. Do not return a proposal-only answer. At completion, list modified files, tests run, visual compromises, and any remaining risk.
