# Design system

## Mood

Midnight control room after the last customer message: cool monitor light, quiet urgency, a few reliable signals, no decorative noise.

## Color strategy

Restrained. Near-black neutrals carry the surface; blue-indigo is reserved for selection, primary actions, and engineering state; the olive seed appears as a small operational signal; WhatsApp green is only a channel indicator.

## Tokens

The implemented CSS tokens live in `src/styles.css` and use OKLCH: neutral near-black background, cool-tinted surfaces, high-contrast ink, blue-indigo `--accent`, olive `--signal`, and semantic success/warning/danger states. Spacing follows a 4px base scale (`--space-1` through `--space-6`), controls use `--control-height`, and surfaces use the shared radius tokens. Layering uses the `--z-*` scale; components must not invent arbitrary z-index values.

## Typography

Inter is used for operational text, with DM Mono for identifiers, command hints, and machine-generated run events. The scale is compact: 10–12px metadata, 13px body, 17–26px page headings.

## Signature

The thin blue signal language connects attention states, linked issues, and Codex progress. It is a system of small marks and restrained surfaces rather than a decorative illustration.

## Layout

The app shell uses a compact global sidebar. Inbox is a two-area workspace: conversation rail plus selected conversation. Issue details open in a drawer when context matters, and become a full page only when editing needs room. Tables remain dense and list-first.

## System contract

These rules are part of the product surface, not optional styling preferences.

- Use CSS tokens for color, spacing, radius, focus, motion, and layering. Raw hex colors and one-off spacing values are not allowed in new UI.
- Prefer existing primitives and patterns before adding a component: `ResourceState` for loading, empty, and error states; `ActionMenu` for row actions; the shared button and field classes for controls.
- Loading a resource uses a skeleton preview. Spinners are reserved for an active operation whose progress is indeterminate, such as connect, refresh, send, or delete.
- Row actions stay in an `Actions` column or the equivalent trailing slot. The menu trigger is an icon-only button with an accessible label; destructive actions are separated and confirmed when irreversible.
- Every interactive control needs a visible `:focus-visible` state, a semantic label, and a disabled state when the operation is pending.
- Semantic colors communicate state only: blue for selected/engineering state, olive for operational signal, green for success/channel state, amber for warning, and red for danger.
- Keep the visual hierarchy calm: one primary action per surface, compact metadata, no decorative gradients, and no new animation unless it communicates state.
- Keep data access at the API boundary. UI components may compose API actions and adapters, but must not create direct Supabase queries or duplicate mapping logic.
- Preserve the dense desktop layout while allowing mobile overflow to become horizontal scrolling or stacked controls; never hide an action without an accessible alternative.

## Review checklist

Before merging UI work, verify: tokens are reused; loading/empty/error states use the shared primitives; actions follow the trailing menu pattern; keyboard focus is visible; destructive actions are explicit; mobile layout remains usable; and the change does not add a dependency for behavior already covered by the platform or existing components.
