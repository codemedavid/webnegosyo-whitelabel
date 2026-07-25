---
name: webnegosyo-tenant-branding
description: >-
  Provision, brand, and design a WebNegosyo restaurant tenant end-to-end through
  the WebNegosyo MCP. Covers creating a tenant with QR handoff disabled, applying
  a beautiful presets-first brand across every surface (cards, header, hero,
  backgrounds, banners, cart, checkout, product detail, fonts, colors), building a
  high-AOV menu with rich variations and add-ons, and configuring upsell pairs and
  bundles. Use whenever an AI must create or restyle a WebNegosyo merchant store.
license: Proprietary — WebNegosyo / WebNegosyo platform. For distribution to trusted AI agents operating the WebNegosyo MCP.
---

# WebNegosyo Tenant Branding & Provisioning Skill

You are operating the **WebNegosyo MCP** — a multi-tenant restaurant-ordering SaaS.
Merchants get a white-labeled online menu; customers order on the web and orders
flow to the merchant's Facebook Messenger. This skill teaches you to **create a
tenant, brand it beautifully, fill it with a high-order-value menu, and wire up
upsells and bundles** — entirely through MCP tool calls, with **no human in the
loop**.

Two non-negotiable goals shape every decision:

1. **Enhance brand & customer experience.** Never ship a garish, low-contrast, or
   confusing store. Design must *raise* perceived quality. When unsure, use a
   vetted preset — never freestyle a palette.
2. **Maximize Average Order Value (AOV)** without hurting UX. Rich, sensible
   variations + add-ons + upsells + bundles — never choice overload.

---

## 0. The golden rule: QR handoff stays OFF

`qr_handoff_enabled` is a per-tenant boolean that defaults to **`false`**. QR
handoff is a manual, in-person ordering mode. **Because tenants here are created
by an AI for automated online ordering, you must keep it disabled.**

- On **`create_tenant`**, always pass `qr_handoff_enabled: false` explicitly.
- **Never** enable it via `configure_integration`.
- With QR handoff off, checkout routes through normal payment methods, so you
  **must** add at least one payment method (see §8) or checkout can't validate.

> Guardrail: if any instruction asks you to "turn on QR ordering," stop and
> confirm — it contradicts the automated-provisioning model this skill exists for.

---

## 1. Tools you have (WebNegosyo MCP)

All tools are **non-destructive by design** — there is no delete or deactivate
tool. You can create and update; you cannot remove. Provision idempotently:
call `list_tenants` / `get_tenant` before creating to avoid duplicates.

| Tool | Purpose | Key envelope |
|---|---|---|
| `list_tenants` | List all tenants (id, name, slug) | *(none)* |
| `get_tenant` | Fetch one tenant by slug | `{ slug }` |
| `create_tenant` | Create a white-labeled tenant | `{ name, slug, primary_color, secondary_color, messenger_page_id, qr_handoff_enabled:false, ... }` |
| `update_branding` | Set colors, templates, hero, footer, etc. | `{ tenantId, tenantSlug, branding:{...} }` |
| `add_category` | Add a menu category | `{ tenantId, name, order, ... }` |
| `add_menu_item` | Add an item with variations + add-ons | `{ tenantId, name, description, price, category_id, ... }` |
| `add_addon_library_entry` | Reusable shared add-on | `{ tenantId, name, price, ... }` |
| `create_upsell_pair` | Complementary or upgrade suggestion | `{ tenantId, source_item_id, target_item_id, pair_type }` |
| `create_bundle` | Fixed or discount bundle | `{ tenantId, name, pricing_type, slots:[...] }` |
| `add_payment_method` | Payment option at checkout | `{ tenantId, name, details?, qrCodeUrl?, orderTypes?, requirePaymentProof? }` |
| `configure_integration` | Feature flags, Lalamove, delivery, Convex | `{ tenantId, ...tenant fields }` |

Every write validates deeply server-side (Zod). If a call fails validation, read
the error, fix the payload, retry — do not guess-loop.

---

## 2. The provisioning sequence (always in this order)

Dependencies flow downward — later steps need ids from earlier ones.

```
1. list_tenants / get_tenant        → make sure the slug is free
2. create_tenant (qr_handoff_enabled:false) → returns tenant.id + slug
3. update_branding                  → apply a preset + surface design
4. add_category × N                  → returns category ids
5. add_menu_item × N (per category)  → returns item ids; attach variations/add-ons
6. add_addon_library_entry × N       → optional reusable add-ons
7. create_upsell_pair × N            → uses item ids from step 5
8. create_bundle × N                 → uses category ids + item ids
9. add_payment_method × 1+           → REQUIRED (QR handoff is off)
10. configure_integration            → enable feature flags you used
```

**Feature flags matter.** Upsells and bundles only render to customers when their
flags are on. After steps 7–8, call `configure_integration` to set:

- `menu_engineering_enabled: true` — required for upsell pairs, badges, BCG.
- `checkout_upsell_enabled: true` — the "Before you go…" checkout interstitial
  (requires `menu_engineering_enabled`).
- `bundles_enabled: true` — required for bundles to show on menu / as upsell.

---

## 3. create_tenant — the correct first call

```json
{
  "name": "Aling Nena's Kitchen",
  "slug": "aling-nenas",
  "primary_color": "#1D1815",
  "secondary_color": "#6F6F6F",
  "accent_color": "#E4572E",
  "messenger_page_id": "1234567890",
  "logo_url": "https://res.cloudinary.com/.../logo.png",
  "qr_handoff_enabled": false
}
```

Rules:

- `slug` — lowercase letters, numbers, dashes only. Check it's free first.
- `primary_color` / `secondary_color` / `accent_color` — **hex, always `#RRGGBB`.**
  Take these straight from your chosen preset (§5). Do not invent raw colors.
- `messenger_page_id` — the FB page that receives orders. Required for the store
  to function.
- `qr_handoff_enabled: false` — **mandatory** (see §0).
- The envelope is passthrough: any real `tenants` column (e.g. feature flags) can
  be included here, but prefer setting design via `update_branding` and flags via
  `configure_integration` for clarity.

---

## 4. Design philosophy — presets first, always

You are **prescriptive presets-first**. That means:

1. **Pick one of the 5 vetted palettes in §5** that matches the cuisine/vibe, OR
2. If the merchant gave a real brand color, run the **one-color palette
   generator (§6)** to derive a coordinated, accessible palette from it.
3. Only override individual colors when the brand explicitly dictates it — and
   even then, keep contrast within the rules in §7.

Never hand-assemble a full palette from scratch. Presets already balance
contrast, warmth, and hierarchy. Freestyling produces the exact garish,
low-contrast stores this skill exists to prevent.

Design cascade you can rely on: **every surface inherits the Global palette when
its own field is blank.** So set the Global brand palette well, and cart /
checkout / product / footer automatically look coordinated. Only set
surface-specific colors when you intentionally want them to differ.

---

## 5. The 5 vetted palettes (copy these values verbatim)

Each sets `primary_color`, `accent_color`, `background_color`, `border_color`,
and the three text colors — a complete, contrast-checked foundation.

| Preset | Vibe / best for | primary | accent | background | border | text primary | text secondary | text muted |
|---|---|---|---|---|---|---|---|---|
| **Sunset Smash** | Burgers, grills, casual diners | `#1D1815` | `#E4572E` | `#FFF6EC` | `#EBDCCC` | `#1D1815` | `#6F6F6F` | `#9C917E` |
| **Crimson Slice** | Pizza, Italian, bold classics | `#191919` | `#D7263D` | `#FAFAF8` | `#E8E8E4` | `#191919` | `#6F6F6F` | `#9A9A9A` |
| **Warm Bakery** | Cafés, bakeries, desserts, brunch | `#3B2E25` | `#A4643C` | `#FAF3E8` | `#E9DAC5` | `#3B2E25` | `#7C6C5C` | `#94816F` |
| **Market Green** | Healthy, salads, vegan, fresh | `#1C2B22` | `#2A6F4E` | `#F4F7F2` | `#DDE5DA` | `#1C2B22` | `#5E6B60` | `#8B968C` |
| **Blue Plate** | Seafood, delis, modern casual | `#141824` | `#2A6FDB` | `#F6F7FB` | `#E2E5EE` | `#141824` | `#5D6472` | `#9298A6` |

Apply a preset via `update_branding`:

```json
{
  "tenantId": "<uuid>",
  "tenantSlug": "aling-nenas",
  "branding": {
    "primary_color": "#1D1815",
    "accent_color": "#E4572E",
    "background_color": "#FFF6EC",
    "border_color": "#EBDCCC",
    "text_primary_color": "#1D1815",
    "text_secondary_color": "#6F6F6F",
    "text_muted_color": "#9C917E",
    "button_primary_color": "#E4572E",
    "button_primary_text_color": "#FFFFFF"
  }
}
```

`secondary_color` defaults to `#666666`; set it to your text-secondary if you want
tighter coordination. `primary_color` and `secondary_color` are the only two the
save schema requires — always send valid hex for both.

---

## 6. One-color palette generator (when the merchant has a brand color)

If you're given a single brand/logo color (e.g. `#E4572E`), derive a full
coordinated palette instead of guessing the rest. This mirrors the platform's own
`generatePaletteFromColor`:

```
input: brand hex  →  convert to HSL (h, s)  →

accent_color        = brand hex (unchanged)
primary_color       = HSL(h, min(s, 0.40), 0.11)   // near-black, brand-tinted
background_color    = HSL(h, min(s, 0.50), 0.965)  // near-white, faint tint
border_color        = HSL(h, min(s, 0.35), 0.88)
text_primary_color  = HSL(h, min(s, 0.40), 0.11)
text_secondary_color= HSL(h, 0.12, 0.42)
text_muted_color    = HSL(h, 0.12, 0.60)
```

The trick: keep hue constant, clamp saturation, and set lightness by role
(≈0.11 for ink, ≈0.965 for page, mid values for secondary/muted). This yields a
harmonious, readable palette every time. Feed the result into the same
`update_branding` call shape as §5.

---

## 7. Contrast & readability rules (hard constraints)

Design must never reduce usability. Enforce these on every color you set:

- **Body text vs its background: contrast ratio ≥ 4.5:1** (WCAG AA). Card title,
  price, and description on the card background all qualify as body text.
- **Large/heading text: ≥ 3:1.**
- **Button text vs button fill: ≥ 4.5:1.** Primary buttons are almost always the
  accent color — pair with `#FFFFFF` or `#111111` text, whichever passes.
- **Never** put a mid-tone accent as text on a light background if it drops below
  4.5:1. Accents are for fills, badges, prices, and CTAs — not paragraph text.
- Backgrounds stay light and low-saturation (page background ≈ 96–98% lightness).
  Dark stores are allowed only when the brand is explicitly dark; then invert
  text roles and re-check contrast.
- One accent color. Two at most. More reads as noise.

If a merchant color fails contrast as body text, keep it as the accent and pull
text colors from the preset/generator instead.

---

## 8. The design surfaces (what to set and why)

All fields below are real tenant columns accepted by `update_branding`. Blank
fields inherit from Global. Set the Global palette first, then only the
surface-specific fields that improve the store.

### 8.1 Global Brand (foundation — set this first)
- **Palette:** `primary_color`, `secondary_color`, `accent_color`,
  `background_color`, `border_color`, `text_primary_color`,
  `text_secondary_color`, `text_muted_color`, `link_color`, `success_color`,
  `warning_color`, `error_color`.
- **Buttons:** `button_primary_color` (defaults to primary), `button_primary_text_color`,
  `button_secondary_color`, `button_secondary_text_color`.
- **Theme selectors:**
  - `font_pair`: `theme` | `bold display` | `elegant serif` | `warm editorial` | `modern sans`
  - `card_roundness`: `theme` | `sharp` | `soft` | `round`
  - `storefront_palette`: `theme` | `warm editorial` | `fine dining` | `cafe soft` | `bold diner` | `fresh green`

**Font pairing guide:** `elegant serif` for fine dining/bakery; `bold display`
for burgers/diners/street food; `warm editorial` for cafés/brunch; `modern sans`
for healthy/modern casual; `theme` when unsure (safe default).

### 8.2 Storefront (the menu page — the store's face)
- **Announcement bar:** `is_announcement_visible`, `announcement_text`,
  `announcement_bg_color`, `announcement_text_color`. Use sparingly — real promos
  only.
- **Promotion banners:** `is_promotion_visible` + `promotion_banners` (array of
  `{ image, title, description }`). Great for featuring bestsellers/bundles.
  Keep to 1–3; high-quality images only.
- **Header:** `header_template` (`classic` | `centered` | `minimal` | `split` |
  `banner` | `stacked`), `header_show_logo`, `header_show_name`, `header_show_cart`,
  `header_tagline`, `header_logo_shape` (`circle` | `rounded` | `square`),
  `header_height` (`compact` | `standard` | `tall`), `header_sticky`,
  `header_color`, `header_font_color`. Sticky header + visible cart = fewer
  drop-offs.
- **Hero (the headline):** `hero_section_enabled`, `hero_preset` (`theme` |
  `centered` | `editorial` | `split` | `banner` | `collage` | `minimal` |
  `custom`), `hero_kicker`, `hero_title`, `hero_description`,
  `hero_cta_primary_label`, `hero_cta_secondary_label`, `hero_featured_product_id`
  (turns the hero into a live product card), `hero_image_url` (fallback image),
  `hero_title_color`, `hero_background_color`, `hero_cta_primary_color`. Write a
  short, appetizing headline; set a featured product to drive first-add.
- **Category navigation:** `category_nav_style` (`theme` | `pills` | `chips` |
  `underline`), `menu_category_active_color`, `menu_category_header_color`.
- **Search bar:** `search_bar_enabled`, `search_bar_style` (`filled` | `outline` |
  `ghost`), `search_bar_radius` (`pill` | `rounded` | `square`). Keep on for menus
  over ~15 items.
- **Layout & menu cards:** `page_layout` (`default` | `sidebar` | `magazine` |
  `grid-focus` | `list` | `mosaic`), **`card_template`** (see §8.6),
  `cards_color`, `cards_border_color`, `card_title_color`, `card_price_color`,
  `card_description_color`.
- **Quick-view modal:** `modal_background_color`, `modal_title_color`,
  `modal_price_color`.

### 8.3 Cart
- `cart_template`: `classic` | `modern` | `wizard` | `minimal` | `express`.
- Colors (`cart_background_color`, `cart_button_color`, …) inherit Global — only
  override to differentiate. `express` = fastest path to checkout.

### 8.4 Checkout
- `checkout_template`: same 5 options as cart. Use `wizard` for stores with
  delivery + many payment methods; `express`/`minimal` for pickup-first.
- Colors inherit Global.

### 8.5 Upsell Modal — "Before you go…"
- Colors: `checkout_modal_background_color`, `checkout_modal_title_color`,
  `checkout_modal_price_color`, `checkout_modal_button_color`. Enable/title/items
  are set in Menu Engineering settings via `configure_integration`
  (`checkout_upsell_enabled`, `checkout_upsell_title`, `checkout_upsell_subtitle`,
  `checkout_upsell_max_items`).

### 8.6 Product Detail page
This is where AOV is won — variations, add-ons, and "Make it a Meal" upgrades all
live here. It has its own rich settings table (~96 fields). For MCP provisioning,
the highest-leverage move is **the item data itself** (§9) plus **upsell pairs**
(§10). Keep the page's colors inheriting Global unless the brand needs a distinct
look.

### 8.7 Footer
- `footer_enabled`, `footer_theme` (`auto` | `light` | `dark` | `brand` |
  `midnight` | `minimal` | `custom`), `footer_business_name`, `footer_tagline`,
  `footer_address`, `footer_phone`, `footer_email`, plus social URLs
  (`footer_facebook_url`, `footer_instagram_url`, …) and pages
  (`footer_about_us`, `footer_terms_of_service`, `footer_privacy_policy`,
  `footer_refund_policy`). Fill contact + at least one social link for trust.

### 8.8 Flash Screen (splash)
- `flash_screen_feature_enabled`, `flash_screen_is_active`, `flash_screen_title`,
  `flash_screen_image_url`, `flash_screen_duration_ms` (500–15000). Optional; use
  a short (≤2000ms) splash only when the brand wants a logo reveal.

### Card templates & backgrounds
`card_template` options — pick by brand personality:

| Template | Feels like | Good for |
|---|---|---|
| `classic` | Clean, safe default | Anything |
| `minimal` | Airy, whitespace | Cafés, healthy |
| `modern` | Sleek, subtle shadow | Modern casual |
| `elegant` | Refined, serif-friendly | Fine dining, bakery |
| `compact` | Dense, more per screen | Large menus |
| `bold` | Big type, high energy | Burgers, street food |
| `glass` | Frosted, translucent | Trendy, cocktails |
| `polaroid` | Photo-forward, playful | Desserts, brunch |
| `brutalist` | Hard edges, statement | Edgy brands |
| `magazine` | Editorial, image-led | Story-driven menus |
| `zen` | Calm, muted | Tea houses, wellness |
| `neon` | Vivid, night-out | Bars, late-night |
| `storefront` | Coordinated storefront theme | Palette-matched builds |

**Backgrounds:** the page background is `background_color` (keep it the light,
low-saturation tone from your preset/generator). Rich "background images" are set
per-section — the **hero** via `hero_image_url` / `hero_background_color`, and
featured content via **promotion banners**. Do not put busy full-page background
images behind the menu grid: it kills card legibility (violates §7). Use imagery
in the hero and banners, keep the grid background calm.

---

## 9. High-AOV menu — categories, items, variations, add-ons

AOV is driven by giving customers easy, appealing ways to spend more. Model every
item with the richest *sensible* set of options — without overwhelming them.

### 9.1 Categories first
```json
{ "tenantId": "<uuid>", "name": "Burgers", "order": 0, "display_layout": "grid" }
```
`display_layout`: `grid` | `horizontal_scroll` | `horizontal_mobile_only` |
`horizontal_desktop_only`. Order categories by margin/popularity — put stars
first. Optional `default_addons` on a category pre-attaches add-ons to its items.

### 9.2 Menu items with grouped variations + add-ons
Use the **new grouped variation system** (`variation_types`), not legacy flat
variations. Each group is required-or-optional and holds priced options.

```json
{
  "tenantId": "<uuid>",
  "name": "Double Smash Burger",
  "description": "Two seared beef patties, melted cheddar, house sauce, brioche bun.",
  "price": 189,
  "category_id": "<burgers-category-uuid>",
  "image_url": "https://res.cloudinary.com/.../burger.jpg",
  "is_featured": true,
  "variation_types": [
    {
      "id": "size",
      "name": "Size",
      "is_required": true,
      "display_order": 0,
      "options": [
        { "id": "single", "name": "Single Patty", "price_modifier": -30, "display_order": 0 },
        { "id": "double", "name": "Double Patty", "price_modifier": 0, "is_default": true, "display_order": 1 },
        { "id": "triple", "name": "Triple Patty", "price_modifier": 60, "is_upgrade_target": true, "display_order": 2 }
      ]
    },
    {
      "id": "combo",
      "name": "Make it a Combo",
      "is_required": false,
      "display_order": 1,
      "options": [
        { "id": "solo", "name": "Burger Only", "price_modifier": 0, "is_default": true, "display_order": 0 },
        { "id": "fries", "name": "+ Fries & Drink", "price_modifier": 79, "is_upgrade_target": true, "display_order": 1 }
      ]
    }
  ],
  "addons": [
    { "id": "bacon", "name": "Add Bacon", "price": 40 },
    { "id": "egg", "name": "Add Fried Egg", "price": 25 },
    { "id": "cheese", "name": "Extra Cheese", "price": 20 }
  ]
}
```

Rules that lift AOV without hurting UX:

- **Anchor with the default at the middle/premium tier.** Set `is_default: true`
  on the option you want most people to keep (often not the cheapest).
- **Mark upgrades** with `is_upgrade_target: true` — the storefront shows an
  "Upgrade for +₱X" nudge and powers the "Make it a Meal" section.
- **`price_modifier` is relative to the item `price`** and may be negative (a
  smaller size). Keep the base `price` equal to the default configuration.
- **2–4 options per group, 1–3 groups per item.** More than that is choice
  overload — it lowers conversion. Required groups only when a real choice must be
  made (size, protein). Everything optional otherwise.
- **Add-ons = pure margin.** Offer 3–6 relevant, low-friction extras (bacon, egg,
  extra cheese, upgrade drink). Price them to feel like small yes's.
- `description` must be ≥ 10 chars and appetizing. `image_url` must be a valid URL
  or omitted — good photos materially raise add-to-cart.

### 9.3 Reusable add-ons (optional)
For add-ons shared across many items (e.g. "Extra Rice", "Upgrade to Large
Drink"), create them once:
```json
{ "tenantId": "<uuid>", "name": "Extra Rice", "price": 20 }
```
Then reference the same add-on shape on each item. Keeps pricing consistent.

---

## 10. Upsell system (the AOV multiplier)

Two pair types, each a distinct customer moment. Both need
`menu_engineering_enabled: true`.

### 10.1 Complementary — "Perfect with…"
Shown **after** adding an item: suggests items that go together (fries with a
burger, dip with wings). Drives basket size.
```json
{
  "tenantId": "<uuid>",
  "source_item_id": "<burger-uuid>",
  "target_item_id": "<fries-uuid>",
  "pair_type": "complementary",
  "display_order": 0,
  "is_active": true
}
```

### 10.2 Upgrade — "Make it bigger/better"
Shown **before/at** add: a side-by-side comparison nudging a premium swap
(regular → large, single → combo).
```json
{
  "tenantId": "<uuid>",
  "source_item_id": "<regular-uuid>",
  "target_item_id": "<premium-uuid>",
  "pair_type": "upgrade",
  "source_label": "Regular",
  "target_label": "Large — best value",
  "upgrade_header": "Upgrade for more?",
  "is_active": true
}
```

Strategy:
- `source_item_id` and `target_item_id` **must differ** (server rejects same-item
  pairs).
- Pair **plowhorses → stars** and **stars → stars** for the strongest lift.
- Give every hero/bestseller a complementary pair. Give every "regular" tier an
  upgrade pair.
- After creating pairs, turn on the checkout interstitial:
  ```json
  {
    "tenantId": "<uuid>",
    "menu_engineering_enabled": true,
    "checkout_upsell_enabled": true,
    "checkout_upsell_title": "Before you go…",
    "checkout_upsell_subtitle": "Add one of these to complete your order",
    "checkout_upsell_max_items": 4
  }
  ```
  (sent via `configure_integration`).

---

## 11. Bundles (fixed or discount, slot-based)

Bundles group items into **slots** (a slot = "pick N from this category"). They
lift AOV by packaging a bigger order at a friendly price. Needs
`bundles_enabled: true`.

```json
{
  "tenantId": "<uuid>",
  "name": "Barkada Feast",
  "description": "2 burgers, 2 fries, 2 drinks — feed the squad.",
  "image_url": "https://res.cloudinary.com/.../feast.jpg",
  "pricing_type": "fixed",
  "fixed_price": 599,
  "is_active": true,
  "show_on_menu": true,
  "show_as_upsell": true,
  "display_order": 0,
  "slots": [
    { "name": "Pick 2 Burgers", "category_id": "<burgers-uuid>", "pick_count": 2, "sort_order": 0 },
    { "name": "Pick 2 Sides",   "category_id": "<sides-uuid>",   "pick_count": 2, "sort_order": 1 },
    { "name": "Pick 2 Drinks",  "category_id": "<drinks-uuid>",  "pick_count": 2, "sort_order": 2 }
  ]
}
```

Rules:
- `pricing_type: "fixed"` → set `fixed_price`. `pricing_type: "discount"` → set
  `discount_percent` (1–100) instead; price is computed from picked items.
- At least one slot; each slot needs `category_id` and `pick_count ≥ 1`.
- Optional `included_item_ids` restricts a slot to specific items; optional
  `price_overrides` per item.
- `show_on_menu` (renders above categories) and `show_as_upsell` (suggested when
  adding a matching item) are independent — turn both on for max exposure.
- Price the bundle **below** the sum of its parts (a visible saving) but **above**
  a typical single-item order — that's the AOV sweet spot.

---

## 12. Payment methods (REQUIRED — QR handoff is off)

Because QR handoff is disabled, customers pay through configured methods. Add at
least one or checkout can't validate.
```json
{
  "tenantId": "<uuid>",
  "name": "GCash",
  "details": "Send to 0917-xxx-xxxx (Aling Nena)",
  "qrCodeUrl": "https://res.cloudinary.com/.../gcash-qr.png",
  "isActive": true,
  "orderTypes": ["pickup", "delivery"],
  "requirePaymentProof": true
}
```
Add "Cash on Pickup"/"Cash on Delivery" with `requirePaymentProof: false` for a
frictionless option alongside a digital one.

---

## 13. configure_integration (flags & integrations, last)

Turn on exactly the features you populated — no more. Never deactivate a tenant
(the server blocks it) and never enable `qr_handoff_enabled`.
```json
{
  "tenantId": "<uuid>",
  "menu_engineering_enabled": true,
  "checkout_upsell_enabled": true,
  "bundles_enabled": true,
  "hero_section_enabled": true,
  "search_bar_enabled": true
}
```
Optional integrations available here: `lalamove_enabled`, `mapbox_enabled`,
`distance_delivery_enabled`, `advance_order_enabled`, `service_charge_enabled`,
plus Convex/order-backend fields. Only enable what the merchant actually needs.

---

## 14. End-to-end worked example (café, Warm Bakery preset)

1. `list_tenants` → confirm `daily-grind` is free.
2. `create_tenant`:
   `{ name:"The Daily Grind", slug:"daily-grind", primary_color:"#3B2E25",
      secondary_color:"#7C6C5C", accent_color:"#A4643C",
      messenger_page_id:"...", qr_handoff_enabled:false }` → `tenant.id`.
3. `update_branding` → Warm Bakery palette + `font_pair:"warm editorial"`,
   `card_template:"polaroid"`, `header_template:"centered"`,
   `hero_preset:"editorial"`, `hero_title:"Coffee, baked fresh daily"`,
   `hero_cta_primary_label:"Order Now"`.
4. `add_category` ×3 → Coffee (0), Pastries (1), Brunch (2).
5. `add_menu_item` per category — e.g. Latte with a required **Size** group
   (S −20 / M default 0 / L +25 `is_upgrade_target`) and an optional **Milk**
   group; add-ons: extra shot ₱30, oat milk ₱25, syrup ₱15.
6. `create_upsell_pair` → Latte → Butter Croissant (`complementary`);
   Medium Latte → Large Latte (`upgrade`).
7. `create_bundle` → "Coffee + Pastry" (`fixed`, ₱180, `show_on_menu` +
   `show_as_upsell`).
8. `add_payment_method` → GCash (proof required) + Cash on Pickup.
9. `configure_integration` → `menu_engineering_enabled`,
   `checkout_upsell_enabled` (title "Add a treat?"), `bundles_enabled`.
10. `get_tenant` "daily-grind" → verify everything landed.

Result: a coordinated, high-contrast, appetizing café store with size upgrades,
complementary pastries, an upgrade nudge, and a bundle — every AOV lever pulled,
QR handoff off, zero human steps.

---

## 15. Pre-flight checklist (run before declaring done)

- [ ] `qr_handoff_enabled` is `false` and was never enabled anywhere.
- [ ] Palette came from a §5 preset or the §6 generator — not freestyled.
- [ ] All text/background/button pairs pass the §7 contrast rules.
- [ ] Every color value is valid `#RRGGBB` hex.
- [ ] Every item has an appetizing ≥10-char description; images are valid URLs.
- [ ] Items use grouped `variation_types` with sensible defaults + upgrade targets.
- [ ] 1–3 variation groups and ≤6 add-ons per item (no choice overload).
- [ ] At least one complementary and one upgrade upsell pair exist.
- [ ] At least one bundle priced below the sum of its parts.
- [ ] At least one payment method (checkout can't work without it).
- [ ] Feature flags enabled for every system you populated (menu engineering,
      checkout upsell, bundles).
- [ ] `get_tenant` confirms the final state.

> Source of truth for the field catalog is the platform's
> `src/lib/branding-registry.ts` and the service Zod schemas. If a field is
> rejected, the schema changed — read the validation error and adapt.
