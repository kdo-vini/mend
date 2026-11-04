# Fonts and color palettes for Mend's dark-first support inbox (as of Oct 2026)

Context checked in the repo (not web-sourced): Mend already self-hosts **Inter Variable** (`--font-product`), **Geist Variable** (`--font-display`) and **JetBrains Mono Variable** (`src/styles/fonts.css`, `src/styles/tokens.css`). The current dark theme "Noite" uses canvas `#101b2a`, surface `#1b2b40`, hover `#263b54`, selected `#314a69`, text `#e1eaf7` / `#cddbee` / `#b2c3d9`, action text `#75a7ff`, action fill `#235fcf`, brand `#2e7dff`, glass `#263b53b8` with blur. Any recommendation should be read as "keep the current fonts or swap them", not as a font choice made from scratch.

Method note: font facts marked "(measured)" come from my own inspection with fontTools of the Latin woff2 files that the Google Fonts CSS2 API served on 2026-10-29. Google Fonts also returned family metadata (designers, subsets, variable axes, last-modified date) through `fonts.google.com/metadata/fonts`. Contrast ratios marked "(computed)" use the WCAG 2.x relative-luminance formula in a local script. Neither is a third-party claim.

## Candidate UI typefaces (license, Portuguese support, tabular numerals, x-height, variable, users)

### Takeaway
Every candidate is OFL-licensed, on Google Fonts and Fontsource, and renders all pt-BR diacritics. The real differences are x-height (legibility at 12-14px), tabular figures, and personality. On dense-UI metrics **Inter** is still the strongest: it has the largest x-height of the sans candidates, `tnum`, and an `opsz` axis that gives it a Display cut. **Geist** is the closest modern alternative. Mend already ships both, so the cheapest high-quality option is to keep Inter for UI and Geist (or Inter Display) for headings.

### Cited Findings
**Inter / Inter Display**
- Licensed under SIL OFL 1.1, version 4.1 per the license link. Covers 2,000+ glyphs and 147 languages. Variable from 100 to 900, with an optical-size range from "text" to "display": text designs have a taller x-height and ink traps, display designs are cleaner and tighter. `tnum` gives tabular figures with "the same width across all weights". It also offers cv01-cv13 alternates (open 4, flat-top 3, single-story a), ss02 to tell similar characters apart (0 vs O), and a slashed zero. — [rsms.me/inter](https://rsms.me/inter/)
- On Google Fonts it is designed by Rasmus Andersson, with axes `opsz 14-32` and `wght 100-900` and subsets latin, latin-ext, cyrillic, greek and vietnamese. Its popularity rank is #2. — [Google Fonts metadata](https://fonts.google.com/metadata/fonts)
- (measured) x-height/UPM 0.546, cap height 0.728, all pt-BR diacritics (ãõçáéíóúâêôà and capitals) present, `tnum` present. The Google-served file **did not contain cv/ss features**, so those alternates need the rsms.me or npm `inter-ui` build or `@fontsource-variable/inter`. Fontsource builds may also derive from the Google files, so this is unverified.
- Linear's redesign added **Inter Display for headings** and kept regular Inter elsewhere. — [Linear: How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui)

**Geist (Sans) / Geist Mono**
- Licensed under SIL OFL 1.1. Geist Sans has 9 weights, 652 glyphs and 9 stylistic sets. Geist Mono has 9 weights and 669 glyphs and is aimed at "code and tabular content". Geist Pixel is a display variant. Language coverage is listed as 32 languages. It ships via the npm `geist` package and Google Fonts (`next/font/google`), and GitHub releases include variable files. — [vercel.com/font](https://vercel.com/font)
- On Google Fonts it was added 2024-10-01 and last updated 2026-05-13, with `wght 100-900` and subsets latin, latin-ext, cyrillic and vietnamese. — [Google Fonts metadata](https://fonts.google.com/metadata/fonts)
- (measured) x-height 0.530, `tnum` present, pt-BR diacritics present. Geist Mono digits are tabular by default.

**IBM Plex Sans / IBM Plex Mono**
- On Google Fonts the designers are Mike Abbink and Bold Monday. Plex Sans has `wdth 75-100` and `wght 100-700` axes. Subsets include greek and vietnamese. Plex Mono has no variable axes on Google Fonts (static weights). — [Google Fonts metadata](https://fonts.google.com/metadata/fonts)
- (measured) x-height 0.516, which is the smallest of the "UI" group except DM Sans and Figtree. The Google-served Plex Sans has **tabular digits by default** (all digits the same width) and no `tnum` or `pnum` toggle, which suits tables but makes running text look slightly mechanical.

**Manrope**
- Designed by Mikhail Sharanda, `wght 200-800`, latin, latin-ext, cyrillic, greek and vietnamese. Google Fonts lists it as updated 2026-10-27. — [Google Fonts metadata](https://fonts.google.com/metadata/fonts)
- (measured) x-height 0.540, `tnum` and `pnum` present.
- A UX Planet roundup calls its numerals "super clean". This is opinion. — [UX Planet: Top 10 free typefaces for UI design](https://uxplanet.org/top-10-free-typefaces-for-ui-design-118f934b724b)

**DM Sans**
- Designed by Colophon Foundry, axes `opsz 9-40` and `wght 100-1000`, latin and latin-ext only. — [Google Fonts metadata](https://fonts.google.com/metadata/fonts)
- (measured) x-height 0.504, which is low and so smaller-looking at 13px. **No `tnum` in the Google-served file**: digits are proportional.

**Plus Jakarta Sans**
- Designed by Tokotype, `wght 200-800`, latin, latin-ext, cyrillic-ext and vietnamese. — [Google Fonts metadata](https://fonts.google.com/metadata/fonts)
- (measured) x-height 0.536, cap height 0.745 (the tallest caps of the set), `tnum` present.

**Figtree**
- Designed by Erik Kennedy, `wght 300-900`, latin and latin-ext only. — [Google Fonts metadata](https://fonts.google.com/metadata/fonts)
- (measured) x-height 0.500 (the lowest of the set), `tnum` present.
- Sources disagree on its weight count: SEO-style pages say 9, and the designer's own page says 7 weights. — [learnui.design](https://learnui.design/blog/circular-similar-fonts.html); [fontalternatives.com](https://fontalternatives.com/compare/figtree-vs-manrope/)

**Onest**
- Designed by Dmitri Voloshin and Andrey Kudryavtsev under OFL-1.1, variable `wght 100-900`, latin, latin-ext and cyrillic. Available as `@fontsource-variable/onest`. — [Fontsource: Onest](https://fontsource.org/fonts/onest/about); also [Google Fonts metadata](https://fonts.google.com/metadata/fonts), which adds the math, symbols and vietnamese subsets and an update on 2026-08-25.
- (measured) x-height 0.527, `tnum` present.

**Instrument Sans**
- Designed by Rodrigo Fuenzalida and Jordan Egstad, axes `wdth 75-100` and `wght 400-700` (no light weights), latin and latin-ext only. — [Google Fonts metadata](https://fonts.google.com/metadata/fonts)
- (measured) x-height 0.510, `tnum` present.

**JetBrains Mono (current Mend mono)**
- Designed by JetBrains, Philipp Nurullin and Konstantin Bulenkov, `wght 100-800`, latin, latin-ext, cyrillic, greek and vietnamese. — [Google Fonts metadata](https://fonts.google.com/metadata/fonts)
- (measured) x-height 0.550, the largest of all candidates. Digits are tabular by default and `calt` is present (code ligatures).

**Summary table (measured unless noted)**

| Font | x-height/UPM | `tnum` | Variable axes (GF) | Subsets beyond Latin | pt-BR glyphs |
|---|---|---|---|---|---|
| JetBrains Mono | 0.550 | mono | wght 100-800 | cyr, greek, viet | yes |
| Inter | 0.546 | yes | opsz 14-32, wght 100-900 | cyr, greek, viet | yes |
| Manrope | 0.540 | yes | wght 200-800 | cyr, greek, viet | yes |
| Plus Jakarta Sans | 0.536 | yes | wght 200-800 | cyr-ext, viet | yes |
| Geist / Geist Mono | 0.530 | yes / mono | wght 100-900 | cyr, viet | yes |
| Onest | 0.527 | yes | wght 100-900 | cyr, viet | yes |
| IBM Plex Sans / Mono | 0.516 | tabular by default | wdth 75-100, wght 100-700 / static | cyr, greek, viet | yes |
| Instrument Sans | 0.510 | yes | wdth 75-100, wght 400-700 | none | yes |
| DM Sans | 0.504 | **no** (GF file) | opsz 9-40, wght 100-1000 | none | yes |
| Figtree | 0.500 | yes | wght 300-900 | none | yes |

### Inferences
- Portuguese support does not separate the candidates: ã, õ, ç and the acute and circumflex vowels are in Latin-1, which all of them cover. The `latin` subset is enough, and `latin-ext` is only a safety margin for names (for example "ł" or "ő" in customer names).
- A higher x-height reads larger at the same px size. Inter, Manrope and Plus Jakarta hold up at 12-13px in dense lists. DM Sans, Figtree and Instrument Sans need about 0.5-1px more to look equivalent, which works against density.
- In an inbox, counters, SLA timers and ticket IDs should use `font-variant-numeric: tabular-nums`. Every sans candidate except DM Sans (as served by Google) supports it. A separate monospace font is only needed for IDs and code, not for counts.
- Geist and Inter are visually close. Geist is a bit more geometric and "Vercel" in flavor, and Inter is more neutral and has the Display optical size. Manrope and Plus Jakarta have more personality (rounder, wider) and would change Mend's tone toward "friendly SaaS". Onest is a modern neutral alternative but has few big-brand references.
- Recommendation: keep Inter (UI, 13-14px, `tnum` on numbers) plus JetBrains Mono or Geist Mono (IDs and code). For headings, either keep Geist or switch to Inter's `opsz` (Display) axis to drop one font file. Inter's `opsz` range is 14-32 on Google Fonts, so `font-optical-sizing: auto` handles this automatically.

### Gaps
- I could not confirm which major products currently use Manrope, Plus Jakarta Sans, Figtree, Onest or Instrument Sans as their UI font. The available sources were SEO aggregators.
- I did not verify whether Fontsource's Inter package preserves the cv/ss features. The Google-served files strip them.
- SF Pro was not researched in depth. It is licensed only for Apple platforms and cannot be self-hosted on the web. It is reachable only via `system-ui`/`-apple-system` on Apple devices, so it is unsuitable as a consistent brand font for a cross-platform app.
- DM Sans may have `tnum` in its upstream (non-Google) build. That was not checked.

## Monospace companion (JetBrains Mono, Geist Mono, IBM Plex Mono)

### Takeaway
All three are OFL, on Google Fonts and Fontsource, and support pt-BR. **JetBrains Mono**, which Mend already ships, has the largest x-height (0.550) and is variable. **Geist Mono** pairs best stylistically if the headings stay in Geist. IBM Plex Mono is static-only on Google Fonts.

### Cited Findings
- JetBrains Mono: `wght 100-800` variable. Geist Mono: `wght 100-900`, with an extra `symbols2` subset, updated 2026-06-08. IBM Plex Mono: no variable axes on Google Fonts. — [Google Fonts metadata](https://fonts.google.com/metadata/fonts)
- Vercel positions Geist Mono for "code and tabular content", with 9 weights and 669 glyphs. — [vercel.com/font](https://vercel.com/font)
- (measured) x-height: JetBrains Mono 0.550, Geist Mono 0.530, IBM Plex Mono 0.516.

### Inferences
- For counts, Inter with `tabular-nums` is better than a monospace font: it stays in the same voice and avoids a "code" look on badges. Use the monospace font only for ticket and protocol IDs, phone numbers or E.164 strings where character-level scanning matters, and technical logs.
- Keep a single monospace font. Mend's CSS currently mixes `JetBrains Mono`, `var(--font-mono)`, `var(--mono)` and `ui-monospace, SFMono-Regular, Menlo` (observed in `src/styles/features/settings.css`). Consolidating on one token is worth doing whichever font wins.

### Gaps
- I found no rigorous legibility study comparing these monospace fonts at 12px.

## Color directions for the dark UI (hex scales and verified contrast)

### Takeaway
Four directions are worked out below, with tokens for background, surface, elevated, selected, border, three text levels, accent text and fill, and status colors. Each has computed contrast ratios. All primary and secondary text passes WCAG AA (≥4.5:1) on every surface. "Muted" text drops to about 4.4-4.6:1 on the selected surface, so it should only sit on bg, surface or elevated, or be lightened. Direction A, "refined navy", is the smallest step away from Mend's current identity. Direction B, graphite, is the safest for density and neutrality.

### Cited Findings (reference scales)
- Radix 12-step semantics: steps 1-2 for app background and subtle component backgrounds; 3/4/5 for component background normal, hover and pressed/selected; 6/7/8 for borders (subtle non-interactive, interactive, strong/focus); 9/10 for solid fill and its hover; 11/12 for low- and high-contrast text. — [Radix: Understanding the scale](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)
- Radix v3 dark values, read from the `@radix-ui/colors@3.0.0` CSS files on unpkg (e.g. [slate-dark.css](https://unpkg.com/@radix-ui/colors@3.0.0/slate-dark.css)):
  - slate: 1 `#111113`, 2 `#18191b`, 3 `#212225`, 4 `#272a2d`, 5 `#2e3135`, 6 `#363a3f`, 7 `#43484e`, 8 `#5a6169`, 9 `#696e77`, 10 `#777b84`, 11 `#b0b4ba`, 12 `#edeef0`
  - blue: 1 `#0d1520`, 2 `#111927`, 3 `#0d2847`, 4 `#003362`, 5 `#004074`, 6 `#104d87`, 7 `#205d9e`, 8 `#2870bd`, 9 `#0090ff`, 10 `#3b9eff`, 11 `#70b8ff`, 12 `#c2e6ff`
  - indigo: 1 `#11131f`, 3 `#182449`, 6 `#304384`, 9 `#3e63dd`, 11 `#9eb1ff`, 12 `#d6e1ff`
  - teal: 1 `#0d1514`, 2 `#111c1b`, 3 `#0d2d2a`, 6 `#145750`, 9 `#12a594`, 11 `#0bd8b6`, 12 `#adf0dd`
  - jade: 9 `#29a383`, 11 `#1fd8a4`. green: 9 `#30a46c`, 11 `#3dd68c`. amber: 9 `#ffc53d`, 11 `#ffca16`. red: 9 `#e5484d`, 11 `#ff9592`. violet: 1 `#14121f`, 3 `#291f43`, 9 `#6e56cf`, 11 `#baa7ff`, 12 `#e2ddfe`
- Tailwind v4 defines its palette in OKLCH. Examples: slate-900 `oklch(20.8% 0.042 265.755)`, slate-950 `oklch(12.9% 0.042 264.695)`, zinc-900 `oklch(21% 0.006 285.885)`, zinc-950 `oklch(14.1% 0.005 285.823)`, blue-500 `oklch(62.3% 0.214 259.815)`. The v3 hex equivalents I know are slate-900 `#0f172a` and zinc-900 `#18181b`; I did not re-fetch these. — [tailwindcss@4.1.0 theme.css](https://unpkg.com/tailwindcss@4.1.0/theme.css)
- Vercel Geist colors: 10 scales, each with 10 steps (100-1000). 100-300 are component backgrounds (default, hover, active), 400-600 borders, 700-800 high-contrast fills, 900 secondary text and 1000 primary text. There are 2 background tokens, and background-200 is to be used "sparingly". — [Vercel Geist colors](https://vercel.com/geist/colors)
- Linear's redesign generates themes from 3 inputs (base, accent, contrast) in LCH instead of 98 variables. It deliberately **limited how much blue chrome feeds into the calculation** for a "more neutral, timeless" look, and lightened text in dark mode for contrast. — [Linear redesign](https://linear.app/now/how-we-redesigned-the-linear-ui)

### Worked palettes (all ratios computed; text against each surface)

**Current Mend "Noite" (baseline)**: bg `#101b2a`, surface `#1b2b40`, hover `#263b54`, selected `#314a69`.
- Primary text `#e1eaf7` scores 14.3 / 11.8 / 9.4 / 7.5. Muted text `#b2c3d9` scores 9.7 / 8.0 / 6.4 / 5.1. Accent text `#75a7ff` drops to **3.77 on selected** (fails AA for body text).
- White on the `#235fcf` fill is 5.82. The surface steps are large: surface `#1b2b40` is fairly light and saturated, which is part of the "glassy, bluish" feel.
- The legacy blue mentioned in the brief, `#1a6fe0`, scores 4.78 with white text but only 3.38 as text on `#0f2235`, so it should not be used as a text color on navy.

**A. Refined navy (Linear/Vercel-inspired; deeper, less saturated)**

| Token | Hex |
|---|---|
| bg | `#0b1420` |
| surface | `#101b2a` |
| elevated | `#16233a` |
| selected | `#1d2d47` |
| border | `#22324a` |
| border-strong | `#33465f` |
| text | `#e6edf6` |
| text-2 | `#a9b8cb` |
| muted | `#8193a8` |
| accent text | `#7cb0ff` |
| accent fill | `#2563eb` |
| success | `#4cc38a` |
| warning | `#e8b14a` |
| danger | `#f2666f` |
| AI | `#b49cff` |

- On surface: text 14.69, text-2 8.58, muted 5.50, accent 7.85, success 7.82, warning 8.92, danger 5.70, AI 7.54.
- On selected: text 11.73, text-2 6.85, **muted 4.39 (below AA)**, danger 4.55.
- White on the fill is 5.17. The fill against surface is 3.35, which passes the 3:1 non-text contrast requirement.

**B. Graphite / zinc neutral with a blue accent (Radix slate-based)**

| Token | Hex |
|---|---|
| bg | `#111113` |
| surface | `#18191b` |
| elevated | `#212225` |
| selected | `#272a2d` |
| border | `#2e3135` |
| border-strong | `#43484e` |
| text | `#edeef0` |
| text-2 | `#b0b4ba` |
| muted | `#8b9098` |
| accent text | `#70b8ff` |
| accent fill | `#0b6fd6` |
| success | `#3dd68c` |
| warning | `#ffca16` |
| danger | `#ff9592` |
| AI | `#baa7ff` |

- On surface: text 15.15, text-2 8.45, muted 5.48, accent 8.37. On selected, muted is **4.49 (just below AA)**.
- White on the `#0b6fd6` fill is 4.93. Note that Radix blue-9 `#0090ff` with white text is only **3.26**, so a darker fill is needed for white labels.

**C. Teal / green accent (WhatsApp-heavy support)**

| Token | Hex |
|---|---|
| bg | `#0c1514` |
| surface | `#111c1b` |
| elevated | `#172826` |
| selected | `#1d322f` |
| border | `#22403b` |
| border-strong | `#2f5650` |
| text | `#e3f1ee` |
| text-2 | `#a4bfba` |
| muted | `#7f9d97` |
| accent text | `#2fd6bd` |
| accent fill | `#0f766e` |
| success | `#5ad18a` |
| warning | `#f0b54a` |
| danger | `#ff8a85` |
| AI | `#b49cff` |

- On surface: text 15.00, text-2 8.91, muted 5.95, accent 9.52. White on the fill is 5.47.
- WhatsApp brand green `#25D366` with white text is only **1.98**, so the brand green can only serve as an icon or channel chip, never as a fill behind white text.

**D. Indigo / violet accent**

| Token | Hex |
|---|---|
| bg | `#0e0f1c` |
| surface | `#141627` |
| elevated | `#1b1e33` |
| selected | `#232741` |
| border | `#2a2e4a` |
| border-strong | `#3c4166` |
| text | `#e8e9f6` |
| text-2 | `#b0b3cf` |
| muted | `#8a8eae` |
| accent text | `#a5b4fc` |
| accent fill | `#4f46e5` |
| success | `#4cc38a` |
| warning | `#f0b54a` |
| danger | `#ff8a8a` |
| AI | `#5eead4` (teal, because violet is taken by the accent) |

- On surface: text 14.84, text-2 8.69, muted 5.59, accent 8.97. White on the fill is 6.29.
- The fill against surface is **2.85**, which is below 3:1 non-text contrast, so a filled button needs a lighter border or ring to read as a control.

### Inferences
- Direction A keeps Mend's brand (navy plus blue) and moves toward Linear's lesson: less blue saturation in the chrome, with blue reserved for actions and selection. Its biggest practical change from today is a **darker, less saturated surface** (`#101b2a` instead of `#1b2b40`) and smaller elevation steps (surface to elevated about 1.10:1 instead of today's larger jumps).
- Direction B maximizes neutrality, so the colored channel chips (WhatsApp green, email, Instagram) and status colors stand out more. It is the most "pro tool" option, at the cost of the navy identity.
- Direction C ties the brand to one channel (WhatsApp). If the product is omnichannel, a teal accent also collides with "success" green and the WhatsApp chip, and keeping them apart needs care: separate hues (teal around 175° vs green around 150°) plus icons.
- Direction D puts the accent on the hue most AI products use for AI, which forces "AI" onto another hue. Since Mend has an AI state in the inbox header, A or B (blue accent plus violet AI) keeps the semantics cleaner.
- In all four directions, "muted" text should be restricted to bg, surface and elevated, or nudged about 6% lighter (for example A muted `#8b9cb1`) to pass on the selected row. Accent-colored text on selected rows also needs checking (the current Mend `#75a7ff` fails there at 3.77).

### Gaps
- The palettes are my own constructions, anchored on Radix, Tailwind and the current Mend tokens, not sourced from any product. Exact Linear and Vercel dark hex values were not published on the pages fetched.
- Ratios were computed for opaque colors only. Semi-transparent glass surfaces need checking against the actual composited background.

## Best practices: pure black, contrast, glassmorphism, elevation levels, semantic tokens

### Takeaway
Use a dark, slightly tinted gray or navy instead of pure black. Meet 4.5:1 for body text and 3:1 for UI component boundaries. Use 3-4 surface levels with small luminance steps. Keep blur and translucency to overlays (menus, modals, command palette), not to dense list and thread panels. Name tokens by role (Radix 12-step or Geist 100-1000 semantics), not by hue.

### Cited Findings
- Material Design (M2) dark theme uses `#121212` as the base surface instead of black. Higher elevations get a white overlay running from 0% at 0dp through 5% (1dp), 9% (4dp) and 12% (8dp) to 16% (24dp). Material also states a contrast target of at least 15.8:1 for white text, but I could not confirm which surface pair that figure refers to (the primary page did not render for me). — [Material Design 2: Dark theme](https://m2.material.io/design/color/dark-theme) (via search snippet); third-party echo: [prototypr](https://blog.prototypr.io/how-to-design-a-dark-theme-for-your-android-app-3daeb264637)
- (computed) White on `#121212` is 18.73:1.
- WCAG 2.x SC 1.4.3 sets text contrast at 4.5:1, or 3:1 for large text (≥24px, or ≥18.66px bold). SC 1.4.11 requires 3:1 for UI component boundaries and states. — [W3C Understanding 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html); [W3C Understanding 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- NN/g on glassmorphism: use it "sparingly". Check text contrast against every background the translucent element can sit on. Use more blur on busy backgrounds. Offer reduced-transparency or high-contrast options. Prefer platform materials (Apple materials, Microsoft Acrylic). NN/g gives no specific guidance for dense content. — [NN/g: Glassmorphism](https://www.nngroup.com/articles/glassmorphism/)
- Linear uses LCH to create "distinct surface elevations (background, foreground, panels, dialogs, modals)" and explored elevation with black and white opacities. — [Linear redesign](https://linear.app/now/how-we-redesigned-the-linear-ui)
- Radix dedicates 2 app-background steps, 3 interactive-background steps (normal, hover, selected) and 3 border steps per scale. — [Radix scale](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)

### Inferences
- Elevation levels for Mend: **4 surfaces is enough**. They are bg (canvas), surface (list, thread and side panels), elevated (popover, menu, card on surface), and overlay/modal. Hover and selected are interaction states, not elevations. Keep steps around 1.06-1.12:1 luminance ratio, as in the palettes above, and separate panels with 1px borders (around 1.3-1.5:1 against surface) rather than large color jumps.
- In dense panels (conversation list, thread, customer panel), drop `backdrop-filter` blur and semi-transparent fills. Blur costs GPU on long scrolling lists, and contrast becomes a function of whatever sits behind the panel. Reserve the "glass" material for one or two floating elements (command palette, toasts, modal scrim) and honor `prefers-reduced-transparency` where supported, as NN/g's guidance implies.
- Chat bubbles: inbound bubbles on surface+1 (neutral), outbound on an accent wash (for example blue at about 15-20% alpha composited, or a dedicated `#16335a`-like solid), with text kept at the primary text color. Check the composited color, not the alpha token. Avoid fully saturated blue outbound bubbles with white text at 13px unless the fill gives ≥4.5:1 (for example `#2563eb` gives 5.17).
- Semantic token set to aim for, mapping roughly onto Mend's existing names: `canvas`, `surface`, `surface-raised`, `surface-overlay`, `surface-hover`, `surface-selected`, `line`, `line-strong`, `line-focus`, `text`, `text-secondary`, `text-muted`, `action`, `action-fill`, `on-action`, `positive`, `caution`, `negative`, `ai`, `channel-*`. Each state color needs 3 variants: text-on-dark, subtle background, and border.
- 3:1 non-text contrast matters most for focus rings and checkbox and input borders. The palettes' subtle `border` tokens (about 1.35:1) are fine for decorative dividers but **not** for input outlines. Use `border-strong` or brighter for controls. Mend's current `--line-control` (`#7489a3`) serves this role.

### Gaps
- I could not fetch Apple HIG dark-mode text or Material 3 tonal-elevation values directly in this session. M3's tonal elevation (tinting surfaces with the primary color instead of white overlays) is a known concept but is not cited here.
- I found no benchmark quantifying the performance cost of `backdrop-filter` in long virtualized lists.
