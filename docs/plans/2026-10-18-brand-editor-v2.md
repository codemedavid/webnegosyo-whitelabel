# Brand Editor v2: "Tap your store to change it"

**Status:** APPROVED 2026-10-18 — owner replied "do what you recommend" (all five §10 defaults accepted). Phase 0 shipped as its own PR from `fix/pdp-editor-accuracy`; Phases 1–5 build in `.claude/worktrees/brand-editor-v2`.
**Surface:** web admin `/[tenant]/admin/branding`, plus every diner screen it styles.
**Backend rule:** platform Supabase first. No phase may change how an existing store looks unless that phase says so and the owner has approved it.

The plan combines seven research tracks, cited inline:

| Tag | Track |
|---|---|
| [ARCH] | Architecture map of the current Studio |
| [PDP] | Product Detail accuracy diagnosis |
| [AUDIT] | Editability audit of every ordering screen |
| [COMP] | Competitor editors: Shopify, Squarespace, Square, Wix, Toast, Owner.com, Shopee, Linktree |
| [UX] | Visual-editor UX research: NN/g, Material 3, Radix, APCA/WCAG, DTCG |
| [INV] | Food-ordering component and state inventory: Baymard, DoorDash, Toast |
| [DESIGN] | UI/UX redesign concept |

---

## 0. The pitch

An owner opens **Brand**. A real phone shows their real store. They tap the thing they want to change, such as the price, the "Add to Cart" button or an option chip. A small panel shows only that thing's settings, written in plain words. Colours are picked from the store's own palette ("Follows Cards"), never as a raw hex code. Text that would be hard to read gets flagged, and **Fix** repairs it in one tap. A switcher above the phone walks the diner's journey: **Welcome → Menu → Item → Cart → Checkout → Tracking**. Each screen can show any of its states: chosen and not chosen, sold out, empty cart, error, closed. Owners can undo anything. Nothing goes live until **Publish**.

New stores answer four questions and finish: logo, colours (taken from the logo), font, corners.

---

## 1. Why the current editor feels broken

1. **It shows values the store doesn't render.**
   - There are three disagreeing fallback systems: the registry's `inheritsFrom`, `getTenantBranding`, and `mergeSettingsWithBranding`. [ARCH][PDP]
   - About 35 Product Detail fields showed a black swatch labelled "Brand default".
   - A saved page background of `#ffffff` displayed as white while the page rendered `#171717`.
2. **Some fields do nothing.**
   - 9 of the 12 Add-ons fields were never read.
   - Variation chips read CSS variables that nothing sets. That is the dark-on-dark chips in the screenshot. [PDP]
   - Pairing pop-up (7 fields), the product page's "Checkout upsell sheet", "Layout & motion" gradient/body font/animation, and the Quick-view modal (the card tap now opens the item page) are dead or stale. [ARCH][AUDIT]
3. **There are too many raw fields.**
   - About 280 fields over 11 surfaces, mostly raw hex rows such as "Selected border" and "Checkmark".
   - Nothing stops unreadable combinations. [ARCH][UX]
4. **It can't reach most of the order.**
   - Cart: 223 hard-coded colours. Checkout and confirmation: 465. Tracking has no surface. [AUDIT]
   - Blank cart and checkout colours don't inherit the brand; they fall back to orange and white template defaults.
   - The shadcn tokens (`--background`, `--muted`, `--card`…) stay light on dark brands.
   - Fonts and corner radius stop at the menu.
5. **The preview lies about some screens.**
   - Checkout and Upsell redirect to the menu when the owner's own cart is empty.
   - Product Detail always shows `items[0]`, which may have no options at all.
   - The cart layout field changes `/cart`, but the preview shows the drawer. [ARCH][AUDIT]
6. **There is no safety net.**
   - No undo, no discard, no change list.
   - "Reset section" writes `''` into toggles and selects, which fails Zod at publish.
   - Publish sends every field, not a diff, so it can overwrite columns another tool wrote since the page loaded (e.g. `hero_preset`). [ARCH]
7. **It is unusable on a phone.** The Studio has no responsive layout, though most owners are on phones. [DESIGN]

---

## 2. Principles

Each principle is backed by the research track in brackets.

1. **Tapping the store is the main way to edit.** Inspect is always on; there is no toggle to find. [UX][COMP: Shopify preview inspector]
2. **Owners pick roles and schemes, not hex values.** Every colour is derived from a few brand inputs, and on-colours are automatic. [COMP: Squarespace, Square, Material 3][UX]
3. **Unreadable text can't happen by default.** A contrast floor applies at render, and the editor offers a one-tap Fix. WCAG 2.2 AA is the pass/fail gate; APCA is the quality target. [UX]
4. **The editor never lies.** The value an editor row shows is computed by the same function the storefront uses, and a test enforces this. [PDP]
5. **Owners can see every state.** Chosen and not chosen, sold out, max reached, required-missing, empty cart, error, closed, long names, no photo. [INV][UX]
6. **At most two levels of disclosure inside any panel.** Depth comes from what the owner selects, not from menus. [UX: NN/g]
7. **Every change can be undone, and nothing is live until Publish.** The panel shows which values are custom and which are inherited, with a Reset on each. [COMP: Squarespace dots, Webflow labels][UX]
8. **Usability rules stay fixed.** Owners cannot change these: required groups first, rule labels, the sold-out treatment, sticky bar position, checkout step order, 44 px targets, focus rings, and the contrast floor. [INV][COMP: Square's fixed checkout font, GloriaFood's neutral menu]
9. **Lossless.** Every existing column keeps working. Roles are existing columns. No migration rewrites stored colours.

---

## 3. Information architecture

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ ← Admin  Kape Tayo · Brand          ↶ ↷        [Phone|Computer]   7 changes ▾  [Publish] │
├──────────────────────────────┬───────────────────────────────────────────────────────────┤
│ BRAND KIT      ⌕ All settings│  Welcome   Menu   Item   Cart   Checkout   Tracking       │
│ ┌──────────────────────────┐ │                  ════                                     │
│ │ [logo] Logo        Change│ │                 ┌───────────────────────┐                 │
│ │ ●●●●● Colors  2 to fix ! │ │                 │ (o) Kape Tayo   Cart 2│                 │
│ │ Aa    Font   Warm editor.│ │                 │  Spanish Latte  ₱150  │                 │
│ │ ▢     Corners       Soft │ │                 │  Size        Pick 1   │                 │
│ │ ▦     Design   Showcase  │ │                 │ ┏━━━━━━━┓┌───────┐    │                 │
│ └──────────────────────────┘ │                 │ ┃ 12oz  ┃│ 16oz  │    │                 │
│ [ Restyle in 1 minute ]      │                 │ ┗━━━━━━━┛└───────┘    │                 │
│                              │                 │  Add-ons   Optional   │                 │
│ ON THIS SCREEN               │                 │  Pearl  +₱10  − 0 +   │                 │
│  Header                  ›   │                 │ ─────────────────────  │                 │
│  Photo & name            ›   │                 │ ₱150  [Add to cart]   │                 │
│  Options       · 1 custom ›  │                 └───────────────────────┘                 │
│  Add-ons                 ›   │     Showing: Spanish Latte ▾   (dish picker)              │
│  Goes well with          ›   │     [ Not chosen | Chosen | Sold out | Max reached ]      │
│  Add bar                 ›   │            Edit ●  Try it (P)                             │
└──────────────────────────────┴───────────────────────────────────────────────────────────┘
```

**The panel root is the Brand kit:** Logo · Colours · Font · Corners · Design (storefront pack, card template, page layout). Below it, **On this screen** lists the current screen's components. Tapping a component in the list or in the preview drills the panel into it, with a breadcrumb back: `Item › Options › Option chip`.

**The journey switcher replaces the 11-letter rail.** [COMP: Shopify page selector]

| Today | v2 |
|---|---|
| Global Brand | Brand kit |
| Site Layout | Brand kit → Design |
| Storefront, Menu Layout, Footer | **Menu** screen |
| Flash Screen | Menu, "Opening" state |
| Quick-view modal | Retired. Its colours move to Cart → "Edit item" (the only place it still opens) |
| Welcome Page | **Welcome**. Shows the Welcome Builder design with "Open Welcome Builder", else the classic settings |
| Product Detail + pairing pop-up | **Item** ("After adding" state = AddedSheet) |
| Cart + Upsell Modal | **Cart** ("Last call" component, previewed in the drawer where it really appears) |
| Checkout | **Checkout** (plus a new "Order sent" confirmation state) |
| (none) | **Tracking** (new) |

**All settings (⌘K):** search over every field label plus plain synonyms ("checkmark", "price colour", "sold out"). A result jumps to the field and outlines the element. Nothing becomes unreachable. [UX]

**Quick look (first visit, or "Restyle in 1 minute" any time):**
1. Logo
2. Colours: three palettes from the logo plus "use exactly my logo colour"
3. Font: three live headline cards
4. Corners: Sharp / Soft / Round
5. Done: "Publish now, or fine-tune a screen"

It uses the onboarding look (`TapCard`). [DESIGN][COMP: Squarespace palette-from-image, Linktree Enhance]

**Phone is the default device.** An edit applies everywhere. "Different on computers" is an explicit choice in a field's ⋯ menu and shows a device badge. Existing `mobile_overrides` keep working and show the badge. [DESIGN]

---

## 4. Interaction model

- **Edit / Try it.**
  - Edit (default): hover shows a 1 px outline and a name tag. A click shows a 2 px outline and a floating toolbar `[↑ Parent] [name] [Reset]`. Esc selects the parent.
  - Try it (`P`): clicks behave like a diner's.
  - This reuses the Hero Builder canvas patterns: `canvas.tsx` selection ring and toolbar, the "Select something to edit it" empty state.
- **Component registry** (`src/lib/branding-components.ts`): id, label, parent, screen, fields (either store), states, contrast pairs.
  - Today's `data-branding-scope` keys become component ids, so the storefront markup barely changes.
  - Contract test: every scope key and every registry field belongs to exactly one component, or is marked "All settings only".
- **Two-way hover.**
  - Hovering a panel row posts `wn-branding-hover {fieldId}`, and the iframe outlines every element that uses it ("Used in 14 places").
  - Hovering a component highlights its row.
- **Inline text.** Double-click a label ("Optional", "Free", "Add to Cart", "Your Cart") to edit it in place. Only elements tagged `data-branding-text="<field>"` can be edited. The edit goes through the normal draft, so undo covers it.
- **State switcher** (`wn-branding-state`, honoured only under `?brandingPreview=1`):

  | Component | States |
  |---|---|
  | Option chip | Not chosen · Chosen · Sold out · Max reached |
  | Add-on | 0 · Picked · Max |
  | Add bar | Ready · Choose required · Sold out · Closed |
  | Cart | Empty · With items · Below minimum |
  | Checkout | Filling in · Error · Submitting · Order sent |
  | Menu | Open · Opening screen · Closed |
  | Tracking | Received · Preparing · Ready · On the way · Done |

- **Sample data instead of empty previews.**
  - The editor injects a sample cart (the store's own dishes, preferring ones with options and add-ons) for Cart and Checkout, so they never bounce to the menu.
  - A dish picker on Item defaults to the dish with the most option groups.
  - Real data first; sample only where the store has none. [UX][ARCH]

---

## 5. Colour model

**Seven roles on existing columns. No new columns.** [DESIGN][COMP][UX]

| Owner sees | Column | Drives |
|---|---|---|
| **Brand** | `accent_color` | Highlights, hero button, badges, links |
| **Main** | `primary_color` | Buttons, prices, active tab, chosen option |
| **Page** | `background_color` | Backgrounds |
| **Cards** | `cards_color` | Cards, sheets, options, add-on rows |
| **Text** | `text_primary_color` | Text |
| Lines *(More)* | `border_color` | Borders |
| Soft text *(More)* | `text_secondary/muted` | Derived from Text unless set |

**Derived colours**
- On-colours (button text, chosen-chip text, badge text) are computed: whichever of white and Text step 12 has the higher APCA contrast (`readableOn()` in `card-color.ts`). They are stored only when the owner overrides them.
- Each role gets an OKLCH ramp: 12 Radix-style steps, step 9 = the owner's exact colour, chroma tapered at both ends. Hover, pressed, tint and selected states come from the ramp, never from a separate field per state. [UX][INV]
- Test-enforced invariants: step 11 on step 2 ≥ Lc 60; step 12 on step 2 ≥ Lc 90.

**Every component colour row is a role chip.** For example `Option background · ◐ Follows Cards`. Picking a raw colour moves the row to **Custom** (blue dot, ↺ "Back to Cards"). A section header says "3 custom · Reset all".

**Contrast guard**
- Each component declares its pairs:

  | Pair | Minimum |
  |---|---|
  | Text on its fill | 4.5:1 |
  | Large text / icons | 3:1 |
  | Chosen vs not-chosen, and vs the page (1.4.11) | 3:1 |

- A failing pair shows a badge: amber for 3–4.5, red below 3. **Fix** tries the auto on-colour first, then binary-searches OKLCH lightness at the same hue to the nearest passing colour, by smallest ΔE. Fix is one undo step.
- Brand kit shows a summary across the whole store: "2 things are hard to read". [UX]

**Render-time contrast floor (storefront).** When a resolved text/fill pair is below 3:1, the storefront uses `readableOn(fill)`. This only changes pairs that are already unreadable. It covers stores that never open the editor.

**Schemes** (Phase 4, optional). Four computed section styles: Light · Tinted · Brand · Dark. The header, hero, category bar, footer, flash and welcome sections each pick one, Squarespace/Shopify style. This needs one small jsonb column (§10 Q2). [COMP]

**One-time tidy-up.** Banner: "14 colours are set to the same value as your theme. Let them follow your theme?" It previews as identical and is one undo step. It is never done silently.

---

## 6. Making every ordering screen editable (storefront work)

Ranked by value. [AUDIT][INV]

| # | Change | Screens |
|---|---|---|
| S1 | Blank cart/checkout colours inherit the brand (`getCartPalette` / `getCheckoutPalette`); remove the orange/gray template defaults | Cart, Checkout |
| S2 | Map shadcn tokens (`--background --foreground --card --muted --muted-foreground --border --input --ring`) to brand roles on every storefront root | Outlet picker, empty states, dialogs, sheets, PDP notices |
| S3 | Font pair + `--brand-radius` everywhere (font link + body font in cart, checkout, order, tracking layouts) | Cart, Checkout, Confirmation, Tracking |
| S4 | Checkout controls read roles: inputs, order-type tiles, schedule chips, payment tiles/panel, voucher, proof upload, payment dialog, sticky header | Checkout (465 literals → roles) |
| S5 | Order-sent confirmation branded (palette + copy), with a state in the switcher | Confirmation |
| S6 | **Tracking** screen in the editor: preview route with a sample order, status-hero style safe on pale brands, stamp card inputs | Tracking |
| S7 | Cart drawer header, quantity controls, remove dialog on roles; previewed in the drawer **and** on `/cart` | Cart |
| S8 | Store-closed and active-order banners on roles | Menu |
| S9 | Card labels (Sold out / Unavailable / Add), active-tab text = auto on-colour, search placeholder | Menu |
| S10 | PDP: sheet container background, unavailable notice, "Choose size", "You might also like", AddedSheet copy | Item |
| S11 | Edit-item modal (the old "Quick view") body/footer on roles | Cart |
| S12 | Combo wizard + loading skeletons on roles | Menu, Item, Checkout |
| S13 | Inspect tags for every component above | All |

**Copy and labels.** A merchant can rename every system label on these screens: headings, buttons, empty states, Required/Optional/Free/Sold out, status labels (the meaning stays fixed). Labels are stored in ONE jsonb column, `tenants.storefront_labels` (key → text, Zod-validated, length-capped, GSM-safe where it is reused in texts). A missing key falls back to today's wording. EN and Taglish presets. (§10 Q1)

**Inherited from existing editors.**
- Hero Builder and Welcome Builder stay as they are. The Menu and Welcome screens deep-link into them.
- Boost Sales copy for offers stays in Boost Sales.

---

## 7. Phases

Each phase ships on its own, with tests, lint, and browser QA on real platform stores (one light, one dark, one pale-brand), phone and desktop.

### Phase 0: Product Detail accuracy fix (BUILT, uncommitted)

- **Storefront**
  - Modifier chips read `--pd-variation-option-*`. Add-on rows read `--pd-addon-*`, with picked colours when quantity is above 0.
  - Steppers get a visible border, and the "Free" label comes from the owner's setting.
  - Hints take the brand's muted text colour, and the page root text uses brand text.
  - Quantity groups use the Add-ons title colour.
  - Picked add-ons with unset colours follow the unpicked row; previously primary text on a 3% tint.
- **Studio**
  - The legacy pencils and in-page customizer are hidden in the preview (`useIsBrandingPreview`).
  - Product Detail rows show what the page renders (`resolveProductFieldEffective` runs the real merge), labelled Brand or Default.
  - `product/presell`, `product/addon-option` and `product/variation-option` are inspectable.
- **Tests**
  - Contract: every `var(--pd-*)` read is defined.
  - Option/add-on theming.
  - Effective-field parity for every Product Detail field.
  - Preview hook.
- **Verified** on Uncle-Drei's live data in dev at 390 px: chips `#1a1a1a` / `#fafafa`, add-on rows themed, picked row gold.

### Phase 1: Safety net (editor foundation)

- One combined draft reducer over `{tenant, product, mobile, mobileProduct, categories}`, generalised from `hero-builder/editor-state.ts`.
- Undo/redo with coalesced typing, the change count, the "N changes ▾" list (before → after, jump-to, per-change revert) and Discard.
- Drafts autosave to localStorage.
- Publish sends only the diff, store by store, with a retry for the part that failed.
- Fix Reset section (it must clear, not write `''` into toggles and selects).
- Retire `product-detail-customizer.tsx` and the pencils (§10 Q3).

### Phase 2: Tap-to-edit

- Component registry + contract test.
- Always-on selection, breadcrumb, contextual panel, floating toolbar, two-way hover.
- The old accordion becomes "All settings" with ⌘K search.
- Registry inherit chains made equal to `getTenantBranding` (parity test). This closes the remaining tenant-side mismatches: `brand_color`, `modal_background_color`, cart/checkout button text, and the palette layer.

### Phase 3: Colour roles + contrast

- Role picker, inherited chips, override dots, ramps, contrast badges + Fix, the store-wide summary.
- Render-time contrast floor.
- The opt-in tidy-up banner.
- Dead fields removed from the panel: pairing pop-up, product checkout sheet, gradient/body font/animation. Their columns stay.

### Phase 4: Screens + states + every ordering screen

- Journey switcher, states protocol, sample cart/dish picker, Quick look.
- Storefront items S1–S13 (§6) plus `storefront_labels`.
- Optional: section schemes.
- Changes stores' look where fields are blank (§10 Q4).

### Phase 5: Phone editor + inline text + polish

- Bottom-sheet editor (45% / 90% detents, ≥ 44 px targets, long-press = parent), inline text editing.
- Layers tree for keyboard users, live-region announcements.
- Named versions ("Restore this look").

---

## 8. Testing and verification

- **Pure engines** (role resolution, ramps, contrast fix, component registry, label fallback): unit tests plus fast-check properties over `STOREFRONT_PALETTES` × card/checkout templates. No declared pair below its threshold after Fix.
- **Parity tests**
  - Editor value === storefront value for every field. Product side done in Phase 0; tenant side in Phase 2.
  - Every scope key mapped; every `var(--pd-*)` / `var(--brand-*)` read is defined.
- **Lossless check** (opt-in live): opening the Studio and publishing zero changes leaves `getTenantBranding` and `mergeSettingsWithBranding` output byte-identical for real platform stores.
- **Browser QA every phase** on three real stores (light / dark / pale brand), phone 390 px and desktop: every state in the switcher.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Visual change on live stores when blanks start inheriting (S1/S2) | Gated per phase; screenshot diff of 10 real stores before and after; release note; owner approval (Q4) |
| Shared-node edits hit the Hero/Welcome Builders | Reuse their components; don't fork them; their tests run in CI |
| Publish overwrite of columns other tools write | Diff-only publish (Phase 1) |
| Platform DB load | No new queries on request paths; `storefront_labels` rides the existing tenant SELECT (add it to the column list, per the select-gap memory) |

## 10. Owner decisions (defaults in **bold**)

1. **Q1 Labels storage:** **one jsonb column `tenants.storefront_labels`** / one column per label.
2. **Q2 Section schemes** (Light/Tinted/Brand/Dark per section, one jsonb column): **yes, in Phase 4** / skip.
3. **Q3 Retire the old in-page pencil customizer** on the product page: **yes, in Phase 1** / keep.
4. **Q4 Blank cart/checkout/confirmation colours start following the brand** (stores with blank fields will change from orange/white to their brand): **yes, with a release note** / only for new stores.
5. **Q5 Order:** **0 → 1 → 2 → 3 → 4 → 5** / move Phase 4's storefront items (S1–S13) ahead of the editor work.
