# Design

## Mood

Midnight control room after the last customer message: cool monitor light, quiet urgency, a few reliable signals, no decorative noise.

## Color strategy

Restrained. Near-black neutrals carry the surface; blue-indigo is reserved for selection, primary actions, and engineering state; the olive seed appears as a small operational signal; WhatsApp green is only a channel indicator.

## Tokens

The implemented CSS tokens live in `src/styles.css` and use OKLCH: neutral near-black background, cool-tinted surfaces, high-contrast ink, blue-indigo `--accent`, olive `--signal`, and semantic success/warning/danger states.

## Typography

Inter is used for operational text, with DM Mono for identifiers, command hints, and machine-generated run events. The scale is compact: 10–12px metadata, 13px body, 17–26px page headings.

## Signature

The thin blue signal language connects attention states, linked issues, and Codex progress. It is a system of small marks and restrained surfaces rather than a decorative illustration.

## Layout

The app shell uses a compact global sidebar. Inbox is a two-area workspace: conversation rail plus selected conversation. Issue details open in a drawer when context matters, and become a full page only when editing needs room. Tables remain dense and list-first.
