# WebNegosyo — Branding Editor Field Inventory

> **Purpose:** Complete catalog of every merchant-editable branding/design field across the storefront, cart, checkout, and product-detail surfaces. Handoff reference for a full redesign of the branding editor.
>
> **Platform:** Multi-tenant restaurant ordering SaaS. Every field below is a per-tenant column (or JSON) that white-labels one merchant's storefront. All colors are applied at runtime via CSS custom properties + inline `style` props, so an empty value falls back through a cascade (documented per-section).

---

## 0. Editing Surfaces (where these fields live today)

There are **four separate editor surfaces**, not one. A redesign should decide whether to unify them.

| Surface | File | Scope | Organization |
|---|---|---|---|
| **Branding Editor Overlay** | `src/components/admin/branding-editor-overlay.tsx` | Storefront/menu, cart, checkout, header, cards, layouts, banners | Tabbed overlay: Colors · Header · Layouts · Cards · Checkout · Banners · Footer |
| **Admin Settings Page** | `src/app/[tenant]/admin/settings/page.tsx` | Core colors, footer, hours, delivery, flash screen | Flat vertical form of Cards (no tabs) |
| **Product Detail Settings Overlay** | product-detail editor (🎨 button, `product_detail_settings` table) | Product detail page + bottom-sheet upsells | Tabbed overlay: Colors (per-section) · Typography · Layout |
| **Hero Designer** | `src/app/[tenant]/admin/hero-designer/page.tsx` | Hero/banner block | Full-screen canvas visual editor |

**Data storage:**
- Most fields → `tenants` table columns
- Product detail page → dedicated `product_detail_settings` table
- Hero → `hero_design` JSON + `hero_section_enabled`

**Save flow:** Zod-validated server actions (`updateTenantBrandingForAdminAction`, `updateTenantFooterForAdminAction`, `saveHeroDesignAction`) → Supabase → cache revalidation of `/menu`, `/`, footer pages.

**Color picker today:** native `<input type="color">`. No brand-color presets (footer + hero have presets/templates only).

---

## 1. GLOBAL BRAND COLORS (foundation / fallback palette)

Every other surface falls back to these when its own field is blank.

| UI Label | DB Column | Type | Default |
|---|---|---|---|
| Primary | `primary_color` | color | `#111111` |
| Secondary | `secondary_color` | color | `#666666` |
| Accent | `accent_color` | color | `#ffd700` |
| Page Background | `background_color` | color | `#ffffff` |
| Border | `border_color` | color | `#e5e7eb` |
| Primary Text | `text_primary_color` | color | `#111111` |
| Secondary Text | `text_secondary_color` | color | `#6b7280` |
| Muted Text | `text_muted_color` | color | `#9ca3af` |
| Success | `success_color` | color | `#10b981` |
| Warning | `warning_color` | color | `#f59e0b` |
| Error | `error_color` | color | `#ef4444` |
| Link | `link_color` | color | `#3b82f6` |
| Shadow | `shadow_color` | color | `rgba(0,0,0,0.1)` |

**Buttons (global):**
| UI Label | DB Column | Type | Default |
|---|---|---|---|
| Primary Button | `button_primary_color` | color | `#111111` |
| Primary Button Text | `button_primary_text_color` | color | `#ffffff` |
| Secondary Button | `button_secondary_color` | color | `#f3f4f6` |
| Secondary Button Text | `button_secondary_text_color` | color | `#111111` |

---

## 2. STOREFRONT / MENU PAGE

### 2.1 Header

**Layout & templates**
| UI Label | DB Column | Type | Options / Default |
|---|---|---|---|
| Header Template | `header_template` | select | classic, centered, minimal, split, banner, stacked (`classic`) |
| Header Template (Mobile) | `mobile_header_template` | select | same set; falls back to desktop |
| Header Height | `header_height` | select | compact, standard, tall (`standard`) |
| Logo Shape | `header_logo_shape` | select | circle, rounded, square (`circle`) |

**Toggles**
| UI Label | DB Column | Default |
|---|---|---|
| Show Logo | `header_show_logo` | true |
| Show Name | `header_show_name` | true |
| Show Cart | `header_show_cart` | true |
| Show Search | `header_show_search` | false |
| Sticky on Scroll | `header_sticky` | true |
| Blur Background | `header_blur` | true |
| Drop Shadow | `header_shadow` | false |

**Content & colors**
| UI Label | DB Column | Type | Default |
|---|---|---|---|
| Tagline | `header_tagline` | text | '' |
| Tagline Color | `header_tagline_color` | color | inherits subtitle |
| Header Background | `header_color` | color | `#ffffff` |
| Header Font Color | `header_font_color` | color | `#000000` |
| Title Color | `menu_main_header_text_color` | color | `#111111` |
| Subtitle Color | `menu_main_header_subtitle_color` | color | `#9ca3af` |
| Cart Badge Background | `menu_cart_badge_background_color` | color | `#111111` |
| Cart Badge Text | `menu_cart_badge_text_color` | color | `#ffffff` |

### 2.2 Hero Section
| UI Label | DB Column | Type | Default |
|---|---|---|---|
| Hero Title | `hero_title` | text | '' |
| Hero Description | `hero_description` | text | '' |
| Hero Title Color | `hero_title_color` | color | '' |
| Hero Description Color | `hero_description_color` | color | '' |
| Advanced Hero Design | `hero_design` | JSON | null (built in Hero Designer canvas) |
| Hero Section Enabled | `hero_section_enabled` | toggle | — |

### 2.3 Page Layout
| UI Label | DB Column | Type | Options / Default |
|---|---|---|---|
| Page Layout | `page_layout` | select | default, sidebar, magazine, grid-focus, list, mosaic (`default`) |
| Page Layout (Mobile) | `mobile_page_layout` | select | same set; falls back to desktop |
| Mobile Grid Columns | `mobile_grid_columns` | select | 1 (full-width), 2 (side-by-side) (`1`) |

### 2.4 Category Navigation
| UI Label | DB Column | Type | Default |
|---|---|---|---|
| Category Header Text | `menu_category_header_color` | color | `#111111` |
| Active Category Tab | `menu_category_active_color` | color | `#111111` |
| Inactive Category Tab | `menu_category_inactive_color` | color | `#6b7280` |

### 2.5 Search Bar
| UI Label | DB Column | Type | Options / Default |
|---|---|---|---|
| Show Search Bar | `search_bar_enabled` | toggle | true |
| Search Bar Style | `search_bar_style` | select | filled, outline, ghost (`filled`) |
| Search Bar Shape | `search_bar_radius` | select | pill, rounded, square (`pill`) |
| Background Color | `search_bar_background` | color | inherits |
| Text Color | `search_bar_text` | color | inherits |
| Placeholder Color | `search_bar_placeholder` | color | inherits |
| Icon Color | `search_bar_icon` | color | inherits |
| Border Color | `search_bar_border` | color | inherits |
| Focus Ring Color | `search_bar_focus_ring` | color | inherits |

### 2.6 Menu Cards (Product Cards)
**Template** — `card_template` (desktop) + `mobile_card_template` (optional override). 13 designs:

`classic · minimal · modern · elegant · compact · bold · glass · polaroid · brutalist · magazine · zen · neon · storefront`

All templates share one color set (no per-template colors):
| UI Label | DB Column | Type | Default |
|---|---|---|---|
| Card Background | `cards_color` | color | `#ffffff` |
| Card Border | `cards_border_color` | color | `#e5e7eb` |
| Title Text | `card_title_color` | color | `#111111` |
| Price Text | `card_price_color` | color | `#111111` |
| Description Text | `card_description_color` | color | `#6b7280` |

### 2.7 Item Detail / Quick-View Modal (menu grid)
| UI Label | DB Column | Type | Default |
|---|---|---|---|
| Modal Background | `modal_background_color` | color | `#ffffff` |
| Modal Title | `modal_title_color` | color | `#111111` |
| Modal Price | `modal_price_color` | color | `#111111` |
| Modal Description | `modal_description_color` | color | `#6b7280` |

### 2.8 Banners
**Announcement bar** (single)
| UI Label | DB Column | Type | Default |
|---|---|---|---|
| Show Announcement | `is_announcement_visible` | toggle | false |
| Announcement Text | `announcement_text` | text | '' |
| Background | `announcement_bg_color` | color | `#FFF4E5` |
| Text Color | `announcement_text_color` | color | `#663C00` |

**Promotion banners** (carousel, multiple)
| UI Label | DB Column | Type | Default |
|---|---|---|---|
| Show Promotions | `is_promotion_visible` | toggle | false |
| Banners | `promotion_banners` | array of `{id, imageUrl, title?, description?}` | [] |

### 2.9 Flash / Splash Screen
| UI Label | DB Column | Type | Default |
|---|---|---|---|
| Enable Flash Screen | `flash_screen_feature_enabled` | toggle | false |
| Active | `flash_screen_is_active` | toggle | false |
| Title | `flash_screen_title` | text | '' |
| Subtitle | `flash_screen_subtitle` | text | '' |
| Image | `flash_screen_image_url` | image | '' |
| Background Color | `flash_screen_background_color` | color | '' |
| Text Color | `flash_screen_text_color` | color | '' |
| Duration (ms) | `flash_screen_duration_ms` | number | 3000 |

---

## 3. CART PAGE

**Template** — `cart_template`: `classic · modern · wizard · minimal · express` (default `classic`).

**Colors** (all optional; blank inherits global):
| UI Label | DB Column | Default |
|---|---|---|
| Background | `cart_background_color` | inherit |
| Card Background | `cart_card_background_color` | inherit |
| Summary Background | `cart_summary_background_color` | inherit |
| Text | `cart_text_color` | inherit |
| Muted Text | `cart_muted_text_color` | inherit |
| Accent | `cart_accent_color` | → `button_primary_color` → `primary_color` |
| Border | `cart_border_color` | inherit |
| Button | `cart_button_color` | inherit |
| Button Text | `cart_button_text_color` | auto-contrast |

---

## 4. CHECKOUT PAGE

**Template** — `checkout_template`: `classic · modern · wizard · minimal · express` (default `classic`).
(wizard = multi-step Order → Details → Payment → Review)

**Colors** (all optional; blank inherits global):
| UI Label | DB Column | Default |
|---|---|---|
| Background | `checkout_background_color` | inherit |
| Card Background | `checkout_card_background_color` | inherit |
| Summary Background | `checkout_summary_background_color` | inherit |
| Text | `checkout_text_color` | inherit |
| Muted Text | `checkout_muted_text_color` | inherit |
| Accent | `checkout_accent_color` | → `button_primary_color` → `primary_color` |
| Border | `checkout_border_color` | inherit |
| Button | `checkout_button_color` | inherit |
| Button Text | `checkout_button_text_color` | auto-contrast |

> Form fields have **no per-field color overrides** — they inherit the checkout palette.

---

## 5. CHECKOUT UPSELL / "BEFORE YOU GO" MODAL

Full-screen interstitial before checkout. Distinct from the checkout page palette.

**Settings**
| UI Label | DB Column | Type | Default |
|---|---|---|---|
| Enable Interstitial | `checkout_upsell_enabled` | toggle | false |
| Title | `checkout_upsell_title` | text | "Before you go..." |
| Subtitle | `checkout_upsell_subtitle` | text | "You might also enjoy these items" |
| Max Items | `checkout_upsell_max_items` | number (1–8) | 4 |
| Item Picker | via `MenuItem.show_in_checkout_upsell` | multi-select | — |

**Colors (7 fields)**
| UI Label | DB Column | Default |
|---|---|---|
| Background | `checkout_modal_background_color` | `#ffffff` |
| Title | `checkout_modal_title_color` | `#111111` |
| Description | `checkout_modal_description_color` | `#6b7280` |
| Price | `checkout_modal_price_color` | `#111111` |
| Button | `checkout_modal_button_color` | `#111111` |
| Button Text | `checkout_modal_button_text_color` | `#ffffff` |
| Border | `checkout_modal_border_color` | `#e5e7eb` |

---

## 6. PRODUCT DETAIL PAGE (dedicated `product_detail_settings` table)

The richest surface — ~97 settings across colors, typography, labels, and layout, edited section-by-section with a live pencil-to-edit flow. Blank fields fall back to global tenant branding (mapping at end of section).

### 6.1 Header / Navigation
| UI Label | DB Column | Default |
|---|---|---|
| Header Background | `header_background_color` | inherits global header |
| Button Background | `header_button_background_color` | `#ffffff` |
| Button Icon | `header_button_icon_color` | `#374151` |

### 6.2 Product Image & Hero
| UI Label | DB Column | Default |
|---|---|---|
| Image Background | `image_background_color` | `#f3f4f6` |
| Sale Badge Background | `sale_badge_background_color` | `#ef4444` |
| Sale Badge Text | `sale_badge_text_color` | `#ffffff` |
| Image Placeholder | `image_placeholder_color` | `#9ca3af` |

**Image lightbox modal**
| UI Label | DB Column | Default |
|---|---|---|
| Modal Background | `modal_background_color` | `rgba(0,0,0,0.95)` |
| Close Icon | `modal_close_button_color` | `#ffffff` |
| Close Button Background | `modal_close_button_background` | `rgba(255,255,255,0.1)` |

### 6.3 Product Info (name, description, tags, breadcrumbs)
| UI Label | DB Column | Type | Default |
|---|---|---|---|
| Product Name Color | `product_name_color` | color | `#111827` (→ text_primary) |
| Product Name Font Size | `product_name_font_size` | text | `24px` |
| Product Name Font Weight | `product_name_font_weight` | text | `700` |
| Description Color | `description_color` | color | `#6b7280` (→ text_secondary) |
| Description Font Size | `description_font_size` | text | `14px` |
| Breadcrumb Color | `breadcrumb_color` | color | → text_muted |
| Breadcrumb Active Color | `breadcrumb_active_color` | color | → link |
| Dietary Tag Background | `dietary_tag_background_color` | color | transparent |
| Dietary Tag Text | `dietary_tag_text_color` | color | → text_primary |
| Dietary Tag Border | `dietary_tag_border_color` | color | → border |
| Heading Font | `font_family_heading` | text | system-ui stack |
| Body Font | `font_family_body` | text | system-ui stack |

### 6.4 Variation Selectors (Size, Spice, etc.)
| UI Label | DB Column | Type | Default |
|---|---|---|---|
| Section Title Color | `variation_section_title_color` | color | `#111827` (→ text_primary) |
| Section Title Font Size | `variation_section_title_font_size` | text | `16px` |
| Required Label Text | `variation_required_text` | text | `* Pick 1` |
| Optional Label Text | `variation_optional_text` | text | `Optional` |
| Inactive Background | `variation_option_background_color` | color | `#f9fafb` |
| Inactive Text | `variation_option_text_color` | color | `#374151` |
| Inactive Border | `variation_option_border_color` | color | `#e5e7eb` |
| Active Background | `variation_option_selected_background_color` | color | → primary |
| Active Text | `variation_option_selected_text_color` | color | `#ffffff` |
| Active Border | `variation_option_selected_border_color` | color | → primary |
| Price Modifier Text | `variation_price_modifier_color` | color | `#6b7280` |
| Required Badge | `variation_required_badge_color` | color | `#6b7280` |

### 6.5 Add-ons (checkboxes)
| UI Label | DB Column | Type | Default |
|---|---|---|---|
| Section Title Color | `addon_section_title_color` | color | `#111827` (→ text_primary) |
| Section Title Font Size | `addon_section_title_font_size` | text | `16px` |
| Optional Label | `addon_optional_text` | text | `(Optional)` |
| Free Price Label | `addon_price_free_text` | text | `Free` |
| Inactive Background | `addon_background_color` | color | `#ffffff` (→ cards) |
| Inactive Text | `addon_text_color` | color | `#111827` (→ text_primary) |
| Inactive Border | `addon_border_color` | color | `#e5e7eb` (→ border) |
| Active Background | `addon_selected_background_color` | color | primary @ 3% |
| Active Text | `addon_selected_text_color` | color | → primary |
| Active Border | `addon_selected_border_color` | color | → primary |
| Checkmark | `addon_selected_check_color` | color | → primary |
| Price Text | `addon_price_color` | color | `#6b7280` |

### 6.6 Related Items ("You might also like")
| UI Label | DB Column | Type | Default |
|---|---|---|---|
| Section Title Color | `related_section_title_color` | color | `#111827` (→ text_primary) |
| Section Title Font Size | `related_section_title_font_size` | text | `18px` |
| Item Background | `related_item_background_color` | color | → cards |
| Item Name | `related_item_name_color` | color | `#111827` (→ card_title) |
| Item Price | `related_item_price_color` | color | → card_price |

### 6.7 Sticky Footer (summary, quantity, action buttons)
| UI Label | DB Column | Type | Default |
|---|---|---|---|
| Footer Background | `footer_background_color` | color | `#ffffff` (→ cards) |
| Footer Border | `footer_border_color` | color | `#e5e7eb` (→ border) |
| Footer Shadow | `footer_shadow_color` | text | `rgba(0,0,0,0.1)` |
| Summary Text | `summary_text_color` | color | `#6b7280` (→ text_muted) |
| Empty Summary Text | `footer_empty_summary_text` | text | `Standard` |
| Total Price | `total_price_color` | color | `#111827` (→ text_primary) |
| Original Price | `original_price_color` | color | `#9ca3af` |
| Quantity Background | `quantity_controls_background` | color | `#f3f4f6` |
| Quantity Button Icon | `quantity_button_color` | color | `#374151` |
| Quantity Text | `quantity_text_color` | color | `#111827` |
| Buy Now Background | `buy_now_button_background` | color | → button_secondary |
| Buy Now Text | `buy_now_button_text_color` | color | → button_secondary_text |
| Buy Now Border | `buy_now_button_border_color` | color | → primary |
| Buy Now Label | `buy_now_button_label` | text | `Buy Now` |
| Add to Cart Background | `add_to_cart_button_background` | color | → button_primary |
| Add to Cart Text | `add_to_cart_button_text_color` | color | → button_primary_text |
| Add to Cart Shadow | `add_to_cart_button_shadow_color` | color | `rgba(0,0,0,0.1)` |
| Add to Cart Label | `add_to_cart_button_label` | text | `Add To Cart` |
| Button Border Radius | `button_border_radius` | text | `9999px` (pill, all buttons) |

### 6.8 Global Layout / Motion (product detail)
| UI Label | DB Column | Notes |
|---|---|---|
| Page Background | `page_background_color` | product-detail-only |
| Page Gradient | `page_background_gradient` | optional |
| Section Padding | `section_padding` | — |
| Card Border Radius | `card_border_radius` | — |
| Enable Animations | `enable_animations` | toggle |
| Animation Speed | `animation_speed` | — |

---

## 7. BOTTOM SHEETS / UPSELL MODALS (product detail)

### 7.1 Pairing / "Perfect with..." popup (post add-to-cart)
| UI Label | DB Column | Falls back to |
|---|---|---|
| Background | `popup_modal_background_color` | modal_background |
| Title | `popup_modal_title_color` | modal_title |
| Description | `popup_modal_description_color` | modal_description |
| Price | `popup_modal_price_color` | modal_price |
| Button | `popup_modal_button_color` | button_primary |
| Button Text | `popup_modal_button_text_color` | button_primary_text |
| Border | `popup_modal_border_color` | border |

### 7.2 Checkout modal (product_detail_settings copy)
Mirror of the 7 `checkout_modal_*` fields (§5), scoped in `product_detail_settings`, each falling back to the corresponding global `modal_*` / `button_primary*` / `border`.

### 7.3 ⚠️ "Make it a Meal?" inline upgrade — NOT editable
`src/components/customer/inline-upgrade-section.tsx` is **hardcoded Tailwind** (white bg, gray-900 text, gray-200 borders). No branding fields today. **Recommend adding branding support in the redesign.**

---

## 8. FOOTER (Admin Settings → Footer & Pages, 5 tabs)

**Theme presets:** `auto · light · dark · brand · midnight · minimal · custom` (`footer_theme`, default `auto`). "auto" inherits brand colors; "custom" unlocks the color fields below. Footer has a **live preview**.

**General:** `footer_enabled` (toggle, true) · `footer_logo_url` · `footer_business_name` · `footer_tagline`

**Contact:** `footer_address` · `footer_phone` · `footer_whatsapp` · `footer_viber` · `footer_email`

**Social (URL + display name each):** Facebook (`footer_facebook_url` / `_name`), Instagram, TikTok, Twitter/X, YouTube (`footer_{platform}_url` / `_name`)

**Pages (textareas → public routes):** `footer_about_us` (/about) · `footer_terms_of_service` (/terms) · `footer_refund_policy` (/refund) · `footer_privacy_policy` (/privacy)

**Bottom row:** `footer_copyright_text` · `footer_show_powered_by` (toggle, true) · `footer_powered_by_text` (default "Powered by WebNegosyo")

**Colors (custom theme):** `footer_background_color` · `footer_text_color` · `footer_heading_color` · `footer_link_color` · `footer_muted_color` · `footer_icon_color` · `footer_icon_background_color` · `footer_border_color`

---

## 9. Cross-Cutting Notes for the Redesign

1. **Cascade model.** Global palette (§1) → surface palettes (cart/checkout/product-detail) → component fields. Blank = inherit. A redesigned editor should visualize inheritance (e.g. show the inherited color as a ghost value).
2. **Desktop/mobile split** exists only for header, page layout, and cards (`mobile_*` overrides). Everything else is responsive but single-value.
3. **Templates carry no colors.** All 13 card templates, 5 cart templates, 5 checkout templates render the same palette. Layout and color are fully decoupled.
4. **Four editor surfaces** (§0) with inconsistent UX — the overlay has tabs + live pieces, the settings page is a flat form with native color inputs and no live preview, product-detail is its own overlay. Unifying these is the biggest UX opportunity.
5. **No brand-color presets** anywhere except footer themes and hero templates. A preset/palette-generator system would be a strong redesign addition.
6. **Known gap:** the "Make it a Meal?" inline upgrade is unbranded/hardcoded (§7.3).
7. **Field count (approx.):** Global ~30 · Storefront/menu ~60 (incl. templates & toggles) · Cart 9+template · Checkout 9+template · Checkout modal 7+settings · Product detail ~97 · Footer ~35. **Total: ~250 editable settings.**
