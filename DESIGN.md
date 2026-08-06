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
- Confirmation actions use the shared `ConfirmDialog` pattern. Never use browser-native `alert()`, `confirm()`, or `prompt()` in product UI.
- Every interactive control needs a visible `:focus-visible` state, a semantic label, and a disabled state when the operation is pending.
- Semantic colors communicate state only: blue for selected/engineering state, olive for operational signal, green for success/channel state, amber for warning, and red for danger.
- Keep the visual hierarchy calm: one primary action per surface, compact metadata, no decorative gradients, and no new animation unless it communicates state.
- Keep data access at the API boundary. UI components may compose API actions and adapters, but must not create direct Supabase queries or duplicate mapping logic.
- Preserve the dense desktop layout while allowing mobile overflow to become horizontal scrolling or stacked controls; never hide an action without an accessible alternative.
- New or modified UI uses the local shadcn/ui primitives in `src/components/ui/` (Radix-based, New York style, CSS variables). Do not add a one-off control when a primitive exists. Tailwind utilities are available without Preflight so the legacy base CSS remains authoritative.

## Confirmation pattern

Confirmations are app-native AlertDialogs built from the shared shadcn primitive. Use `useConfirmation()` from `src/shared/ui/useConfirmation.tsx` and await its Promise before running the action.

- State the decision in a short, sentence-case title using the action verb: “Delete issue?” or “Enable Auto-reply?”.
- Explain the consequence in the description. Do not repeat the title or hide important impact in a toast.
- Keep Cancel available and use a specific confirm label such as “Delete issue” or “Disconnect”.
- Destructive confirmations use the semantic danger button and place initial keyboard focus on Cancel. Non-destructive confirmations use the primary button.
- Escape cancels. The dialog exposes `role="dialog"` and `aria-modal="true"` and must remain usable with keyboard focus.
- One confirmation is shown at a time. Pending destructive actions must disable their initiating control while the operation runs.

## Review checklist

Before merging UI work, verify: tokens are reused; loading/empty/error states use the shared primitives; actions follow the trailing menu pattern; keyboard focus is visible; destructive actions are explicit; confirmations use `ConfirmDialog`; mobile layout remains usable; and the change does not add a dependency for behavior already covered by the platform or existing components.
