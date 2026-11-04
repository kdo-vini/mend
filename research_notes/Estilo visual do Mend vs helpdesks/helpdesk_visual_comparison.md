# Visual design language of modern helpdesk / shared-inbox products (as of Oct 2026)

Scope: Zendesk (Garden), Intercom, Front, Freshdesk (Crayons), Help Scout, Plain, Linear (reference), Chatwoot, HubSpot Service Hub. Missive, Crisp and Gorgias were not researched (budget); see Gaps.
Method: primary sources first (design-system packages on unpkg/GitHub, vendor blogs/changelogs). Third-party "design system reconstruction" sites (opendesigner.io, open-design.ai, hagicode, refero) are flagged as unverified.

## 1. Which font family does each product use in the app UI?

### Takeaway
Most helpdesks use a **system font stack** (Zendesk Garden, Freshworks Crayons, Chatwoot default `sans`), while the "modern minimal" set (Linear, and Chatwoot's newer components) uses **Inter / Inter Display**. Intercom is the outlier with a custom typeface reported as Saans (unverified), and it rolled back an inbox font change in Jan 2025 after complaints about legibility of digits.

### Cited Findings
- **Zendesk Garden** (v9 `@zendeskgarden/react-theming`): `fonts.system = 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Oxygen-Sans', 'Ubuntu', 'Cantarell', '"Helvetica Neue"', 'Arial', 'sans-serif'`. Font sizes xs 10 / sm 12 / **md 14** / lg 18 / xl 22 / xxl 26 / xxxl 36 px; line heights sm 16 / md 20 / lg 24 / xl 28 / xxl 32 / xxxl 44 px (all multiples of base 4). — [Garden theme source (unpkg)](https://unpkg.com/@zendeskgarden/react-theming@9/dist/esm/elements/theme/index.js)
- **Freshworks Crayons** (Freshdesk's design system): `-apple-system, BlinkMacSystemFont, "Segoe UI", roboto, oxygen, ubuntu, cantarell, "Open Sans", "Helvetica Neue", sans-serif`; heading and body text color `#12344d` (elephant-900). — [Crayons CSS (unpkg)](https://unpkg.com/@freshworks/crayons@4/css/crayons-min.css)
- **Chatwoot** tailwind config defines three families: `sans` = `-apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", ...`; `inter` = `['Inter', ...]`; `interDisplay` = `['InterDisplay', ...]`. `darkMode: 'class'`. — [chatwoot tailwind.config.js](https://raw.githubusercontent.com/chatwoot/chatwoot/develop/tailwind.config.js)
- **Linear**: headings use **Inter Display**, body stays **Inter** (March 2024 redesign). — [Linear: How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui)
- Linear is reported to use Inter Variable with OpenType features `cv01`, `ss03` and a signature weight of 510 (between regular and medium). Third-party, unverified. — [design.hagicode.com Linear](https://design.hagicode.com/designs/linear.app/); [open-design.ai](https://open-design.ai/es/plugins/design-system-linear-app/)
- **Intercom**: in Jan 2025 users complained the new inbox font looked monospaced and its dotted zero looked like 8 at a glance. On 28 Jan 2025 Intercom said it had rolled back the inbox font change. — [Intercom Community: Inbox new font](https://community.intercom.com/intercom-community-27/intercom-inbox-new-font-8933); [Bring back the old font](https://community.intercom.com/ideas/bring-back-the-old-font-8947)
- Intercom typography is described as **Saans** (custom geometric sans) plus SaansMono for code and uppercase labels, but only by unofficial reconstructions. — [opendesigner.io Intercom](https://opendesigner.io/design-systems/intercom); [hagicode Intercom DESIGN.md](https://design.hagicode.com/designs/intercom/DESIGN.md)
- **HubSpot**: brand typeface is **Lexend Deca** (with Queens serif for headings), and @font-face declarations appear in HubSpot-hosted CSS. Third-party write-ups say the product UI and body copy use system stacks. — [HubSpot-hosted template CSS](https://www.hubspot.fr/hubfs/hub_generated/template_assets/1/131397171552/1756736678456/template_app.min.css); [madegooddesigns: What font does HubSpot use](https://madegooddesigns.com/what-font-does-hubspot-use/)
- **Help Scout**: an "expressive type system" belongs to the brand/website refresh, not the inbox UI. I found no statement of the inbox UI font. — [Fonts In Use: Help Scout brand refresh](https://fontsinuse.com/uses/57605/help-scout-brand-refresh)
- **Front**: the Aug 2025 redesign post does not discuss typography. — [Front: Behind the inbox](https://front.com/blog/the-new-front-inbox)

### Inferences
- There are two typography camps. The **enterprise/legacy** camp (Zendesk, Freshdesk) uses system UI fonts at a 14px base on a 4px grid. The **modern** camp (Linear, Chatwoot's newer UI, Plain) uses Inter or Inter Display with tight weights.
- Intercom's Jan 2025 rollback shows that agents notice glyph changes in ticket counts and numbers. Use a typeface with clear tabular digits (Inter with `tnum`) for counters.

### Gaps
- Front, Help Scout, Plain, Missive, Crisp and Gorgias app UI fonts were not confirmed from primary sources. My unverified prior knowledge is that Plain and Missive look Inter-like and Front uses a custom or system sans. I did not verify any of this.
- I found no official Intercom source naming Saans.

## 2. Primary accent colors and dark mode (backgrounds)

### Takeaway
Blue accents dominate: Zendesk `#1f73b7`, Freshdesk `#2c5cc5`, Chatwoot `#2781F6`. Linear is moving toward a near-neutral accent. Dark modes fall into two groups. Zendesk (`#151a1e`) and Freshdesk's elephant neutrals (`#12344d`) use blue-tinted near-black or navy-gray. Linear uses near-black neutral (`#08090a`, reported). Chatwoot uses Radix `slateDark`, a cool neutral.

### Cited Findings
- **Zendesk Garden**: `primaryHue: 'blue'`; blue-600 `#2694d6`, blue-700 `#1f73b7`, blue-800 `#13456d`. — [Garden palette (unpkg)](https://unpkg.com/@zendeskgarden/react-theming@9/dist/esm/elements/palette/index.js); [Garden theme](https://unpkg.com/@zendeskgarden/react-theming@9/dist/esm/elements/theme/index.js)
- Garden dark-mode background tokens: default = `neutralHue.1100`, raised = `neutralHue.1000`, recessed = `neutralHue.1200`, emphasis = `neutralHue.600`. Grey palette: 600 `#848f99`, 700 `#5c6970`, 800 `#39434b`, 900 `#293239`, 1000 `#1c2227`, 1100 `#151a1e`, 1200 `#0a0d0e`. Zendesk's brand "kale" runs from 800 `#16494f` to 1100 `#061517`. — [Garden theme](https://unpkg.com/@zendeskgarden/react-theming@9/dist/esm/elements/theme/index.js); [Garden palette](https://unpkg.com/@zendeskgarden/react-theming@9/dist/esm/elements/palette/index.js)
- **Freshdesk (Crayons)**: azure-800 `#2c5cc5` (primary and link), azure-100 `#bbdcfe`, azure-50 `#e5f2fd`; neutrals are smoke-25 `#f5f7f9`, smoke-50 `#ebeff3`, smoke-100 `#cfd7df`, smoke-300 `#92a2b1`, smoke-700 `#475867`, elephant-800 `#264966`, elephant-900 `#12344d`. — [Crayons CSS](https://unpkg.com/@freshworks/crayons@4/css/crayons-min.css)
- **Chatwoot**: `n.brand: '#2781F6'`. The `woot` scale maps to Radix `blueDark` (e.g. `500: blueDark.blue10`). Neutrals come from Radix `slateDark`, and the body uses `slateDark.slate7`. Semantic tokens are CSS variables (`--background-color`, `--surface-1/2`, `--solid-1..3`, `--card-color`) that switch per theme. — [chatwoot theme/colors.js](https://raw.githubusercontent.com/chatwoot/chatwoot/develop/theme/colors.js); [tailwind.config.js](https://raw.githubusercontent.com/chatwoot/chatwoot/develop/tailwind.config.js)
- **Linear**: themes are generated in **LCH** (moved from HSL) from three variables: base color, accent color and contrast. That replaced 98 variables per theme. The 2024 redesign "reduced how much the accent blue feeds into the palette" for a more neutral look and added high-contrast themes. — [Linear redesign post](https://linear.app/now/how-we-redesigned-the-linear-ui)
- Linear dark canvas is reported as `#08090a`. Sidebar/panel values conflict: `#0f1011` in one source, `#1A1B1E` in another. These are third-party figures and partly describe the marketing site. — [design.hagicode.com Linear](https://design.hagicode.com/designs/linear.app/); [oppadu Linear gallery](https://www.oppadu.com/tools/design-systems-site/brand/linear.html)
- **Front**: the July/Aug 2025 redesign introduced "calmer colors" and "a dark mode that actually delights", with no hex values published. — [Front: Behind the inbox](https://front.com/blog/the-new-front-inbox); [Front: redesigned inbox](https://front.com/blog/front-inbox-redesign)
- Users disputed Front's dark mode. A July 2025 community post said internal and external messages look identical and contrast is weaker. A 2026 Macha review calls it hard to read. In June 2026 Front said dark mode was deprioritized in its new mobile app. — [Front community thread](https://community.front.com/product-updates/boost-productivity-and-focus-with-a-new-reimagined-inbox-2812); [Macha: new Front redesign explained](https://www.getmacha.com/blog/new-front-redesign-explained)
- **Plain**: dark mode has shipped since 9 Mar 2023 and follows the system setting by default. A later redesign reworked tokens, elevations and colors and added theming (e.g. high-contrast). — [Plain changelog: dark mode](https://www.plain.com/changelog/dark-mode); [Plain: redesigned interface](https://changelog.plain.com/changelog/redesigned-interface); [designer profile](https://read.cv/petrie)

### Inferences
- Zendesk's default dark (`#151a1e`, raised `#1c2227`) is a **blue-gray near-black**, not navy and not pure neutral. Linear's is **near-black neutral**. Chatwoot's Radix slate is a **cool neutral gray**. Products that use navy-ish neutrals (Freshdesk elephant `#12344d`) tend to read as "enterprise".
- Linear's model (base + accent + contrast in a perceptual color space) is the current reference pattern for theming with dark and high-contrast modes.

### Gaps
- No primary-source hex for Intercom, Front, Help Scout, Plain, HubSpot, Missive, Crisp or Gorgias accents, or for their dark backgrounds. My unverified recollection is: Intercom blue around `#0057FF` (older) and HubSpot orange `#FF7A59`. Neither was verified.
- I could not confirm whether HubSpot Service Hub, Help Scout or Freshdesk offer a full dark mode in 2026.

## 3. Collapsed sidebar / icon rail

### Takeaway
Chatwoot (2025+ `components-next`) has a **resizable** sidebar with a collapsed icon-only state. Collapsed controls are 32px squares (`size-8`) with `rounded-lg`, items are centered, and `title` tooltips are used. The profile menu is pinned in a bordered footer with a gradient fade. Front's 2025 redesign moved all top-bar navigation into a collapsible sidebar. Zendesk Agent Workspace is the classic fixed dark icon rail, but I did not confirm its width.

### Cited Findings
- **Chatwoot Sidebar.vue**: on mobile the aside is `w-[200px]`; on desktop the width is inline `sidebarWidth` px with a 4px (`w-1`) `cursor-col-resize` handle that turns `bg-n-brand` on hover or drag. Double-clicking the handle toggles collapse. The aside uses `bg-n-background` with `border-r border-n-weak` and only collapses at ≥768px. — [Chatwoot Sidebar.vue](https://raw.githubusercontent.com/chatwoot/chatwoot/develop/app/javascript/dashboard/components-next/sidebar/Sidebar.vue)
- Chatwoot collapsed state: the header is `justify-center px-1`, nav padding is `px-1`, and the list is `items-center`. Search becomes an icon link `size-8 rounded-lg` with a `title`. The compose button is `!size-8` when collapsed and `!h-7` when expanded. Collapsed spacing is `mt-3 mb-6 gap-4` (expanded `mt-1 mb-4 gap-2`). The changelog card becomes an icon button. — [same source](https://raw.githubusercontent.com/chatwoot/chatwoot/develop/app/javascript/dashboard/components-next/sidebar/Sidebar.vue)
- Chatwoot footer: `flex-col gap-1 items-center`. A fade (`bg-gradient-to-t from-n-background to-transparent`) sits above a row with `border-t border-n-weak shadow-[0px_-2px_4px_0px_rgba(27,28,29,0.02)]`. The profile row (`px-1 py-1.5 gap-2`) is `justify-center` when collapsed. Avatar, help and keyboard shortcuts live in `SidebarProfileMenu`. Notifications show as a badge on the Inbox item, not as a separate icon. — [same source](https://raw.githubusercontent.com/chatwoot/chatwoot/develop/app/javascript/dashboard/components-next/sidebar/Sidebar.vue)
- **Front (2025)**: the top bar was removed, and search, settings and tool navigation were consolidated into the sidebar, which is "restructured and now collapsible" (collapses entirely for focus). — [Front: Behind the inbox](https://front.com/blog/the-new-front-inbox)
- **Linear**: the 2024 refresh aligned sidebar labels, icons and buttons vertically and horizontally, reduced visual noise in the sidebar, tabs, headers and panels, and increased navigation density. — [Linear redesign](https://linear.app/now/how-we-redesigned-the-linear-ui)
- **Plain**: the redesign added a keyboard shortcut to hide sidebars, and its queue groups are All / Your / Unassigned threads. — [Plain redesigned interface](https://changelog.plain.com/changelog/redesigned-interface)

### Inferences
- The 2025–2026 convention is a sidebar that is resizable or collapsible, not a permanent rail. The collapsed state uses 32px square hit targets, centered icons, native or tooltip titles, and avatar or profile at the bottom. Notification counts move onto nav items as badges.

### Gaps
- No primary source gave pixel widths for the Zendesk, Intercom, HubSpot or Linear collapsed rails, or their active-state indicator style (left bar vs filled pill). From memory (unverified), Zendesk Agent Workspace uses a fixed dark rail of about 60px with a brand-colored (kale) background, and Intercom uses a narrow left rail with icons. Verify with screenshots.
- Chatwoot's active-item style lives in child components (`SidebarGroup`, `ChannelLeaf`) that I did not fetch.

## 4. Which products use the three-pane inbox (list | thread | context panel)?

### Takeaway
Almost all of them do. Front has sidebar + list + conversation + integrations panel. Chatwoot has sidebar + conversation list + thread + contact panel. Zendesk Agent Workspace, Intercom Inbox, Help Scout Inbox 2 and Plain also use it. Plain merged its queue and conversation views so agents advance to the next customer automatically.

### Cited Findings
- Front's layout is sidebar (inboxes, tags, views), conversation list (essentials only), conversation view, and integrations panel (unchanged). — [Front: Behind the inbox](https://front.com/blog/the-new-front-inbox)
- Front reduced density. It shows "only essential details" in the list and says it chose not to show "15 tags just because we could". — [same](https://front.com/blog/the-new-front-inbox)
- Help Scout "Inbox 2" is described as a more focused workspace with a simpler, more modern UI. Broad rollout began 30 Oct 2024, because the legacy UI couldn't accommodate AI tools. — [Help Scout docs: What's new with the inbox](https://docs.helpscout.com/article/1537-whats-new-with-the-inbox); [Why we redesigned Inbox](https://helpscout.com/blog/redesigned-inbox)
- Plain merged its navigation and queue views into one view that takes the agent to the next customer. The composer folds away when unused. — [read.cv/petrie](https://read.cv/petrie); [Plain redesigned interface](https://changelog.plain.com/changelog/redesigned-interface)
- Intercom announced a consistent layout across Messages, Inbox and Articles. — [Product Hunt: an all new Intercom](https://www.producthunt.com/p/fin/an-all-new-intercom)

### Inferences
- Three panes plus a nav sidebar is table stakes. The differences are in density, which metadata appears in the list row, and whether the context panel is collapsible.

### Gaps
- I did not fetch primary-source screenshots for Zendesk, Intercom, HubSpot, Missive or Gorgias pane widths. Their use of the three-pane layout comes from general product knowledge and was not cited here.

## 5. Visual style families

### Takeaway
Four families emerge. (a) **Enterprise dense**: Zendesk, Freshdesk, HubSpot. (b) **Linear-style minimal neutral**: Linear, Plain, and the 2025 Front direction. (c) **Friendly rounded / brand-forward**: Intercom, Help Scout. (d) **Open-source / chat-first**: Chatwoot, Crisp.

### Cited Findings
- Enterprise-dense markers in Zendesk: radii 2/4/8 px (sm/md/lg), a 4px spacing base, a 14px body font and system fonts. — [Garden theme](https://unpkg.com/@zendeskgarden/react-theming@9/dist/esm/elements/theme/index.js)
- Freshdesk Crayons radii are 1–4px utilities and 8px cards, on a navy text color `#12344d` and cool smoke neutrals. — [Crayons CSS](https://unpkg.com/@freshworks/crayons@4/css/crayons-min.css)
- Linear-minimal markers: an LCH-generated neutral theme with less accent bleed, Inter + Inter Display, aligned and dense chrome. — [Linear redesign](https://linear.app/now/how-we-redesigned-the-linear-ui)
- Front's 2025 direction was calmer colors, reduced noise, a new icon set and micro-interactions. — [Front blog](https://front.com/blog/the-new-front-inbox)
- Chatwoot uses Radix Colors (slate, blue, etc.), Inter, `rounded-lg` controls, 1px weak borders, and subtle footer shadows and gradients. — [Chatwoot Sidebar.vue](https://raw.githubusercontent.com/chatwoot/chatwoot/develop/app/javascript/dashboard/components-next/sidebar/Sidebar.vue); [tailwind config](https://raw.githubusercontent.com/chatwoot/chatwoot/develop/tailwind.config.js)

### Inferences
- None of the primary sources showed heavy use of glass or backdrop blur in the agent workspace. The only surface effects found were subtle gradients and shadows (Chatwoot footer fade). Glassmorphism is not a helpdesk convention in 2026.
- For a pt-BR, WhatsApp-heavy internal tool, the nearest reference is Chatwoot: Inter, Radix slate neutrals, blue brand `#2781F6`, a resizable or collapsible sidebar with 32px icon targets. A Linear-like neutral dark theme generated from base + accent + contrast is the most current theming pattern.

### Gaps
- Missive, Crisp, Gorgias and HubSpot Service Hub were not characterized from primary sources.
- I found no primary evidence on glass or blur usage for Intercom or HubSpot.
- Mobbin and Page Flows galleries were not consulted (they require login).
