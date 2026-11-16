---
name: Meridian Health
description: A hospital site organised like hospital wayfinding. Warm, care-first, always clear where you are and where to go next.
colors:
  canvas: "#F4F6F1"
  surface: "#FFFFFF"
  surface-raised: "#F9FAF6"
  line: "#DCE2DB"
  content: "#1E2A2B"
  muted: "#5D6B68"
  brand: "#1F5E55"
  brand-fg: "#FFFFFF"
  brand-soft: "#DCEBE7"
  warm: "#F2B880"
  warm-soft: "#FBECD9"
  warm-fg: "#1E2A2B"
  success: "#2A734A"
  success-soft: "#DDF0E4"
  warning: "#8F5A0A"
  warning-soft: "#FAECD2"
  danger: "#B42318"
  danger-soft: "#FCE5E2"
  info: "#2C6E9B"
  info-soft: "#DFEBF5"
typography:
  display:
    fontFamily: "Bricolage Grotesque Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 6.5vw, 4.75rem)"
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Bricolage Grotesque Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.0625rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Bricolage Grotesque Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.3125rem"
    fontWeight: 600
    lineHeight: 1.75rem
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Atkinson Hyperlegible Next Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.6rem
  body-app:
    fontFamily: "Atkinson Hyperlegible Next Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.4rem
  label:
    fontFamily: "Atkinson Hyperlegible Next Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.25rem
  identifier:
    fontFamily: "Atkinson Hyperlegible Mono Variable, ui-monospace, monospace"
    fontSize: "0.9375rem"
    fontWeight: 500
    letterSpacing: "-0.025em"
    fontFeature: "tnum"
rounded:
  control: "8px"
  card: "14px"
  pill: "9999px"
spacing:
  row: "44px"
  sidebar: "240px"
  container: "1152px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.brand-fg}"
    rounded: "{rounded.control}"
    height: "40px"
    padding: "0 16px"
  button-primary-lg:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.brand-fg}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 20px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.content}"
    rounded: "{rounded.control}"
    height: "40px"
    padding: "0 16px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-raised}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "#FFFFFF"
    rounded: "{rounded.control}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.content}"
    rounded: "{rounded.card}"
    padding: "16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.content}"
    rounded: "{rounded.control}"
    height: "40px"
    padding: "0 12px"
  emergency-strip:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    padding: "10px 24px"
  you-are-here-label:
    backgroundColor: "{colors.warm}"
    textColor: "{colors.warm-fg}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
  department-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.content}"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
  highlight-panel:
    backgroundColor: "{colors.warm-soft}"
    textColor: "{colors.content}"
    rounded: "{rounded.card}"
    padding: "32px 40px"
  badge-status:
    backgroundColor: "{colors.brand-soft}"
    textColor: "{colors.brand}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
---

# Design System: Meridian Health

## Overview

**Creative North Star: "Wayfinding"**

The public site behaves like hospital signage. A single eucalyptus line leaves a "You are here" marker and walks the visitor to where they need to go, and every page keeps the same promise: you always know where you are and what the next step is. The ground is sage paper, panels are white with a hairline border, and the only ornament is route geometry: long round-capped strokes, ring nodes and sign-like labels.

Voice is warm and calm, sentence case throughout. There are no photographs, no icon-card grids, no blue-and-white clinical wash. The signed-in app shares the same tokens and is denser (15px body, 44px rows for gloved fingers on ward tablets); the public site runs a larger 17px body and a generous left-aligned grid in a 72rem container.

**Key Characteristics:**
- Sage paper ground, eucalyptus for every primary action and every line, apricot as a fill only.
- The route line is the one motif: hero, the four-stops strip, the auth side panel, list bullets, the "on this page" rail.
- A permanent emergency strip closes every public and auth screen.
- Elevation is a 1px sage line; shadow exists only for things that float.
- Light and dark are one token set; components never branch on theme.

## Colors

A restrained sage-and-eucalyptus palette with one warm accent and a reserved clinical status ramp. Values below are the light theme; `.dark` in `src/index.css` swaps every variable (canvas #151B1A, surface #1D2524, brand #6FBFAF, warm #E9A866) under the same class names.

### Primary
- **Eucalyptus** (brand): every primary action, link, active nav item, focus ring, route line and node outline. Text on it is brand-fg (white).
- **Eucalyptus Mist** (brand-soft): brand-toned badges, the auth side panel ground.

### Secondary
- **Apricot** (warm): fill only. The "You are here" dot and label, the active node in the "on this page" rail, the first stop on the four-stops strip, text selection. Ink (warm-fg) sits on it.
- **Apricot Wash** (warm-soft): the single highlight panel on a page (for example "Already a patient here?").

### Neutral
- **Sage Paper** (canvas): the page ground.
- **White** (surface) and **Mist White** (surface-raised): panels, inputs, and hover fills.
- **Sage Hairline** (line): every border, divider and inactive route segment.
- **Ink** (content, 13.6:1 on canvas) and **Muted Ink** (muted, 5.1:1): all text.

### Status (reserved)
- **Critical** (danger / danger-soft): emergency strip, the urgent entry on the home page, errors, destructive actions. Never decoration.
- **Stable** (success), **Urgent** (warning), **Info**: clinical and financial state, in badges, always with a word.

### Named Rules
**The Fill-Only Apricot Rule.** Apricot never carries text or a thin stroke; it fails contrast on every ground. It appears as a filled dot, label or panel, with an ink or eucalyptus ring around it.

**The Reserved Red Rule.** Danger means critical or destructive and nothing else. Accent, emphasis and decoration are never red.

**The Word-With-Colour Rule.** Status colour always travels with a word (and an icon where one exists). A badge is tint, 1px same-hue ring and label.

## Typography

**Display Font:** Bricolage Grotesque Variable (optical-size axis; falls back to system sans)
**Body Font:** Atkinson Hyperlegible Next Variable
**Label/Mono Font:** Atkinson Hyperlegible Mono Variable, for identifiers only

**Character:** a characterful, slightly quirky display face for headings and buttons against a typeface designed for low-vision readers, so the page speaks warmly and reads plainly.

### Hierarchy
Scale is 1.25 (13, 15, 17, 21, 26, 33, 41, 52 px).
- **Display** (600, clamp 2.5rem to 4.75rem, 1.02): the home h1 only.
- **Headline** (600, 2.0625rem to 2.5625rem, 1.15): inner page h1 (`text-3xl`, `sm:text-4xl`).
- **Section** (600, 1.625rem to 2.0625rem, 1.15): h2 on public pages (`text-xl`, `sm:text-2xl`).
- **Title** (600, 1.3125rem, 1.75rem): list-row titles and step headings (`text-lg`).
- **Body** (400, 17px, 1.6rem): public prose, capped at `max-w-prose` (about 65ch). Signed-in app body is 15px.
- **Label** (500, 13px, sentence case, muted): the small caption above a field or metric. No tracking, no capitals.
- **Identifier** (mono, tabular, tight): MRNs, doses, invoice numbers, bed codes, and step numbers in the patient guide.

### Named Rules
**The Sentence-Case Rule.** Every label, heading, button and nav item is sentence case. No all-caps, no letter-spaced small text.

**The Identifier Rule.** Mono is for strings where one misread character matters. It is not a style for decoration.

## Layout

Left-aligned on a 72rem container with 16px gutters (24px from `sm`). The home hero is a 12-column grid at `lg`: copy in 6, the wayfinding diagram in 6, stacked below `lg`. Inner pages open with a headline and a lead of at most `max-w-prose`, then either stacked `PageSection`s or a `ReadingLayout`: a 14rem sticky "On this page" rail beside the body from `lg`, above it below. Vertical rhythm is 48 to 64px between sections (`py-12 sm:py-16`). Anchored headings carry `scroll-mt-24`, and the document has `scroll-padding-top: 5rem`, so a deep link never lands under the 4rem sticky header. The header is transparent at the top and becomes 95% surface with blur after 24px of scroll. Auth is a two-column grid: form column and a brand-soft route-line panel from `lg`.

The emergency strip is sticky to the bottom of the viewport inside `PublicLayout` and sits at the foot of the auth form column.

Content on the home page is divided by hairlines (a `divide-y` intent list), not by cards; do not wrap every section in a panel.

## Elevation & Depth

Flat by default. Depth is a 1px sage line on white panels; tonal steps (canvas, surface, surface-raised) do the rest. One shadow exists.

### Shadow Vocabulary
- **Pop** (`box-shadow: 0 16px 48px -16px rgb(4 20 18 / 0.35)`): surfaces that genuinely float, such as modals, the skip link and the back-to-top button.

### Named Rules
**The One-Pixel Rule.** A panel is raised by a border, never by a drop shadow. Shadows are for things that sit above the page.

## Shapes

Hierarchy by radius: panels and highlight panels 14px (`rounded-card`), controls and sign labels 8px (`rounded-control`), status badges, department chips and icon buttons fully round. Route geometry is round-capped, round-joined strokes: 6px in the hero, 4px in the auth panel, 2px in the four-stops spine. Nodes are rings (surface fill, 3 to 5px eucalyptus stroke); the single apricot node marks the current or starting place.

## Components

### Buttons
- **Shape:** 8px radius, Bricolage medium, tight tracking; 1px press nudge on `active`.
- **Primary:** eucalyptus fill, white text, hover at 90% opacity. Sizes sm 32, md 40, lg 44px high; the home hero uses lg.
- **Secondary:** white with a sage hairline, hover to surface-raised. Pairs beside a primary.
- **Ghost / Link:** muted text with a surface-raised hover; link is eucalyptus and underlines on hover.
- **Danger:** critical fill, only for actions that destroy or reverse something. Never "Save".
- Links wear the same look through `buttonVariants`; a navigation is a link, not a button inside a link.

### Cards / Containers
- 14px radius, white, 1px sage line, 16px body padding, headers and footers divided by a hairline. No shadow.
- The apricot-wash panel (`warm-soft`, 14px, 32 to 40px padding) appears once per page as the closing call to action.

### Inputs / Fields
- 8px radius, white, sage border, 40px high (44px large); border darkens on hover. Focus is the global 2px eucalyptus ring with a canvas offset. Invalid swaps border and ring to danger and always shows an error sentence.

### Navigation
- Header: brand mark and name left, five text links, then Sign in (primary, sm) and a ghost Create account from `lg`. Active link is eucalyptus semibold; inactive muted. Below `md` a menu button opens a stacked list with 44px rows; Escape and navigation close it.
- Footer: white, three titled link groups, a theme toggle in the baseline row.

### Emergency strip
Danger-soft ground, danger text, 30%-danger top border, phone icon, one sentence and a "What to do" link. Until the hospital supplies a number it says only "In an emergency, call your local emergency number first"; it never prints a placeholder number.

### Route line (signature)
- **Hero:** eucalyptus line over a faint sage copy of the full route, drawn from an apricot "You are here" node up to department nodes; destination labels are real links in an HTML list laid over the SVG.
- **Four stops:** a hairline-weight route (eucalyptus at 40%) joining ring nodes, the first filled apricot; vertical on mobile, horizontal from `md`.
- **NodeList:** 8px ring bullets in eucalyptus on surface replace default list bullets.
- **Section rail:** a sage left rule with an apricot node that follows the reader to the section in view.
- **Auth panel:** the same route, static, at 4px weight, wholly inside the panel.

### Department marquee
Pill chips (full radius, hairline border, hover to eucalyptus) on a 70s linear loop, edge-masked. Pausable with a real button, paused while hovered or focused, and static and wrapped under reduced motion.

### Status badges
Pill with a tint, a 1px same-hue inset ring and a word. Tones: neutral, brand, success, warning, danger, info.

### Patient guide numbering
Markers `01`, `02`, `03` in the mono identifier face appear in the patient guide rail only, where order is the information. No other page numbers its sections.

### Motion
- **Scroll reveal:** content fades and rises 14px once at 25% in view (220ms, ease-out-expo curve); never repeats.
- **Hero line draw:** about 900ms total, labels arriving after. It is the only auto-playing choreography.
- **Marquee:** the only loop; always pausable.
- **Interactions:** 100 to 150ms colour and border transitions; arrows nudge 2 to 4px on hover.
- **Reduced motion:** the reveal becomes a 120ms fade with no travel, the line renders complete, the marquee stops, and a global CSS rule collapses any remaining animation and smooth scroll.
- Auth screens are tasks: nothing moves while someone types.

## Do's and Don'ts

### Do:
- **Do** use token classes (`bg-surface`, `text-muted`, `border-line`, `rounded-card`, `rounded-control`) and never a raw hex or arbitrary pixel value.
- **Do** give every public and auth screen the emergency strip.
- **Do** use apricot as a fill with an ink label or eucalyptus ring, and eucalyptus for every primary action and every line.
- **Do** write sentence-case labels, and name things the way patients do ("Sign in", "My care team", "Needs attention").
- **Do** carry the route-line motif through geometry (round caps, ring nodes, sign-like labels) instead of adding illustration.
- **Do** keep a visible focus ring on every interactive element, and pair status colour with a word.
- **Do** keep the line draw as the only auto-playing motion, and give anything that loops a pause control.

### Don't:
- **Don't** set text in apricot, or draw thin strokes in it.
- **Don't** use red for emphasis, accent or decoration.
- **Don't** put a drop shadow on a panel; use the hairline.
- **Don't** use stock photography, a row of identical icon cards, or a blue-and-white clinical wash.
- **Don't** number sections outside the patient guide.
- **Don't** state a hospital fact the content file does not supply; show the honest "not supplied yet" sentence in muted ink.

## Known drift (recorded, not canonized)

- The home hero splits 6/6 at `lg`; the original direction brief asked for 7/12 and 5/12. The build is recorded here.
