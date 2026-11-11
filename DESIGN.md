---
name: Communicatiehub
description: A working product dashboard for a communications team. Agents prepare, people decide.
colors:
  # Source of truth: src/app/globals.css. Light value first, dark value under the -dark key.
  # Accent
  primary: "oklch(0.505 0.196 262)"
  primary-dark: "oklch(0.56 0.19 262)"
  primary-foreground: "oklch(0.99 0.002 264)"
  primary-foreground-dark: "oklch(0.99 0.002 264)"
  ring: "oklch(0.6 0.16 262)"
  ring-dark: "oklch(0.62 0.16 262)"
  # Surfaces
  background: "oklch(0.994 0.0015 264)"
  background-dark: "oklch(0.172 0.012 264)"
  card: "oklch(0.999 0.0005 264)"
  card-dark: "oklch(0.2 0.013 264)"
  popover: "oklch(0.999 0.0005 264)"
  popover-dark: "oklch(0.225 0.014 264)"
  sidebar: "oklch(0.979 0.0035 264)"
  sidebar-dark: "oklch(0.155 0.011 264)"
  subtle: "oklch(0.985 0.0025 264)"
  subtle-dark: "oklch(0.19 0.0125 264)"
  muted: "oklch(0.971 0.004 264)"
  muted-dark: "oklch(0.24 0.013 264)"
  secondary: "oklch(0.966 0.005 264)"
  secondary-dark: "oklch(0.255 0.014 264)"
  accent: "oklch(0.958 0.007 264)"
  accent-dark: "oklch(0.275 0.016 264)"
  sidebar-accent: "oklch(0.944 0.008 264)"
  sidebar-accent-dark: "oklch(0.245 0.014 264)"
  # Text
  foreground: "oklch(0.225 0.028 264)"
  foreground-dark: "oklch(0.945 0.006 264)"
  muted-foreground: "oklch(0.488 0.022 264)"
  muted-foreground-dark: "oklch(0.715 0.016 264)"
  # Lines
  border: "oklch(0.922 0.007 264)"
  border-dark: "oklch(0.295 0.014 264)"
  sidebar-border: "oklch(0.922 0.007 264)"
  sidebar-border-dark: "oklch(0.275 0.014 264)"
  input: "oklch(0.875 0.01 264)"
  input-dark: "oklch(0.345 0.016 264)"
  # State. x = text on a surface, x-soft = tinted fill, x-solid = small filled mark.
  success: "oklch(0.44 0.115 155)"
  success-dark: "oklch(0.8 0.14 155)"
  success-soft: "oklch(0.955 0.045 155)"
  success-soft-dark: "oklch(0.29 0.055 155)"
  success-solid: "oklch(0.62 0.15 155)"
  success-solid-dark: "oklch(0.7 0.16 155)"
  warning: "oklch(0.47 0.11 65)"
  warning-dark: "oklch(0.84 0.13 85)"
  warning-soft: "oklch(0.96 0.055 88)"
  warning-soft-dark: "oklch(0.3 0.05 80)"
  warning-solid: "oklch(0.74 0.15 75)"
  warning-solid-dark: "oklch(0.78 0.15 78)"
  danger: "oklch(0.49 0.19 25)"
  danger-dark: "oklch(0.78 0.13 22)"
  danger-soft: "oklch(0.96 0.028 20)"
  danger-soft-dark: "oklch(0.295 0.07 22)"
  danger-solid: "oklch(0.6 0.21 25)"
  danger-solid-dark: "oklch(0.66 0.2 25)"
  danger-strong: "oklch(0.5 0.2 25)"
  danger-strong-dark: "oklch(0.52 0.2 25)"
  info: "oklch(0.455 0.18 262)"
  info-dark: "oklch(0.79 0.11 262)"
  info-soft: "oklch(0.955 0.03 262)"
  info-soft-dark: "oklch(0.295 0.07 262)"
  info-solid: "oklch(0.58 0.19 262)"
  info-solid-dark: "oklch(0.66 0.17 262)"
  destructive: "oklch(0.545 0.205 25)"
  destructive-dark: "oklch(0.64 0.2 25)"
typography:
  headline:
    fontFamily: "Geist"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: "2rem"
    letterSpacing: "-0.019em"
  title:
    fontFamily: "Geist"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: "1.5rem"
    letterSpacing: "-0.006em"
  figure:
    fontFamily: "Geist"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: "1.75rem"
    letterSpacing: "-0.014em"
    fontFeature: '"cv11", "ss01", "tnum"'
  body:
    fontFamily: "Geist"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: '"cv11", "ss01"'
  control:
    fontFamily: "Geist"
    fontSize: "0.875rem"
    fontWeight: 500
  body-small:
    fontFamily: "Geist"
    fontSize: "0.8125rem"
    fontWeight: 400
  label:
    fontFamily: "Geist"
    fontSize: "0.75rem"
    fontWeight: 500
  prose:
    fontFamily: "Geist"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.7
  mono:
    fontFamily: "Geist Mono"
    fontSize: "0.75rem"
    fontWeight: 400
rounded:
  xs: "4px"
  sm: "5px"
  md: "6px"
  lg: "8px"
  xl: "10px"
  full: "9999px"
spacing:
  badge-x: "6px"
  control-x: "10px"
  control-gap: "8px"
  title-gap: "10px"
  row-y: "10px"
  row-x: "16px"
  panel: "16px"
  section: "32px"
  gutter-sm: "16px"
  gutter-md: "24px"
  gutter-lg: "40px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    height: "32px"
    padding: "0 10px"
  button-primary-hover:
    backgroundColor: "oklch(0.505 0.196 262 / 0.9)"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    height: "32px"
    padding: "0 10px"
  button-outline-hover:
    backgroundColor: "{colors.muted}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: "32px"
    padding: "0 10px"
  button-ghost-hover:
    backgroundColor: "{colors.muted}"
  button-destructive:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    rounded: "{rounded.md}"
    height: "32px"
    padding: "0 10px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    height: "32px"
    padding: "4px 10px"
  badge-neutral:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.muted-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.xs}"
    height: "20px"
    padding: "0 6px"
  badge-info:
    backgroundColor: "{colors.info-soft}"
    textColor: "{colors.info}"
  badge-success:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
  badge-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
  badge-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
  badge-outline:
    backgroundColor: "transparent"
    textColor: "{colors.muted-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.xs}"
    height: "20px"
    padding: "0 6px"
  panel:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "16px"
  row:
    backgroundColor: "transparent"
    padding: "10px 16px"
  row-hover:
    backgroundColor: "{colors.subtle}"
  row-focus:
    backgroundColor: "{colors.secondary}"
  nav-item:
    backgroundColor: "transparent"
    typography: "{typography.body-small}"
    rounded: "{rounded.md}"
    height: "32px"
    padding: "0 8px"
  nav-item-active:
    backgroundColor: "{colors.sidebar-accent}"
    textColor: "{colors.foreground}"
  filter-tab:
    backgroundColor: "transparent"
    textColor: "{colors.muted-foreground}"
    typography: "{typography.body-small}"
    rounded: "{rounded.md}"
    height: "28px"
    padding: "0 10px"
  filter-tab-active:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
  tooltip:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.background}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
---

# Design System: Communicatiehub

## Overview

**Creative North Star: "The Category Standard, Played Straight"**

Communicatiehub is a working product dashboard, built to the conventions editors already know from tools they use all day, at the craft level of the Stripe dashboard. An editor sees what waits on a human decision, sees what the agents found, and acts in place. The interface is dense, quiet and scannable: a sidebar on the left, a page title with its actions, one row of ruled figures, then lists and tables.

The system refuses the editorial costume it replaced: cream paper, serif display type, pastel pills and boxed hero metrics. Neutrals are cool and faintly blue, there is one cobalt accent, and colour otherwise appears only where something has a state. Structure comes from hairline rules and three surface steps, never from shadow or decoration.

Light and dark themes are both first class. The theme follows the system setting until the user picks Systeem, Licht or Donker in the user menu (`next-themes`, class strategy, `defaultTheme="system"`, no transition on switch). The interface language is Dutch.

**Key Characteristics:**
- Cool blue-tinted neutrals (hue 264) with a single cobalt accent (hue 262).
- State colour only on state. Taxonomies stay neutral and are told apart by text or icon.
- One typeface, Geist, on a 14px base with tabular figures.
- Hairline rules; 8px containers, 6px controls, 4px badges.
- Titles sit above their lists. Rows and ruled tables, not card grids.
- Flat at rest. Shadow belongs to overlays only.
- Motion is short and confined to overlays and press feedback.

## Colors

A cool neutral ramp carrying a trace of blue so the accent sits in the same family, one cobalt, and four state hues that each come in three strengths. All values live in the frontmatter (`name` for light, `name-dark` for dark) and in `src/app/globals.css`; components reference the Tailwind token (`bg-card`, `text-muted-foreground`), never a literal colour.

### Primary
- **Cobalt** (`primary`): the fill of the primary button, the "today" marker in the month calendar, the current step in a stepper, and the text selection tint (22% mix). `primary-foreground` is the text on it.
- **Focus Cobalt** (`ring`): keyboard focus. Controls show a 3px ring at 50% opacity and, where they have a border, switch the border to `ring`.

### Neutral
- **Page** (`background`): the main canvas.
- **Card** (`card`): the surface of every ruled container. One step lighter than the page in both themes.
- **Popover** (`popover`): menus, popovers, selects, dialogs. Lifts a further step in dark.
- **Sidebar** (`sidebar`): the navigation column. One step darker than the page in both themes.
- **Subtle** (`subtle`): row hover, the auth page background, the demo notice fill.
- **Muted** (`muted`): hover fill for outline and ghost buttons, skeletons, inactive calendar days (at 30 to 40%).
- **Secondary** (`secondary`): the selected fill, neutral badges, avatars, keyboard focus fill on rows.
- **Accent** (`accent`): the highlighted item inside menus and selects.
- **Sidebar Accent** (`sidebar-accent`): the current navigation item; at 60% for hover.
- **Ink** (`foreground`): primary text, the brand mark, tooltips. `card-foreground`, `popover-foreground`, `secondary-foreground`, `accent-foreground` and `sidebar-foreground` are aliases of it.
- **Quiet Ink** (`muted-foreground`): secondary text, icons at rest, column heads, metadata.
- **Hairline** (`border`, `sidebar-border`): every rule, divider and container outline, 1px.
- **Control Line** (`input`): the border of inputs, selects, textareas and checkboxes; one step darker than Hairline so controls read as editable. Also the dashed border of demo markers.

### State
Four hues (success 155, warning 65 to 88, danger 20 to 25, info 262), each in three strengths:
- `x` is text or an icon on a surface.
- `x-soft` is a tinted fill behind `x` text (badges, notices).
- `x-solid` is a small filled mark, for example a completed step.

`destructive` is the form error colour (required asterisk, error text, invalid border and ring) and the solid fill of a destructive confirm in an alert dialog.

Every status in `src/lib/constants.ts` names a tone; `src/components/shared/badges.tsx` collapses the eight tone names onto five treatments:

| Treatment | Tone names | Meaning | Examples |
| --- | --- | --- | --- |
| Neutral | `neutral`, `slate` | Nothing is asked of anyone; also every taxonomy | Concept, Onderzoek, Gearchiveerd, Afgewezen, Duplicaat, Niet verbonden, Demo-simulatie, In wachtrij |
| Info | `blue`, `teal`, `violet` | Moving or planned | Nieuw, In behandeling, Bezig, Ingepland |
| Warning | `amber` | Waits on a person | In review, Meer info nodig, Wacht op besluit, Wacht op goedkeuring, Toestemming nodig |
| Success | `green` | Decided or done | Goedgekeurd, Gepubliceerd, Verzonden, Afgerond, Verbonden |
| Danger | `red` | Blocked or refused | Wijzigingen gevraagd, Mislukt, Fout, Toestemming geweigerd, Vertrouwelijk |

### Named Rules
**The State Only Rule.** Colour appears only where something has a state. Category, classification, content type, calendar type, source and agent are taxonomies: they render in neutral text, an outlined badge or an icon, and every one of them is mapped to tone `neutral`. If two kinds of thing need telling apart, use the label or a lucide icon, not a hue.

**The One Accent Rule.** Cobalt means "act here", "you are here in time" or "focus is here". It fills the primary button, marks today and the current step, and draws the focus ring. Inline links and informational badges use `info`, the same hue at text strength. No second accent exists; the `chart-*` tokens are defined but unused.

**The Three Strengths Rule.** Never put state text on a solid state fill or use a soft fill without its matching text colour. Pair `x` with `x-soft`; keep `x-solid` for small filled marks such as a completed step number.

## Typography

**Body Font:** Geist (via `next/font`, which supplies its own metric-matched fallback)
**Mono Font:** Geist Mono, for code, environment variable names and reference IDs only

**Character:** One neutral grotesque at small sizes and two working weights, 500 for anything interactive or labelled and 600 for titles and figures. Hierarchy comes from weight and the muted text colour before it comes from size. `font-feature-settings: "cv11", "ss01"` is set on the root.

### Hierarchy
- **Headline** (600, 1.5rem / 24px, line-height 2rem, tracking -0.019em): the page title, one `h1` per page.
- **Title** (600, 0.9375rem / 15px, line-height 1.5rem, tracking -0.006em): the section title above a panel.
- **Figure** (600, 1.25rem / 20px, line-height 1.75rem, tracking -0.014em, tabular): the number in a stat.
- **Body** (400, 0.875rem / 14px, line-height 1.45): the base. Row titles are Body at weight 500.
- **Control** (500, 0.875rem): button and tab labels.
- **Body Small** (400, 0.8125rem / 13px): row summaries, section descriptions, sidebar items, filter tabs, notices, stat labels.
- **Label** (500, 0.75rem / 12px): badges, column heads, field labels, metadata lines, counts. Metadata lines are Label at weight 400 in Quiet Ink.
- **Prose** (400, 0.9375rem / 15px, line-height 1.7, max 68ch): article bodies, previews and the editor (`.prose-editorial`). Its `h2` is 1.125rem 600, its `h3` 0.9875rem 600. `.prose-compact` drops to 0.875rem at 1.6.
- **Mono** (400, 0.75rem): inline code and references.

Avatar initials are the only text below 12px (10px and 11px, weight 600).

### Named Rules
**The One Typeface Rule.** Geist everywhere, including headings, figures and long-form article text. Geist Mono only for literal strings a person would copy. No serif, no display face, no second sans.

**The Title Carries The Page Rule.** No small label sits above a page or section title. `PageHeader` renders the title first; status badges passed through its `eyebrow` prop render under the title, and a string passed there is not rendered at all.

**The Tabular Figures Rule.** Every number that can sit in a column or change in place uses `tabular-nums`: stats, counts, scores, times and dates.

## Layout

**Shell.** A 240px sidebar (`sidebar` fill, hairline on its right edge) is sticky at full viewport height from 1024px up. Below 1024px it is replaced by a 52px sticky top bar holding the brand and a menu button that opens the same navigation in a 288px sheet from the left. The main column is centred with a 1360px maximum width and gutters of 16px, 24px from 640px and 40px from 1024px; vertical padding is 24px, 32px from 1024px.

**Page order.** `PageHeader` (title, optional badges, optional description up to 68ch, actions on the right), then any `Notice`, then one row of figures where the page has them, then filters, then panels. Sections are separated by 32px (28px on the filter-led list pages).

**Dashboard.** Figures sit in a grid of 2, 3 (640px) or 6 (1280px) columns with a 24px column gap. Below them a main column and a 21rem aside split at 1280px with a 32px gap; the approvals list comes first, then the agents table. Detail pages use the same split with a fixed aside of roughly 22rem and a 24px gap.

**Sections.** A `Panel` puts its title row above the container (10px gap) and never inside it. The container is one ruled box with 16px padding, or no padding (`flush`) when it holds a list or table that runs edge to edge.

**Rows.** List rows are 10px by 16px, separated by hairlines, with the title in Body 500, one line of Label metadata beneath, and status at the right edge. A row that navigates is a single link covering the whole row. Tables use a Label column head row (8px by 16px, hairline beneath) and 10px by 16px cells; numeric columns are right-aligned and tabular. Secondary columns hide below 640px or 768px rather than wrapping.

**Forms.** Fields stack label, control and help or error text 6px apart; pairs of fields sit in two columns from 640px with a 16px gap.

**Spacing rhythm.** Tailwind's 4px scale. The steps in regular use are 6px (badge padding, label to control), 8px (between controls), 10px (control padding, row padding, title to container), 16px (panel padding, row inset, form gap), 24px (aside gap, figure columns) and 32px (between sections).

### Named Rules
**The Rows Over Cards Rule.** A set of like things is a list of rows or a ruled table inside one panel. It is never a grid of cards. Figures are a ruled row, not boxes.

**The One Box Rule.** A panel's container is the only bordered container around its content. Inside it, separate with hairlines. Small ringed items (badges, calendar chips, segmented selections, avatars) are marks, not containers, and may sit inside a panel.

## Elevation & Depth

Flat. Depth is carried by three surface steps and hairlines: the sidebar sits one step below the page, cards one step above it, and popovers one step above cards in dark. Nothing in the page flow casts a shadow.

### Shadow Vocabulary
- **Overlay** (`--shadow-overlay`; light `0 1px 1px oklch(0.225 0.028 264 / 0.04), 0 8px 24px -6px oklch(0.225 0.028 264 / 0.16)`; dark `0 1px 1px oklch(0 0 0 / 0.3), 0 12px 32px -8px oklch(0 0 0 / 0.55)`): dialogs, alert dialogs, dropdown menus, popovers and select menus, together with a 1px ring of Ink at 10%.
- **Button edge** (`inset 0 1px 0 oklch(1 0 0 / 0.14), 0 1px 1px oklch(0.225 0.028 264 / 0.12)`): the primary button only. A one pixel top highlight and bottom edge, not a lift.

Dialog and sheet scrims are black at 10%.

### Named Rules
**The Flat At Rest Rule.** A surface in the page flow has a hairline and a fill, never a shadow. If it floats above the page and can be dismissed, it takes the overlay shadow; nothing else does.

## Shapes

One radius scale, assigned by role:

| Radius | Token | Used for |
| --- | --- | --- |
| 4px | `rounded-xs` | Badges, count chips, checkboxes |
| 5px | `rounded-sm` | Calendar chips, focus outlines around text links |
| 6px | `rounded-md` | Controls: buttons, inputs, selects, textareas, sidebar items, filter tabs, menu items, tooltips, agent marks, the brand mark |
| 8px | `rounded-lg` | Containers: panels, notices, tables, the month grid, segmented control tracks; dropdown, popover and select menus |
| 10px | `rounded-xl` | Dialogs and alert dialogs |
| Full | `rounded-full` | People avatars, the today marker, step numbers, switches, the relevance meter |

Lines are 1px. Containers and dividers use Hairline; editable controls use Control Line. A dashed Control Line border marks demo and simulated material. Badges are 4px rectangles, never pills.

People are circles; agents are 6px squares holding an icon (megaphone for the external agent, two people for the internal one). Both are neutral. Icons are lucide, 16px at stroke 1.75 in rows and navigation, 14px beside Label text, 20px at stroke 1.5 in empty states.

## Components

Shared components live in `src/components/shared/` and the shell in `src/components/shell/`; primitives are shadcn/ui on Radix in `src/components/ui/`. Reach for a shared component before composing primitives.

### Buttons
`src/components/ui/button.tsx`. Label in Control type, 6px radius, icons 16px.

| Size | Height | Use |
| --- | --- | --- |
| `default` | 32px | Page header actions, form submit |
| `sm` | 28px | Everything inside a panel, row, toolbar or dialog body. The most used size. |
| `icon` | 32px square | Icon-only at page level (the mobile menu button) |
| `icon-sm` | 28px square | Icon-only inside rows and toolbars; always give an `aria-label` |

The primitive also defines `xs` (24px), `lg` (36px) and a `secondary` variant; screens do not rely on them.

- **Primary** (`default`): Cobalt fill, button edge shadow, hover at 90%. Reserved for the action a view exists for.
- **Outline:** Page fill with a Hairline border, hover Muted. The standard action and by far the most common variant.
- **Ghost:** no fill until hover (Muted). Toolbars, icon buttons and low-emphasis actions.
- **Destructive:** Danger Soft fill with Danger text. The confirming button inside an alert dialog is solid `destructive` with white text.
- **Link:** text only, underline on hover. Panel header links ("Alle signalen") use it at `sm` in `info`.
- **Press:** scales to 0.97 while pressed, 150ms ease-out. Buttons that open a menu (`aria-haspopup`) do not scale.
- **Focus:** border switches to `ring` plus a 3px ring at 50%.
- **Disabled:** 50% opacity, `not-allowed` cursor. **Pending:** `ActionButton` and `SubmitButton` show a spinning loader before the label and set `aria-busy`.

`ActionButton` (`shared/actions.tsx`) runs a server action with pending state and toasts; pass `confirm` to gate it behind an alert dialog.

### Badges
`src/components/shared/badges.tsx`. 20px high, 4px radius, 6px horizontal padding, Label type, never wrapping, no leading dot.

- **ToneBadge / MetaBadge / ContentStatusBadge:** soft fill with matching text in one of the five treatments. Use `MetaBadge` with a `*_META` map from `lib/constants.ts` so the tone is never chosen at the call site.
- **ClassificationBadge:** outlined (Hairline) with Quiet Ink text. Extern and Intern are properties, not states.
- **DemoBadge:** dashed Control Line outline, 11px text. Marks every record and output that comes from the demo simulation.
- **ContentTypeLabel, AgentBadge:** plain Label text in Quiet Ink; the agent adds a 14px icon. No fill.

### Panels and Rows
`Panel` in `src/components/shared/layout.tsx` is the default grouping.

- **Title row:** Title type on the left, optional Body Small description under it, optional actions on the right; 10px above the container.
- **Container:** Card fill, Hairline border, 8px radius, 16px padding or `flush`.
- **Rows:** see Layout. Hover fills Subtle over 150ms; keyboard focus fills Secondary.
- **EmptyState:** centred in the panel, 40px vertical padding: optional 20px icon in Quiet Ink at 70%, a Body 500 title, a Body Small description up to 24rem, and an optional action.
- **Field:** a Label `dt` over a Body `dd`, for detail sidebars.
- **ActivityFeed:** a hairline-divided list; each item has a 24px actor mark (agent square, person circle, or a neutral square with a chip icon for the system), a Body Small summary that links to its record, and a Label metadata line. "Vereist menselijke goedkeuring" appears there in Warning text with a shield icon.

### Figures
`StatCard`: a hairline on top, then a Body Small label in Quiet Ink, the Figure, and an optional Label hint. No box, no icon. When the whole figure links somewhere, the top rule darkens to Ink at 40% on hover. The only adornment is a Warning badge ("Jouw besluit") beside the number when it counts items waiting on the current user.

`RelevanceScore`: the number (Body Small 500, tabular, right-aligned in 24px) followed by a 40px by 4px meter. The meter is neutral: Ink at 75% from 75, 45% from 50, 25% below. A score is a measure, not a state.

### Inputs / Fields
- **Style:** 32px high, 6px radius, Control Line border, transparent fill (Control Line at 30% in dark), 10px horizontal padding. Text is 16px below 768px and 14px above. Placeholder in Quiet Ink. Textareas grow with content from 64px. Select triggers match; `sm` is 28px.
- **Focus:** border switches to `ring` plus a 3px ring at 50%.
- **Error:** `destructive` border with a 3px ring at 20%; the message is Label 500 in `destructive` with `role="alert"`.
- **Disabled:** 50% opacity over a Control Line tint.
- **FormField** (`shared/actions.tsx`): label, control, then help or error text, 6px apart. A required field adds a `destructive` asterisk.

### Navigation
- **Sidebar** (`shell/app-shell.tsx`): brand block (28px Ink square with "C", product name in Body Small 600, organisation in Label), grouped items, then the AI status line and user menu above a hairline. Group labels are Label in Quiet Ink. Items are 32px high with a 16px icon; at rest Ink at 70% with a Quiet Ink icon, on hover Sidebar Accent at 60%, current item Sidebar Accent with 500 weight and an Ink icon. Counters are 4px chips in Ink at 7%, tabular.
- **User menu:** opens upward from the sidebar foot; holds the theme choice (Systeem, Licht, Donker) as a radio group, Instellingen and Uitloggen.
- **FilterTabs** (`shared/layout.tsx`): link-based filters driven by a search param. 28px high, 6px radius, Body Small, optional tabular count. Use for filtering a list by status or type.
- **Segmented control:** two or three 28px options in an 8px-radius Card track with a Hairline border and 2px padding. Use for view switches (Maand, Lijst).
- **Tabs** (`ui/tabs.tsx`, `variant="line"`): in-page sections of one record, such as the editor's Bewerken, Voorbeeld, Versies. The active tab is marked by a 2px Ink underline.

### Notices
`Notice`: an 8px-radius box, 14px by 12px padding, Body Small text, optional 16px icon. Tone colours the icon, the border (20 to 25%) and the fill (soft at 45 to 60%); the text stays Ink. Tones are `info`, `warning`, `success`, `danger`, and `demo`, which is a dashed Control Line border on Subtle with Quiet Ink text. Notices sit directly under the page header, above the content they qualify.

### Overlays and Motion
Motion exists in two places only: overlays and press feedback. Hover and focus changes are 150ms colour transitions.

| Surface | Open | Close | Curve |
| --- | --- | --- | --- |
| Dropdown, popover, select menu | 160ms | 110ms | `--ease-out-strong` `cubic-bezier(0.23, 1, 0.32, 1)` |
| Tooltip (300ms delay) | 120ms | 110ms | `--ease-out-strong` |
| Dialog, alert dialog | 200ms | 110ms | `--ease-out-strong` |

The mobile navigation sheet slides in from the left edge in 280ms on `--ease-drawer` `cubic-bezier(0.32, 0.72, 0, 1)` and closes in 200ms. `danger-strong` is the one filled danger colour that carries white text (destructive confirm buttons); it passes AA in both themes.

- Anchored overlays fade in while scaling from 0.95 with their transform origin at the trigger and an 8px slide from the trigger's side. Dialogs do the same from the centre.
- A select menu that opens aligned over its trigger does not animate. Keyboard-driven and high-frequency UI stays instant.
- Under `prefers-reduced-motion: reduce` overlays keep their fade and lose scale and slide, and buttons do not scale on press.
- Tooltips are Ink with Page-coloured Label text, 6px radius. Toasts (sonner) appear bottom right with a close button.

### Long-form Text
`HtmlContent` renders stored article HTML in Prose type at 68ch. Links are `info` with an underline 3px below; blockquotes take a Control Line rule on the left and Quiet Ink text. An open placeholder left by an agent (`[AANVULLEN ...]`) is marked with Warning text on Warning Soft so an editor cannot miss it.

### Named Rules
**The One Selected Style Rule.** Selected is a Secondary fill with a 1px inset Hairline ring and Ink text at weight 500 (`bg-secondary ring-1 ring-border ring-inset`). Filter tabs, segmented controls and toolbar toggles all use it. Cobalt is not a selection colour. The sidebar's current item is the same idea on the sidebar surface: the Sidebar Accent fill, no ring.

**The Pointer Rule.** Everything that can be clicked shows a pointer cursor; disabled controls show `not-allowed`. This is set globally in `globals.css` for buttons and every interactive ARIA role, so a new clickable element needs a real role, not a cursor class.

**The Fast Out Rule.** Overlays open from their trigger in about 160ms on a strong ease-out and close faster than they open. Nothing in the page flow animates on load or scroll.

## Do's and Don'ts

### Do:
- **Do** take every colour from a token. Light and dark values are paired in `globals.css`; a literal colour breaks one of the two themes.
- **Do** give a new status a tone in `src/lib/constants.ts` and render it with `MetaBadge`. Pick the tone by what it asks of the reader: nothing (neutral), in motion (info), waiting on a person (warning), done (success), blocked (danger).
- **Do** keep taxonomies neutral: plain Label text, an outlined badge, or a lucide icon.
- **Do** put the page title first and status badges directly under it.
- **Do** group with `Panel`: title above, one ruled container, rows or a table inside, `flush` when the content runs edge to edge.
- **Do** show figures as a ruled row with `StatCard`, and use `tabular-nums` on every number.
- **Do** keep the primary button for the action a view exists for; make the rest outline or ghost.
- **Do** use the selected style (`bg-secondary` with an inset `ring-border`) for any chosen filter, view or toggle.
- **Do** keep radii by role: 4px badges, 6px controls, 8px containers and menus, 10px dialogs.
- **Do** mark demo and simulated material with `DemoBadge` or the `demo` notice, and show an integration as connected only through its status badge.
- **Do** write interface copy in Dutch with commas, full stops or a middle dot between metadata items.
- **Do** test both themes and `prefers-reduced-motion` before shipping a surface.

### Don't:
- **Don't** colour a category, classification, content type, calendar type, source or agent. Colour is for state.
- **Don't** use cobalt for selection, decoration or emphasis. It is for the primary action, focus, today and the current step.
- **Don't** place a small label above a page or section title.
- **Don't** put a dot in front of a label or inside a badge to signal status. The badge's fill and text carry it.
- **Don't** use em or en dashes in interface copy.
- **Don't** lay out a set of records as a grid of cards, and don't box figures. The shadcn `Card` primitive is installed and deliberately unused.
- **Don't** put a bordered container inside a panel's container. Use hairline rules.
- **Don't** add a second typeface, a serif, or a display size above the 24px page title.
- **Don't** add shadow to anything in the page flow, and don't round badges into pills.
- **Don't** animate page content on load or scroll, and don't lengthen overlay timings.
- **Don't** hard-code a theme. Light and dark follow the system unless the user chooses otherwise.
- **Don't** add `cursor-pointer` by hand; give the element a real button, link or ARIA role so the global rule applies.
