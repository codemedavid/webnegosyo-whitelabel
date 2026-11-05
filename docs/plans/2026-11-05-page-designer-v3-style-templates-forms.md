# Page Designer v3: full styling, removable parts, page templates, form editor

Status: PLAN — awaiting the owner's OK (2026-11-05). Builds on `2026-11-05-page-designer-block-designs-and-colours.md` (merged to local main c6ce12fe).

## What the owner asked

1. Colour editors live on the **Style** tab and can change **everything** on a component: box, border, text, selected **and** unselected states, inputs, icons, dividers, buttons.
2. Nothing set before in Branding Studio is lost.
3. Every **text** can be coloured (and sized).
4. **Most components can be removed**, including parts inside a block.
5. **Page style templates**: the Studio's checkout layouts (Step-by-step wizard, Two-column, Express, …) appear in the Page Designer, plus many new ones in the style of Grab / foodpanda / Shopify / Apple / e-commerce checkouts. These copy design *styles*, never any brand's name, logo or colours.
6. **The order type form** (the questions asked per dine-in / pickup / delivery) can be edited and styled inside the Page Designer.
7. Easy to use, highly customisable, creative. Tracked as a goal.

## What the research found (3 agents)

**Style tab.**
- It already shows for page blocks, but only the wrapper box works: background, border, radius, shadow, padding.
- Its "Text color" does nothing, because blocks paint their text with their own classes.
- Typography is hidden.
- Block colour knobs sit on the Content tab and can set only 8 checkout colours.
- These are derived and cannot be set:
  - unselected option fill and icon
  - hover
  - input fill
  - placeholder
  - label
  - focus ring
  - dividers
  - status colours
  - segmented track
  - photo caption

**Bugs found.**
- The **delivery address box ignores every checkout colour**. It hard-codes gray, white and orange in the Mapbox, Apple and plain inputs.
- The Senior/PWD Apply button is always `text-white`, which is unreadable on a light accent.
- A Studio **phone override** (`mobile_overrides`) of a `checkout_*` colour silently beats a Look-tab edit on phones.

**Locks.**
- Required today:
  - checkout: order type, schedule, customer, summary, voucher, gov discount, payment, place order
  - thank-you: status, actions
  - tracking: status
- Most of these only matter in some stores:
  - schedule only when advance ordering is on
  - gov discount only when online claims are on
  - customer only while a required question exists
  - payment only while methods exist
  - order type only with more than one type

**Templates.**
- The Page Designer offers 5 per page. The Studio's 6 checkout layouts (classic, modern, wizard, minimal, express, bitespeed) are a separate code path and do not appear.
- The Page Designer has no steps, accordion or pinned-bottom layouts, so it cannot reproduce wizard or express.

**Form.**
- `customer_form_fields`, one set per order type.
- Field types are limited by a DB CHECK to text / email / phone / textarea / select / number. Address and table number are presets matched by field name.
- Edited only at `/admin/order-types/[id]`, through 4 server actions that require `store_setup`, the same permission as the Page Designer.
- `validation_rules` is stored but never read.
- Errors are one toast, never shown beside the field.

**Competitor patterns** (Baymard, Stripe, Shopify, Swiggy, Amazon Pay, Apple HIG):
- labels stay visible
- one column on phones
- a sticky full-width button showing the total
- the summary collapsible at the top
- "rolled-up" filled sections with a Change link
- accordion payment rows
- slide-to-pay against accidental taps
- the review must not look like the thank-you page

## Decisions (recommended defaults — owner to confirm the ★ ones)

**D1. Style cascade, four levels, each blank = follow the one above.**

```
Branding Studio colours (checkout_*, tracking_style, brand)   ← unchanged, still the base
  → Page style   (new: whole-page look in the design: card style, corners, spacing, fonts, part colours)
    → Block style (Style tab of a block)
      → Part style (Style tab, per part: e.g. "Options › Selected", "Fields › Placeholder", "Title")
```

- A blank value at any level shows "Follows <level> · <colour>" with a swatch.
- Studio settings are never overwritten by a template or a block style: they stay the base. This is how "don't remove what we did in Branding Studio" holds.
- The only writes to Studio columns are still the Look tab's (one source of truth, from v2).

**D2. The Style tab becomes the home of every visual setting for page blocks.** Content keeps the words, settings and form. Colours, borders, text styling and spacing move to Style, grouped by **part**, and only the parts the chosen design uses are shown. The design gallery moves to the top of Style.

**D3. Part colours are new `--co-*` (and `--trk-*`) variables whose DEFAULT is today's derived value.** Example: `--co-option-bg: var(--co-card)`, `--co-placeholder: var(--co-muted)`. Components read the part variable, so an unstyled block renders byte-identical. The existing snapshots and contract tests are extended to pin this. Block and page styles set the variables on their wrapper. Every value is re-validated hex (or a token).

**D4. ★ Colours and text styles are one value for every device.** Sizes, spacing and borders follow the existing desktop / tablet / phone cascade. Keeping colours single-valued keeps the editor simple, and the owner said blocks should be easy to edit.

**D5. "Required" becomes "guaranteed when needed".**
- An owner may remove almost any block.
- When the store's setup needs a block for the order to work, the page adds a plain copy back at render. The editor shows "Removed — will still appear when <reason>", and publish explains it rather than refusing.
- Always kept:
  - checkout: Place order
  - thank-you: the status block (it carries the save-failure help)

| Block | Removable? | Auto-added back when |
|---|---|---|
| Order type | yes | the store offers more than one order type |
| Schedule | yes | advance / scheduled ordering is on |
| Customer form | yes | the chosen order type has a required question |
| Payment | yes | any payment method is enabled |
| Senior/PWD | yes | online claims are switched on |
| Summary | yes | never; but then "show total" on Place order is forced on |
| Voucher ★ | yes | never. This reverses the 2026-11-05 "voucher required" call: owner to confirm. The editor warns "customers can't enter a code" |
| Thank-you actions | yes | kiosk mode is on |
| Tracking status | no | — |

**D6. ★ Form edits save with Publish**, together with the design and Look. They change the same questions the standard checkout asks, and the panel says so. A "Save form now" button is offered as on the Look tab. Writes reuse the existing order-type service (zod + `store_setup`, RLS).

**D7. ★ Three new field types (needs a migration that widens the CHECK):**
- `choice`: buttons / radio
- `checkbox`: yes / no, with a "must tick" option
- `date`

Everything else is presentation and needs no schema. Without the OK we ship with the six existing types.

**D8. Page layouts are a design-level setting**, not a new template system.
- `layout: 'scroll' | 'steps' | 'accordion'`: sections become steps or accordion panels, with progress, Next / Back and per-step checks.
- `pin: 'bottom'` on a section: a sticky bar, used by express and delivery-app looks.
- The Studio templates are re-created as Page Designer templates on top of this. Owners who never publish a design keep their Studio layout exactly as it is.

## The editing model (what the owner sees)

### Style tab for a selected block

- **Design**: the live thumbnail gallery, as today, moved here.
- **Quick style** (one row of presets): Flat · Outlined · Soft shadow · Bold border · Glass · Receipt. A preset is a bundle of part values; the owner can tweak after.
- **Parts**, folded groups. Only the parts that apply to the block's design are shown.
  - **Box**: background (colour / gradient / image), border colour, width, style, corners, shadow, padding.
  - **Title** and **Subtitle**:
    - colour
    - size S / M / L / XL
    - weight
    - align
    - case
    - font (page / heading / body)
  - **Body text**: colour, muted colour.
  - **Options › Unselected**: fill, border, text, description, icon, icon circle.
  - **Options › Selected**: fill, border, text, icon, tick colour, tick style (check / dot / none).
  - **Options › Hover / pressed**: fill, border; on / off.
  - **Fields**:
    - field style (see below)
    - fill, border
    - text, label
    - placeholder
    - focus ring, error
    - corners, height (S / M / L)
    - label position (above / floating / left / hidden)
    - icons (on / off)
  - **Buttons**:
    - primary: fill, text, border, shape, size, shadow, full width
    - secondary: fill, text, border
    - disabled look
  - **Dividers**: colour, style (solid / dashed / dotted / none), thickness.
  - **Badges and chips**: fill, text (pre-order chip, "Proof required", "Free").
  - **Status colours**: success, warning, error (for this block only).
- **Actions**: "Copy style", "Paste style", "Apply to all blocks on this page", "Reset block style".

### Content tab for a selected block

- Words, with every text slot editable (unchanged).
- Settings: the existing toggles and new **Show** toggles per part (list below).
- Show when.
- For order type / customer: the **Form** editor.

### Page style (nothing selected → left rail "Look" tab, new top section "Page style")

- **Page template** gallery: all templates, grouped Simple / Delivery app / Store / Bold / Playful.
- **Layout**: Scroll · Steps · Accordion. Steps and Accordion add: progress style (bar / numbers / dots / none), rolled-up answers on/off, Next button text.
- **Sticky order bar** (checkout): on/off, shows total, style.
- **Cards**: Flat / Outlined / Shadow / Glass / None, plus corners, spacing density (compact / comfy / airy) and section gap.
- **Fonts**: heading and body (follow store / pick from the existing font list).
- **Part colours for the whole page**: same groups as a block; blocks inherit.
- **Store colours (Branding Studio)**: the existing Look fields, plus:
  - success / warning / error (shared with the whole store, labelled as such)
  - the offers pop-up (`checkout_modal_*`)
  - phone overrides: editing on the phone canvas writes `mobile_overrides`, like the Studio. This fixes the silent-override bug.

### Show toggles added (parts inside blocks)

**Checkout:**
- **Header**: store name, logo, step text.
- **Order type**: icons, descriptions, pre-order chip, per-type rename / description / icon (stored in the block, never renaming the order type itself).
- **Summary**:
  - item photos
  - add-ons
  - item notes
  - fee rows (each)
  - free-delivery hint
  - savings line
  - "Edit cart" link
- **Payment**: icons, descriptions, QR preview, proof chip.
- **Place order**: total, minimum-order notice, footer note, lock / "secure" line.
- **Voucher**: title, Apply button style (inline / separate).

**Thank-you:**
- **Status**: order number, scheduled line, failure help (always on when failed).
- **Summary**: add-ons, notes, fees.
- **Messenger**: "or" line, copy link, message box.

**Tracking:**
- **Header**: store name, order number.
- **Status**: progress bar, ready time.
- **Ring-me / pickup / summary / back**: title, helper text.

## Order type and the form

**Order type block** (Content → "Your order types"): per type, the display name, description and icon are stored in the block's options. The real `order_types` row is not touched: this is display only.

**Customer block** (Content → **Form**):
- Tabs per order type (Dine-in · Pickup · Delivery), and "Copy questions from Pickup".
- A list of questions: drag to reorder, tap to edit, ⋯ menu (duplicate, delete).
- Fields of a question:
  - label
  - placeholder
  - help text
  - required
  - type
  - choices (for select / choice)
  - width (full / half)
  - checks: min / max length, digits only, pattern presets (plate number, unit / room), min / max for number. These finally read `validation_rules`.
- "Add a question": presets (name, phone, email, address, table, landmark, car plate, notes, how did you hear) and blank types.
- Live preview on the canvas for the order type picked in the canvas sample.
- Checkout shows **errors beside the field** (plus the toast), and scrolls to the first one.

**Field styles** (Style → Fields → style), 3 today + 8 new:
- Outlined (today)
- Filled (today)
- Underlined (today)
- Floating label outlined
- Floating label filled
- Inset list (label left, iOS-style group)
- Joined group (shared borders)
- Pill with icon
- Elevated (shadow, no border)
- Chunky (thick border + offset shadow)
- Large / kiosk (64px)

**The address box follows the field style and colours** (bug fix). The suggestion dropdown uses the card colours.

## New order-type pickers (7 today + 6)

- **Underline tabs**
- **Switch**: delivery ⟷ pickup, only when exactly two types are offered; otherwise it falls back to tiles.
- **Expanding cards**: the chosen type opens its details, e.g. the address for delivery or the branch for pickup.
- **Swipe cards**
- **Ticket stub**
- **Two doors**: kiosk-style, half and half.

The "in the heading" and fill-in-sentence pickers are left out: research shows people miss hidden choices.

**New payment pickers (3 today + 3):**
- **Chosen + Change**: opens a sheet.
- **Accordion**: QR, account number, copy button and proof upload inside the row.
- **Pay now / Pay at counter**: split first, then the methods.

## Page templates

Each template is a full design: layout, blocks, block designs, part styles. Picking one never changes Studio colours. Each template has a "Colours: use mine / use the template's suggestion" toggle; *suggestion* writes only design-level page colours, never Studio columns.

**Checkout, 20 in total.**

From the Studio (so owners recognise their current page):
1. Classic
2. Two columns (Modern)
3. **Step by step (wizard)**
4. Minimal
5. Express (sticky bar)
6. Bold one-page (BiteSpeed look)

New:
7. Inset list (iOS grouped rows)
8. Delivery app: grey bands, address card, speed cards, sticky total bar
9. Rolled-up review: filled answers fold into Change rows, plus a top Place order
10. Accordion: numbered sections, ✓ when done
11. Store one-page: collapsible summary at top, wallet buttons, "or" divider
12. Receipt roll: zig-zag paper, dotted leaders
13. Slide to order: slide track; a normal button for screen readers and reduced motion
14. Pickup counter: branch hero, ready-by, call-out name
15. Kiosk / table: huge targets, keypad table number
16. Bold blocks: thick borders, hard shadows
17. Chat: question bubbles; answers become the customer's bubbles
18. Ticket stub
19. Editorial: serif numerals, hairlines
20. Timeline: progress line down the left

**Thank-you: +6 matching looks** — Delivery app, Receipt roll, Bold blocks, Ticket, Editorial, Chat. **Tracking: +6** — the same six.

**"Use this style on all three pages"** applies the matching thank-you and tracking template too. It asks first, and keeps the designs it replaces in undo.

Rules for every template:
- Phone-first.
- Publishable as-is (test-pinned).
- No invented numbers ("ready in 10 min" only from real data).
- No brand names, logos or colours.

## Engine changes (where)

- `src/lib/hero-builder/schema.ts`: page-block option cap 24 → 120.
  - Design-level `page` settings: layout, pinned section, page style.
  - Section `pin`.
  - All are optional, so v5 designs load unchanged.
- `src/lib/page-designer/parts.ts` (new): the PART registry. Each part has:
  - id
  - label
  - the `--co-*` / `--trk-*` variables it sets
  - its default expression
  - which designs use it

  Knob keys are generated from it (`part_<part>_<prop>`); the inspector and the var writer both read it, so it is one table.
- `checkout-theme.ts` / `tracking-colors.ts`: part variables with today's derived defaults; `blockVars(block, page)`.
- Components (order-type, payment, schedule, fields, summary, voucher, gov, buttons, address autocomplete, tracking parts) read part variables. **Contract test**: every part variable read is defined, there are no hard-coded colours, and snapshots are unchanged when unstyled.
- `rules.ts`: `requiredBlocks(page, ctx)` → `neededBlocks`; publish explains instead of refusing; `preparePageDesign` adds back with the live store context.
- Steps / accordion runtime (`renderer/page-layout.tsx`):
  - per-step validation hooks into `useCheckout` (`validateCheckoutFields` per section)
  - progress UI
  - pinned bottom bar with safe-area padding
- Inspector:
  - `StylePanel` gets a page-block branch (`page-block-style.tsx`: parts, quick styles, copy / paste)
  - Content loses colours
  - the generic "Text color" is hidden for page blocks
- Look tab: Page style section; status colours; `checkout_modal_*`; device-aware writes to `mobile_overrides` (extend `lookPatch` and the CAS check).
- Form editor:
  - `components/page-designer/editor/form-editor/*`
  - `src/lib/page-designer/form-changes.ts` (pure diff → ordered ops)
  - action `saveCheckoutFormAction`: `store_setup`, the existing service functions, revalidate the checkout
  - `publishPageDesignAction` takes `form?`
  - `checkout-field-validation.ts` reads `validation_rules` and returns per-field errors

## Phases (the goal's tasks)

| # | Phase | Ships |
|---|---|---|
| P1 | Part engine | parts registry, part vars with identical defaults, contract + snapshot tests, address-box + Senior/PWD button fixes |
| P2 | Style tab | page-block Style panel (design gallery, quick styles, parts, text styling), copy/paste/apply-all, Content cleaned up |
| P3 | Page style + Look | page-level style cascade, fonts, status + offers colours, phone overrides |
| P4 | Removable blocks + Show toggles | needed-when rules, editor notices, all part toggles, per-type rename/icon |
| P5 | Layout modes | steps, accordion, sticky bar, per-step checks |
| P6 | Templates | 6 Studio re-creations + 14 new checkout, +6 thank-you, +6 tracking, "use on all pages" |
| P7 | Pickers | 6 order-type + 3 payment designs |
| P8 | Form editor | per-order-type questions in the Page Designer, 8 new field styles, checks, inline errors, (★ D7 migration: choice / checkbox / date) |
| P9 | Ship | browser check at phone width on a real store (Chrome), code + security review, merge to local main |

Order: P1 → P2 → P3 come first because everything else styles through them. P4, P7 and P8 can run in parallel. P5 comes before P6, because templates need layouts.

## Tests

- Unstyled blocks are byte-identical: the existing `__snapshots__` must not change.
- Every part var used is defined (contract), and no literal colours appear in block components (extend the theme contract test to `checkout-templates/*`, the address autocomplete and page-designer components).
- Every template publishes as-is and renders every block on 390px; "use on all pages" keeps undo.
- Needed-when:
  - each rule adds its block back with that store setup and not without it
  - the Place order button always shows the total when the summary is removed
- Steps: cannot pass a step with a missing required answer; a screen reader gets a real button instead of the slide.
- Form: the diff → ops order (create before reorder, delete last); zod refuses bad fields; the action is refused without `store_setup`; per-field validation incl. `validation_rules`; RLS asserted as `authenticated` on the platform DB (affected rows).
- Look: a phone-canvas edit writes `mobile_overrides`; the CAS covers the override.

## Platform Supabase

- P1–P7 change no schema: designs are TEXT in `tenants.<page>_design`.
- P8 writes `customer_form_fields` through the caller's session client (`store_setup` policies exist, `20261026130000`). Verify affected rows on the platform DB.
- D7 (if OK'd): one migration widening `customer_form_fields_field_type_check`. Apply it to platform, probe the constraint, regen types via MCP, and ship the renderer with it, since an older checkout would render unknown types as text, which is safe.
- The design size cap (600 KB) holds: the largest template is estimated well under 60 KB.

## Risks

- **The checkout is revenue-critical.** Styles change only presentation. Removal is backed by needed-when rules, and steps reuse the same `handleProceedToPayment`.
- **Too many knobs = hard to use.** Mitigated by:
  - quick-style presets
  - showing only the parts the chosen design uses
  - "follows …" swatches
  - copy / paste / apply-all
- **Option keys and choice values are stored in designs**: never rename them.
- **Form edits are shared with the standard checkout and the POS** (the POS asks the same questions): the panel says so.
