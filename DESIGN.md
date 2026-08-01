# Design

<!-- impeccable:design-schema 1 -->

This records the visual world of the **WebNegosyo marketing landing page** (`/`), written from the built result rather than from intention. It is scoped to that one surface.

**It does not govern the tenant storefront, the tenant admin, the POS register, or the superadmin.** Those follow the Branding Studio (`src/components/admin/branding-studio/`), which PRODUCT.md names as the binding house style. The landing page is the platform's own Persuade surface and was deliberately given its own world; nothing here should be carried into product UI.

## The world

**Barangay scoreboard.** The covered basketball court at night: asphalt under floodlight, a segment-LED board where a number climbs in public, painted lane lines, and the printed sponsor tarpaulins strung along the fence.

The product is a total that goes up — pairings, meal upgrades, bundles, each raising an order. A scoreboard is that mechanism as an object, so the page performs the argument instead of claiming it. It refuses the category default it replaced: dark-SaaS hero with a glowing phone, gradient pills, uniform feature-card grid.

The away side is always the leak — manual encoding, forgotten upsells, 20–30% commission — never another merchant.

Seed: `ecdd84d8`. The direction contract ships as an HTML comment at the top of `LandingPage`.

## Color

Committed, drenched at section scale. Fields own whole regions; the page alternates floodlit dark court and blinding printed vinyl, and that alternation is the pacing.

Dark is forced by the scene, not by category: a covered court at night, read on a phone.

### Court (`COURT` in `landing-theme.ts`)

| Token | Value | Role |
|---|---|---|
| `ground` | `#0A0E0C` | Asphalt in shadow. Green-cast, never neutral black. |
| `groundLit` | `#111714` | Asphalt inside the floodlight pool. |
| `steel` | `#1A211D` | Scoreboard housing. |
| `lane` | `#EDE8DA` | Painted court line. The page's "white". |
| `laneDim` | `#8E9A90` | Worn paint. **The only secondary-text colour.** |
| `ledRed` | `#FF2E12` | Scoring LED. **Large figures and display type only.** |
| `plateRed` | `#C9210A` | Printed red. **Every button and pill.** |
| `plateRedDeep` | `#8E1400` | The plate's under-shadow. |
| `ledAmber` | `#FFB300` | Clock/period LED, and the lit word in a heading. |
| `ledGreen` | `#17C964` | Home side — the merchant's own total. |

`ledRed` fails 4.5:1 against cream at body size (3.49:1). It is kept for large LED figures where it passes; `plateRed` (5.32:1) carries every control. Never swap them.

Low-alpha cream is banned as a text colour — it lands at 2.9–3.3:1. Secondary text is `laneDim`, which clears 6.2:1 on every court ground.

### Tarpaulin (`TARP`)

High-key CMYK on vinyl, the way Philippine banner printing actually prints.

`blue #0057D9` · `yellow #FFC800` · `red #C4002A` · `green #00A94F` · `vinyl #F5F1E6` · `ink #0A0E0C`

Blue and red take cream text; yellow, green and vinyl take ink (`isLight` in `court.tsx`). Body copy on a tarp runs at full opacity — no `opacity-*`. Minimum measured ratio across the wall is 5.50:1.

## Type

- **Display — Anton** (`--font-landing-display`). The heavy condensed cap that tarpaulin and scoreboard lettering is set in. Headings, buttons, board labels, quarter markers.
- **Text — Archivo** (`--font-landing-text`). Legible at 13px on a cheap phone in daylight.

Both self-hosted via `next/font/google` in `landing-fonts.ts`.

The scale lives in `landing-styles.ts` as `.t-*` classes, **not** as Tailwind arbitrary values. Tailwind v4 cannot type-infer `text-[clamp(...)]` and silently emits nothing for it — a dropped class is a heading that renders at 16px. The same applies to any arbitrary value containing a comma (`grid-cols-[1fr_minmax(0,540px)]`, `inset-[2px]`, `w-[13px]`). **Structural geometry for this surface belongs in `landing-styles.ts`.**

Bodies cap at 46–68ch. Headings carry `text-wrap: balance`.

## Components

Every atom is rebuilt in the court's vocabulary. A stock component here is a lapse.

- **`SegmentDisplay`** — a real seven-segment display, drawn segment by segment as hexagonal polygons. **The unlit segments always render at `opacity 0.07`.** That ghost is what separates a scoreboard from "dark UI with a glow"; never replace this with a font. Takes a CSS length so one element scales — never a mobile/desktop pair, which both resolve and overlap.
- **`CourtButton`** — the lane plate. Angled `clip-path`, `0 6px 0 0` base, `active:translate-y-[3px]` so it depresses onto its own shadow rather than lifting. Tones: `score` (court), `vinyl` and `tarpGhost` (saturated tarp grounds, where scoring red disappears), `chalk` (outlined).
  A `clip-path` slices a `border` into open corners, so outlined plates paint the outline as a clipped layer behind an inset fill (`.landing-chalk-fill`).
- **`TarpPanel`** — printed vinyl with four `Grommet` eyelets and a diagonal sheen carried as a background layer. Hard drop-shadow on the lettering is the print medium, not a costume.
- **`ChalkRule`** — a dashed painted line. The page's divider; not a 1px UI border.
- **`SectionTitle`** — heading plus optional body. **No eyebrow.** The board's `HOME`/`AWAY` labels are legitimate because they live inside a board; a label floating above a heading in open page space is not.
- **`StencilMark`** — eight authored SVG marks, 2.25 stroke, square caps, miter joins. No icon library, no emoji.

## Motion

**One authored moment:** the hero board plays the order once — ₱149 climbing to ₱417 as three lamps fire against a KOMISYON locked at 0. That is the product argument, performed before a word of copy.

The sponsor strip loops. Everything else is a state transition.

`prefersReducedMotion()` in `motion.ts` guards every animation — `matchMedia` is absent in jsdom and in some embedded webviews, so nothing calls it directly.

## Constraints this surface is held to

- **Mobile data is a hard budget.** Buyers arrive from a Facebook link on mobile data. The three.js/react-three-fiber hero was deleted; only `landing-hero`, `pricing-faq` and `social-proof` carry `'use client'`. Media is re-encoded for its render size (`testimonial-720.mp4`, 1.33 MB, with a poster).
- **The hard sell never hides.** Price and CTA are above the fold on a 390px phone, and the fixed nav carries the price at all scroll positions.
- **Claims are fixed.** ₱3,899 one-time, no monthly fee, no commission, 48-hour setup, lifetime updates — verbatim. The hero's ₱149→₱417 run is synthetic and is labelled as such on screen; the testimonial disclaimer stays. Do not solve a contrast finding by deleting either.
- **Taglish is the voice.** Not translated English.

## Open

- No captions track on `testimonial-720.mp4` (no transcript exists).
- No skip link.
- `public/testimonial.mp4` (22.5 MB) is unreferenced and can be deleted once the 720p re-encode is accepted.
- WCAG conformance is still an open product decision (PRODUCT.md); this surface was built to AA contrast regardless.
