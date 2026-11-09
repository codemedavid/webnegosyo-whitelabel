# Page Designer: block designs + page colours

Status: APPROVED + BUILT 2026-11-05 (all four phases, owner said "go" and asked for every section). Sticky place-order bar not built (needs an engine change). Builds on Page Designer (PR #107, on local main 0a569889).

## What the owner asked

1. The checkout **order type** section gets several real designs (templates) and design knobs.
2. The colours that live in Branding Studio for checkout / thank-you / tracking can be changed **inside the Page Designer**, with the page in view.
3. Every block in every section is easy to edit: pick a design, change its colours, change its words.

## Where we are today (research, 3 agents)

- Order type picker = `OrderTypeSelector` (`checkout-primitives.tsx:234-290`): hard-coded 3-column tiles, only a `compact` prop. `classic-checkout.tsx:77-122` has its OWN inline copy (drift risk).
- Page Designer block `checkout.order_type` (`blocks-checkout.ts:50-62`): required; texts `title`/`subtitle`; options `card`, `show_subtitle` (booleans). View = `OrderTypeView` (`block-views-details.tsx:84-92`), shared by the live and sample renderers.
- Block inspector (`page-block-fields.tsx`) already renders `choice` options as a Segmented control — no registry uses one yet. Owners can change words, toggles, the generic box style and Show when. No block colours, no designs.
- Checkout + thank-you colours = 9 real columns `checkout_*_color` → `getCheckoutPalette` → `--co-*` vars. Tracking/loyalty = `tenants.tracking_style` (jsonb, ~50 colours + 6 choices) → `--trk-*`. Studio is the only writer; the Page Designer canvas already paints from them (`page-theme*.ts`).
- The design's own `theme` (Theme tab) only colours free widgets, never page blocks.

## Decisions (recommended)

**D1. One store of truth for page colours: the existing columns.** The Page Designer gets a second editor for `checkout_*_color` and `tracking_style`; Studio keeps its editor (classic checkout and other screens read them too). No shadow copy inside the design, because a shadow would silently stop Studio edits from applying.

**D2. Colour edits go live when the owner taps Publish, not on every change.** They sit in the Page Designer draft and the canvas previews them. Publish writes design + colours together through the existing `branding-service` validation (same zod + allowlist as Studio). The panel says: "Also used on your standard checkout and in Branding Studio." If Studio changed a column after the editor opened, we warn before overwriting.

**D3. Block designs and block colours live in the block's own `content.options`.** A reserved `variant` key and `style.*` keys are used: no migration and no new column. They only show on a published Page Designer page. The first variant is today's look, so every existing design renders exactly as before. Unknown stored values fall back to the first variant (validated at publish AND at render).

**D4. Block colour knobs store a palette reference by default** (`accent`, `card`, `text`…). They store a hex only when the owner picks a custom colour. Custom hexes become scoped CSS vars on the block wrapper (`--co-accent: #…`), so components keep reading `var(--co-*)` and the no-hard-coded-colours contract holds.

## Order type designs (7)

Every design uses the same `orderTypes` / `setOrderType`. Every design always shows the pre-order chip, has the right selected/disabled states and is a radiogroup for screen readers.

| id | Design | Suits | Knobs |
|---|---|---|---|
| `tiles` | Tiles (today, default) | 2–3 types | corners, icon style, show descriptions, columns auto/2/3 |
| `segmented` | Pill toggle | pickup vs delivery | corners pill/soft, selected fill accent/dark, description under |
| `list` | List rows with radio | delivery-first | icon style, show description, dividers vs cards |
| `cards` | Description cards | types that differ a lot | corners, border weight, accent wash on/off |
| `buttons` | Big buttons (≥56px) | older guests, one thumb | corners, icon style, align left/centre |
| `chips` | Compact chips | kiosk / QR table | show icon, size S/M |
| `photo` | Photo tiles (Phase 3) | cafés with a nice room / rider photo | image per kind (blank = illustrated tile), scrim, corners |

We never invent data: there is no "ready in X min" unless the owner writes it into the description.

## The editing model (every block)

`PageBlockDef` gains `variants: {id, label}[]` and `styleKnobs: Knob[]`. A knob is `color` (palette ref | hex), `choice`, `boolean` or (Phase 3) `image`. When a block is selected, the inspector shows, top to bottom:

1. **Design**: thumbnail gallery, rendered from the sample checkout at 390px in the store's colours. Tap to apply.
2. **Colours**: ≤3 swatches for that block, each "Brand" or "Custom", with a ↺.
3. **Words**: today's text slots.
4. **Options**: today's toggles.
5. **Advanced** (folded): text colour (auto-contrast by default), icon style, extras.

Reset works at three levels: per knob (↺), per block ("Use brand look"), and per page ("Reset page colours to brand", which blanks the columns; blank = brand-derived already). Designs and colours are one value on all devices; only `columns` gets a phone override.

Contrast: an inline warning below 4.5:1. Publish is refused below 3:1 for the Place order button and the selected state of required choice blocks.

When nothing is selected, the left panel gets a **Page colours** tab. It shows 8 named swatches (checkout/thank-you: Background, Cards, Text, Muted, Accent, Button, Button text, Border; tracking adds Banner + Timeline), plus "All colours" for the rest of `tracking_style`. Fields come from the Studio registries (`branding-registry.ts`, `tracking-style/studio-sections.ts`), so labels, validation and contrast checks are shared code.

## Phases

**P1: Order type designs + the block editing model.**
- Add `variant`/knob support to `PageBlockDef` and `rules.ts`.
- Build the Design gallery and Colours section in `page-block-fields.tsx`.
- Give `OrderTypeSelector` a `variant` prop plus 6 designs (all but photo).
- Move classic's inline copy onto the shared selector, with no visual change, behind a snapshot test.
- `OrderTypeView` passes the options through.
- Live + editor samples come for free (shared view map).

**P2: Page colours panel.**
- Checkout + thank-you (`checkout_*`), then tracking (`tracking_style`).
- Draft → live canvas → write on publish.
- Contrast floors at publish; "changed in Studio" warning.
- Studio gets a "Design this page in Page Designer" link.

**P3: The other checkout blocks.**
- Payment picker, schedule, place order, voucher and summary get variants + knobs (see the families in the research).
- Photo tiles for order type (`image` knob, uploads through the existing R2 path).

**P4: Tracking + thank-you blocks.**
- Status banner, timeline and summary variants, mapped onto the existing `tracking_style` choices (`hero_style`, `timeline`…).
- Studio's duplicate "Order status" controls become a deep link.

## Tests (TDD, per phase)

- Each order-type variant renders every order type, selects each one, shows the pre-order chip, and exposes radiogroup semantics.
- Classic checkout snapshot unchanged after the fold.
- `rules.ts`: unknown variant/knob refused at publish; render falls back to the first variant; hex re-validated (`safe-values`).
- No `var(--co-*)` read without a definition; no hard-coded colours in the new designs (extend the theme contract test).
- P2: colours publish through the same zod as Studio; contrast floor refuses; RLS checked as `authenticated` with `store_setup`, asserting affected rows on the platform DB.

## Platform Supabase

- P1, P3 and P4 change no schema: designs and colours ride in `tenants.checkout_design` (TEXT), which is already in the storefront path.
- P2 writes existing columns through the caller's session client. Before P2 starts:
  - Probe the tenant column guard trigger to confirm `checkout_*_color` and `tracking_style` are not privileged.
  - Confirm `checkout_design` itself is in `tenant-storefront-select.ts` (agent saw only `_enabled`).

## Risks

- Checkout is revenue-critical: the variants change only presentation, never the handlers; required-block locks stay.
- Two editors for one colour: last write wins, so warn on a stale Studio change.
- The variant ids and knob keys are stored in designs, so they must never be renamed.
