// Database Types for Smart Restaurant Menu System
// Re-export the auto-generated Database type used by Supabase client
import type { Database as SupabaseDatabase } from './supabase'
export type { Database } from './supabase'

export type BcgClassification = 'star' | 'plowhorse' | 'puzzle' | 'dog' | 'unclassified';

export interface Tenant {
  id: string;
  name: string;
  slug: string; // URL-safe identifier
  domain?: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  accent_color?: string;
  // Extended branding colors
  background_color?: string;

  // Custom page background (storefront + product detail); see src/lib/background-overlay.ts
  background_image_url?: string | null; // Image behind the page; null/blank = none
  background_image_opacity?: number | null; // 0-100 percent; null = 100
  background_image_fit?: string | null; // 'cover' | 'contain' | 'repeat'; null = cover
  background_image_position?: string | null; // 'center' | 'top' | 'bottom'; null = center
  background_image_attachment?: string | null; // 'scroll' | 'fixed'; null = scroll
  background_overlay_color?: string | null; // Hex tint over the image; null = #000000
  background_overlay_opacity?: number | null; // 0-100 percent; null/0 = no tint layer
  header_color?: string;
  header_font_color?: string;
  cards_color?: string;
  cards_border_color?: string;
  card_title_color?: string;
  card_price_color?: string;
  card_description_color?: string;
  modal_background_color?: string;
  modal_title_color?: string;
  modal_price_color?: string;
  modal_description_color?: string;
  button_primary_color?: string;
  button_primary_text_color?: string;
  button_secondary_color?: string;
  button_secondary_text_color?: string;
  text_primary_color?: string;
  text_secondary_color?: string;
  text_muted_color?: string;
  menu_main_header_text_color?: string;
  menu_main_header_subtitle_color?: string;
  menu_category_header_color?: string;
  menu_category_active_color?: string;
  menu_category_inactive_color?: string;
  menu_cart_badge_background_color?: string;
  menu_cart_badge_text_color?: string;
  border_color?: string;
  // Search bar branding
  search_bar_enabled?: boolean;
  search_bar_background?: string | null;
  search_bar_text?: string | null;
  search_bar_placeholder?: string | null;
  search_bar_icon?: string | null;
  search_bar_border?: string | null;
  search_bar_focus_ring?: string | null;
  search_bar_radius?: 'pill' | 'rounded' | 'square';
  search_bar_style?: 'filled' | 'outline' | 'ghost';
  success_color?: string;
  warning_color?: string;
  error_color?: string;
  link_color?: string;
  shadow_color?: string;
  // Menu hero customization
  hero_title?: string;
  hero_description?: string;
  hero_title_color?: string;
  hero_description_color?: string;
  hero_background_color?: string; // Hero section background (blank = page background)
  hero_kicker_color?: string; // Kicker/eyebrow color (blank = accent)
  hero_cta_primary_color?: string; // Primary hero button background (blank = accent)
  hero_cta_primary_text_color?: string; // Primary hero button text (blank = button primary text)
  hero_cta_secondary_text_color?: string; // Secondary hero button text (blank = hero title color)
  hero_kicker?: string; // Uppercase eyebrow above the hero title (rich presets)
  hero_cta_primary_label?: string; // Primary hero button label (rich presets)
  hero_cta_secondary_label?: string; // Secondary hero button label (rich presets)
  hero_featured_product_id?: string | null; // Menu item featured in the hero product card
  hero_image_url?: string | null; // Fallback hero tile image when no product is attached
  hero_link_url?: string | null; // Where the fallback hero image links to when clicked
  hero_design?: Record<string, unknown> | null;  // HeroDesign JSON from hero designer
  card_template?: string; // 'classic' | 'minimal' | 'modern' | 'elegant' | 'compact' | 'bold' | 'glass' | 'polaroid' | 'brutalist' | 'magazine' | 'zen' | 'neon' | 'storefront'
  checkout_template?: string; // Checkout page design: 'classic' | 'modern' | 'wizard' | 'minimal' | 'express'
  cart_template?: string; // Cart page design: 'classic' | 'modern' | 'wizard' | 'minimal' | 'express'
  page_layout?: string; // 'default' | 'sidebar' | 'magazine' | 'grid-focus' | 'list' | 'mosaic'
  mobile_grid_columns?: number; // 1 or 2 - number of cards per row on mobile
  mobile_page_layout?: string | null; // Layout for mobile (<768px), falls back to page_layout
  mobile_card_template?: string | null; // Card template for mobile (<768px), falls back to card_template
  mobile_overrides?: Record<string, unknown>; // Per-device overrides { column: value } overlaid on mobile viewports

  // Storefront theme knobs (design-system presets; 'theme' = inherit tenant default)
  font_pair?: string; // 'theme' | 'elegant serif' | 'bold display' | 'modern sans' | 'warm editorial'
  card_roundness?: string; // 'theme' | 'sharp' | 'soft' | 'round'
  brand_color?: string; // Accent/brand color; overrides accent_color across the storefront when set
  storefront_palette?: string; // Coordinated palette preset: theme | warm editorial | fine dining | cafe soft | bold diner | fresh green
  category_nav_style?: string; // Category nav presentation: theme | pills | chips | underline
  hero_preset?: string; // Hero layout preset: theme | centered | editorial | split | banner | collage | minimal
  // Main header template & customization
  header_template?: string; // 'classic' | 'centered' | 'minimal' | 'split' | 'banner' | 'stacked'
  mobile_header_template?: string | null; // Header template for mobile (<768px), falls back to header_template
  header_show_logo?: boolean;
  header_show_name?: boolean;
  header_show_cart?: boolean;
  header_show_search?: boolean; // Show an inline search bar in the header
  header_tagline?: string; // Optional tagline shown under the restaurant name
  header_tagline_color?: string;
  header_sticky?: boolean; // Stick the header to the top on scroll
  header_blur?: boolean; // Apply a backdrop blur to the header
  header_shadow?: boolean; // Apply a drop shadow under the header
  header_logo_shape?: 'circle' | 'rounded' | 'square';
  header_height?: 'compact' | 'standard' | 'tall';
  messenger_page_id: string;
  messenger_username?: string;
  messenger_redirect_mode?: 'webhook' | 'direct'; // 'webhook' = m.me with ref+text, 'direct' = messenger.com/t/
  messenger_redirect_enabled?: boolean; // Auto-open Messenger after checkout. Undefined/null = on (backward compatible)
  facebook_page_id?: string; // Reference to facebook_pages table
  is_active: boolean;
  mapbox_enabled: boolean;
  enable_order_management: boolean;
  // Lalamove delivery configuration
  lalamove_enabled?: boolean;
  lalamove_api_key?: string;
  lalamove_secret_key?: string;
  lalamove_market?: string;
  lalamove_service_type?: string;
  lalamove_sandbox?: boolean;
  // Store pickup contact the driver calls; falls back to footer_phone when null
  lalamove_sender_phone?: string;
  // Restaurant address for delivery pickup
  restaurant_address?: string;
  restaurant_latitude?: number;
  restaurant_longitude?: number;
  // Distance-based delivery fee (non-Lalamove path; Lalamove takes precedence when enabled)
  distance_delivery_enabled?: boolean;
  delivery_price_per_km?: number | null;
  delivery_min_fee?: number | null;
  delivery_radius_km?: number | null;
  // Banners
  announcement_text?: string;
  announcement_bg_color?: string;
  announcement_text_color?: string;
  is_announcement_visible?: boolean;
  promotion_image_url?: string;
  is_promotion_visible?: boolean;
  promotion_banners?: PromotionBanner[];
  // Checkout interstitial modal branding
  checkout_modal_background_color?: string;
  checkout_modal_title_color?: string;
  checkout_modal_description_color?: string;
  checkout_modal_price_color?: string;
  checkout_modal_button_color?: string;
  checkout_modal_button_text_color?: string;
  checkout_modal_border_color?: string;
  // Cart page palette (distinct from the checkout interstitial modal above).
  // Unset = inherit the design default / global brand colors.
  cart_background_color?: string;
  cart_card_background_color?: string;
  cart_text_color?: string;
  cart_muted_text_color?: string;
  cart_accent_color?: string;
  cart_button_color?: string;
  cart_button_text_color?: string;
  cart_border_color?: string;
  cart_summary_background_color?: string;
  // Checkout page palette (the page itself, not the interstitial modal).
  checkout_background_color?: string;
  checkout_card_background_color?: string;
  checkout_text_color?: string;
  checkout_muted_text_color?: string;
  checkout_accent_color?: string;
  checkout_button_color?: string;
  checkout_button_text_color?: string;
  checkout_border_color?: string;
  checkout_summary_background_color?: string;
  // Menu engineering
  menu_engineering_enabled?: boolean;
  // Unified modifier groups editor (variations + add-ons + per-option cost/stock)
  modifier_groups_enabled?: boolean;
  // Inventory & costing (ingredients, units, recipes)
  inventory_enabled?: boolean;
  hide_currency_symbol?: boolean;
  checkout_upsell_enabled?: boolean;
  checkout_upsell_title?: string;
  checkout_upsell_subtitle?: string;
  checkout_upsell_max_items?: number;
  // Bundles
  bundles_enabled?: boolean;
  // Inventory alerts (migration 20260728120000)
  low_stock_alerts_enabled?: boolean;
  auto_86_enabled?: boolean;
  // Pairing rules
  pairing_rules_enabled?: boolean;
  // QR-handoff ordering
  qr_handoff_enabled?: boolean;
  // Multi-branch (multi-outlet) storefront. Missing/null = off; see
  // src/lib/outlets/multi-branch-flag.ts (single source of truth).
  multi_branch_enabled?: boolean;
  // When the customer picks a branch: 'before' the menu (splash chooser) or
  // 'after' (at checkout). Missing/null/unknown = 'before'; see
  // src/lib/outlets/selection-timing.ts (single source of truth).
  outlet_selection_timing?: string | null;
  // Hero section
  hero_section_enabled?: boolean;
  // Flash screen
  flash_screen_feature_enabled?: boolean;
  flash_screen_is_active?: boolean;
  flash_screen_title?: string;
  flash_screen_subtitle?: string;
  flash_screen_image_url?: string;
  flash_screen_background_color?: string;
  flash_screen_text_color?: string;
  flash_screen_duration_ms?: number;
  // Footer maker
  footer_enabled?: boolean;
  footer_theme?: 'auto' | 'light' | 'dark' | 'brand' | 'midnight' | 'minimal' | 'custom';
  footer_logo_url?: string;
  footer_business_name?: string;
  footer_tagline?: string;
  footer_address?: string;
  footer_phone?: string;
  footer_whatsapp?: string;
  footer_viber?: string;
  footer_email?: string;
  footer_facebook_url?: string;
  footer_instagram_url?: string;
  footer_tiktok_url?: string;
  footer_twitter_url?: string;
  footer_youtube_url?: string;
  footer_about_us?: string;
  footer_terms_of_service?: string;
  footer_refund_policy?: string;
  footer_privacy_policy?: string;
  footer_copyright_text?: string;
  footer_show_powered_by?: boolean;
  footer_powered_by_text?: string;
  footer_background_color?: string;
  footer_text_color?: string;
  footer_heading_color?: string;
  footer_link_color?: string;
  footer_muted_color?: string;
  footer_icon_color?: string;
  footer_icon_background_color?: string;
  footer_border_color?: string;
  // Convex integration
  convex_deployment_url?: string | null;
  convex_deploy_key?: string | null;
  convex_schema_version?: number;
  // Order backend selection — see src/lib/order-backend.ts (single source of truth).
  // 'convex' = own Convex deployment | 'supabase' = own separate Supabase project | 'platform' = shared platform Supabase (legacy default).
  // 'auto' is the default: derive from the credentials (Convex when a
  // deployment URL is set, otherwise the shared platform database).
  order_backend?: "auto" | "convex" | "supabase" | "platform";
  // Per-tenant Supabase order-project credentials (only when order_backend = 'supabase').
  supabase_order_url?: string | null;
  supabase_order_anon_key?: string | null;
  supabase_order_service_key?: string | null;
  supabase_order_db_url?: string | null;
  supabase_order_schema_version?: number;
  // Subscription allowances. Absent/null means the platform default, never
  // "unlimited" and never "none" — see resolveStaffLimit / resolveOutletLimit
  // in src/lib/billing/subscription-status.ts.
  max_outlets?: number | null;
  max_staff_per_branch?: number | null;
  // Mobile app
  app_enabled?: boolean;
  ios_app_store_id?: string | null;
  android_package_name?: string | null;
  // Email notifications
  admin_email?: string | null;
  email_notifications_enabled?: boolean;
  // Operating hours (per-weekday open/close + closed days), keyed "0"=Sun.."6"=Sat.
  // Drives advance-order slot windows. null = unset (advance scheduler uses default 08:00–22:00).
  operating_hours?: Record<string, { closed: boolean; open: string; close: string }> | null;
  timezone?: string | null;
  // Opt-in: show a closed notice and refuse new orders outside operating_hours.
  // false (default) = hours only constrain advance-order slots. See src/lib/store-open-status.ts.
  enforce_operating_hours?: boolean | null;
  created_at: string;
  updated_at: string;
  // Index signature for compatibility with getTenantBranding(Record<string, unknown>)
  [key: string]: unknown;
}

export interface PromotionBanner {
  id: string;
  imageUrl: string;
  title?: string;
  description?: string;
}

export interface Category {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  icon?: string;
  icon_color?: string;
  order: number;
  is_active: boolean;
  display_layout: 'grid' | 'horizontal_scroll' | 'horizontal_mobile_only' | 'horizontal_desktop_only';
  default_addons?: Addon[];
  created_at: string;
  updated_at: string;
}

// Legacy variation structure (kept for backward compatibility)
export interface Variation {
  id: string;
  name: string; // "Small", "Medium", "Large"
  price_modifier: number; // +0, +2, +5
  is_default?: boolean;
}

// New grouped variation structure
export interface VariationOption {
  id: string;
  name: string; // "Small", "Medium", "Large"
  price_modifier: number; // +0, +2, +5
  image_url?: string; // Optional image for this specific option
  is_default?: boolean;
  is_upgrade_target?: boolean; // Show "Upgrade for +X" nudge on customer side
  display_order: number;
}

export interface VariationType {
  id: string;
  name: string; // "Size", "Spice Level", "Protein Type"
  is_required: boolean; // Must customer select from this group?
  display_order: number;
  options: VariationOption[];
}

export interface Addon {
  id: string;
  name: string; // "Extra Cheese", "No Onions"
  price: number;
  is_default?: boolean;
}

// Reusable per-tenant add-on definition. Attaching one to a menu item copies a
// {id, name, price} Addon snapshot into MenuItem.addons (snapshot-on-attach).
export interface AddonLibraryEntry {
  id: string;
  tenant_id: string;
  name: string;
  price: number;
  // When set, this entry was prefilled from an existing menu item.
  source_menu_item_id?: string | null;
  image_url?: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// Reusable modifier-group library entry. Stores a whole group definition (name +
// selection rules + option list) once; attaching copies a fresh-id snapshot into
// menu_items.modifier_groups (snapshot-on-attach, like AddonLibraryEntry).
export interface ModifierGroupLibraryEntry {
  id: string;
  tenant_id: string;
  name: string;
  min_select: number;
  max_select: number | null;
  options: ModifierOption[];
  // When set, this entry was prefilled from an existing menu item's group.
  source_menu_item_id?: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// ============================================
// Inventory system (Phase A: costing foundation)
// ============================================

export type InventoryUnitDimension = 'weight' | 'volume' | 'count';

// Per-tenant unit of measure. to_base_factor = base units per one of this unit.
export interface InventoryUnitRow {
  id: string;
  tenant_id: string;
  name: string;
  abbreviation: string;
  dimension: InventoryUnitDimension;
  to_base_factor: number;
  is_base: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Ingredient / raw material. Prep items (is_prep) derive cost from a prep recipe.
export interface InventoryItem {
  id: string;
  tenant_id: string;
  name: string;
  sku?: string | null;
  category?: string | null;
  stock_unit_id: string;
  unit_cost: number;
  is_prep: boolean;
  image_url?: string | null;
  current_qty: number; // Phase B
  reorder_level: number; // Phase B
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Append-only stock ledger. `quantity_delta` is signed and already expressed in
// the item's stock unit; `balance_after` is the running total the trigger wrote.
export interface StockMovement {
  id: string;
  tenant_id: string;
  inventory_item_id: string;
  reason: 'receive' | 'stocktake' | 'waste' | 'sale' | 'void';
  quantity_delta: number;
  entered_quantity?: number | null;
  entered_unit_id?: string | null;
  balance_after: number;
  unit_cost?: number | null;
  note?: string | null;
  order_id?: string | null;
  created_by?: string | null;
  created_at: string;
}

export type RecipeTargetType =
  | 'menu_item'
  | 'variation_option'
  | 'addon'
  | 'modifier_option'
  | 'prep_item';

// Bill of materials for one costable target.
export interface Recipe {
  id: string;
  tenant_id: string;
  target_type: RecipeTargetType;
  menu_item_id?: string | null;
  variation_option_id?: string | null;
  addon_id?: string | null;
  // Stable JSON id of a unified ModifierOption (target_type === 'modifier_option').
  modifier_option_id?: string | null;
  prep_item_id?: string | null;
  yield_quantity?: number | null;
  yield_unit_id?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecipeComponent {
  id: string;
  tenant_id: string;
  recipe_id: string;
  inventory_item_id: string;
  quantity: number;
  unit_id: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ============================================
// Unified Modifier Groups
// ============================================
// One model that supersedes both grouped `variation_types` and flat `addons`.
// A group carries selection rules (min/max), each option carries a price
// modifier plus optional per-option cost and stock. Legacy columns are kept and
// normalized into this shape on read (see src/lib/modifier-groups.ts), so this
// is purely additive and backward compatible.

// How an option's remaining stock is tracked.
//   'none'   → not tracked (always available)
//   'simple' → a per-option unit count (`stock_qty`), decremented per sale
//   'recipe' → derived from an attached inventory recipe (deducts ingredients)
export type ModifierStockMode = 'none' | 'simple' | 'recipe';

// How a costable target's cost is determined.
//   'simple'    → a manual number typed by the merchant
//   'composite' → rolled up from an attached inventory recipe
// Absent = legacy (recipe cost overrides the manual cost).
export type CostMode = 'simple' | 'composite';

export interface ModifierOption {
  id: string;
  name: string; // "Large", "Extra Cheese", "Hot"
  price_modifier: number; // +0, +2, +5 (added to base price)
  image_url?: string;
  is_default?: boolean;
  // Mirrors VariationOption.is_upgrade_target. Carried through the
  // legacy <-> modifier-groups round-trip so enabling the unified editor does
  // not silently drop the "Upgrade for +X" nudge on an existing item.
  is_upgrade_target?: boolean;
  // Live reference to a menu item offered as this option (e.g. "Add a Coke").
  // When set, the name, price and image are read from that item at render time
  // rather than from the fields above. See src/lib/modifier-linked-options.ts.
  menu_item_id?: string | null;
  display_order: number;
  // Cost / margin. `cost_mode` decides which cost is authoritative:
  //   'simple'    → manual_cost
  //   'composite' → the attached recipe (recipes table, keyed by this id)
  // Absent on options saved before cost modes existed, which keep the legacy
  // rule (recipe overrides manual_cost). See src/lib/inventory/cost-mode.ts.
  cost_mode?: CostMode;
  manual_cost?: number;
  // Stock
  stock_mode?: ModifierStockMode; // defaults to 'none'
  stock_qty?: number; // remaining units when stock_mode === 'simple'
  // Explicit merchant availability toggle (false hides the option regardless of stock).
  is_available?: boolean;
}

export interface ModifierGroup {
  id: string;
  name: string; // "Size", "Add-ons", "Spice Level"
  display_order: number;
  // Selection rules. min_select === 0 → optional; max_select === 1 → single-select
  // (variation-style); max_select === null → unlimited (add-on style).
  min_select: number;
  max_select: number | null;
  options: ModifierOption[];
}

export interface MenuItem {
  id: string;
  tenant_id: string;
  category_id: string;
  name: string;
  description: string;
  price: number;
  discounted_price?: number;
  image_url: string;
  // Unified modifier groups (supersedes variation_types + addons). When present,
  // this is the source of truth; otherwise it is derived from the legacy fields.
  modifier_groups?: ModifierGroup[];
  // New grouped variation system (legacy once modifier_groups is adopted)
  variation_types?: VariationType[];
  // Legacy flat variation system (kept for backward compatibility)
  variations: Variation[];
  addons: Addon[];
  is_available: boolean;
  /** Set when auto-86 hid this item; NULL means availability is the merchant's own choice. */
  auto_disabled_at?: string | null;
  is_featured?: boolean;
  bcg_classification?: BcgClassification;
  badge_text?: string;
  show_in_checkout_upsell?: boolean;
  boost_priority?: number;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface MenuItemWithCategory extends MenuItem {
  category: { id: string; name: string } | null;
}

export interface CartItem {
  id: string; // Unique ID for cart item
  menu_item: MenuItem;
  // New grouped variation selections: Map of variation type ID -> selected option
  selected_variations?: { [variationTypeId: string]: VariationOption };
  // Legacy single variation (kept for backward compatibility)
  selected_variation?: Variation;
  selected_addons: Addon[];
  quantity: number;
  special_instructions?: string;
  subtotal: number;
  // Upsell attribution: tracks which upsell modal added this item
  upsellSource?: 'checkout_modal' | 'suggestion' | 'upgrade' | 'bundle';
  upsellSourceItemId?: string;
}

export interface Bundle {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  image_url: string;
  pricing_type: 'fixed' | 'discount';
  fixed_price?: number;
  discount_percent?: number;
  is_active: boolean;
  show_on_menu: boolean;
  show_as_upsell: boolean;
  display_order: number;
  items?: BundleItem[];
  created_at: string;
  updated_at: string;
}

export interface BundleSlot {
  id: string;
  bundle_id: string;
  name: string;
  category_id: string;
  pick_count: number;
  sort_order: number;
  included_item_ids?: string[] | null;
  created_at: string;
  category?: Category;
  items?: MenuItem[];
  price_overrides?: BundleSlotPriceOverride[];
}

export interface BundleSlotPriceOverride {
  id: string;
  slot_id: string;
  menu_item_id: string;
  price_override: number;
  created_at: string;
}

export type BundleWithSlots = Bundle & {
  slots: BundleSlot[];
};

/** @deprecated Use BundleWithSlots instead */
export type BundleWithItems = BundleWithSlots;

export interface BundleItem {
  id: string;
  bundle_id: string;
  menu_item_id: string;
  quantity: number;
  display_order: number;
  menu_item?: MenuItem;
}

export interface CartBundleSlotSelection {
  slotId: string;
  slotName: string;
  menuItemId: string;
  menuItemName: string;
  menuItemImage: string | null;
  menuItemPrice: number;
  quantity: number;
  selectedVariations?: { [variationTypeId: string]: VariationOption };
  selectedVariation?: Variation;
  selectedAddons: Addon[];
  priceOverride: number;
}

export interface CartBundleItem {
  id: string;
  bundleId: string;
  bundleName: string;
  bundleImageUrl?: string;
  slots: CartBundleSlotSelection[];
  quantity: number;
  pricingType: 'fixed' | 'discount';
  basePrice: number;
  discountPercent?: number;
  subtotal: number;
}

export interface Cart {
  items: CartItem[];
  bundle_items?: CartBundleItem[];
  total: number;
  item_count: number;
}

export interface User {
  id: string;
  email: string;
  role: 'superadmin' | 'admin' | 'customer';
  tenant_id?: string; // Only for admin users
  full_name?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface AppUser {
  user_id: string;
  role: 'superadmin' | 'admin';
  tenant_id: string | null;
  /** Tenant owner — full access, manages staff. Backfilled for pre-staff admins. */
  is_owner?: boolean;
  /** Per-feature permission keys; null = full access (owners, legacy admins). */
  permissions?: string[] | null;
  display_name?: string | null;
  /** Denormalized login email so staff lists render without reading auth.users. */
  email?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  menu_item_id: string;
  menu_item_name: string;
  // New: Store multiple variations as a map { "Size": "Large", "Spice": "Hot" }
  variations?: { [typeName: string]: string };
  // Legacy: Single variation string (kept for backward compatibility)
  variation?: string;
  addons: string[];
  quantity: number;
  price: number;
  subtotal: number;
  special_instructions?: string;
}

export interface OrderType {
  id: string;
  tenant_id: string;
  type: 'dine_in' | 'pickup' | 'delivery';
  name: string;
  description?: string;
  note?: string;
  is_enabled: boolean;
  /** When false, checkout for this order type skips Messenger and shows "Complete Order". */
  messenger_enabled: boolean;
  service_charge_enabled: boolean;
  service_charge_type: "percentage" | "fixed";
  service_charge_value: number;
  /** Minimum cart subtotal required to check out with this order type. 0 means no minimum. */
  minimum_order_amount: number;
  // Advance order (scheduled / pre-order) configuration
  advance_order_enabled: boolean;
  advance_order_allow_asap: boolean;
  advance_order_lead_time_minutes: number;
  advance_order_max_days_ahead: number;
  advance_order_slot_interval_minutes: number;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface CustomerFormField {
  id: string;
  tenant_id: string;
  order_type_id: string;
  field_name: string;
  field_label: string;
  field_type: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'number';
  is_required: boolean;
  placeholder?: string;
  validation_rules?: Record<string, unknown>;
  options?: string[];
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface PaymentMethod {
  id: string;
  tenant_id: string;
  name: string;
  details?: string;
  qr_code_url?: string;
  is_active: boolean;
  order_index: number;
  /** When true, checkout blocks until the customer provides a screenshot or reference number. */
  require_payment_proof?: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaymentMethodOrderType {
  id: string;
  payment_method_id: string;
  order_type_id: string;
  created_at: string;
}

export interface FacebookPage {
  id: string;
  tenant_id: string;
  page_id: string;
  page_name: string;
  page_access_token: string;
  user_access_token?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  tenant_id: string;
  order_type_id?: string;
  order_type?: string;
  customer_name?: string;
  customer_contact?: string;
  customer_data?: Record<string, unknown>;
  items: OrderItem[];
  total: number;
  /** Requested fulfillment time for advance/scheduled orders (UTC ISO); null/undefined = ASAP. */
  scheduled_for?: string | null;
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
  // Lalamove delivery fields
  delivery_fee?: number;
  lalamove_quotation_id?: string;
  lalamove_order_id?: string;
  lalamove_status?: string;
  lalamove_driver_id?: string;
  lalamove_driver_name?: string;
  lalamove_driver_phone?: string;
  lalamove_tracking_url?: string;
  // Payment fields
  payment_method_id?: string;
  payment_method_name?: string;
  payment_method_details?: string;
  payment_method_qr_code_url?: string;
  service_charge_amount?: number;
  payment_status?: 'pending' | 'paid' | 'failed' | 'verified';
  // Payment proof (screenshot and/or reference number captured at checkout)
  payment_proof_url?: string | null;
  payment_proof_public_id?: string | null;
  payment_proof_reference?: string | null;
  payment_proof_uploaded_at?: string | null;
  /** Link to the derived customer profile this order rolled up into (nullable). */
  customer_id?: string | null;
  /**
   * Which branch fulfills this order. Null for every order placed by a
   * single-location tenant — i.e. all existing orders — so every query that
   * predates multi-branch keeps working untouched.
   */
  outlet_id?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Per-weekday opening hours, keyed "0" = Sunday .. "6" = Saturday.
 * Same shape as `Tenant.operating_hours` so `src/lib/store-open-status.ts`
 * evaluates a branch and a single-location tenant with the same code.
 */
export type OutletOperatingHours = Record<
  string,
  { closed: boolean; open: string; close: string }
>;

/**
 * A physical branch of a multi-branch tenant.
 *
 * Only meaningful when `Tenant.multi_branch_enabled` is true. In Phase 1 all
 * branches of a tenant share one menu, one price list, and one stock pool;
 * `outlets` deliberately carries no menu columns so per-branch menus can be
 * added later as a separate table rather than a migration of this one.
 */
export interface Outlet {
  id: string;
  tenant_id: string;
  name: string;
  /** URL-safe, unique per tenant. Powers `?outlet=` and `/b/{slug}`. */
  slug: string;
  address: string | null;
  /** Storefront photo for the branch chooser card. Null renders a placeholder. */
  image_url: string | null;
  /** Required for nearest-branch detection; both set or both null. */
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  operating_hours: OutletOperatingHours | null;
  timezone: string | null;
  supports_pickup: boolean;
  supports_delivery: boolean;
  /** Branch seats customers. Independent of pickup/delivery. */
  supports_dine_in: boolean;
  /** Null/zero = unrestricted. Used for branch matching, not fee pricing. */
  delivery_radius_km: number | null;
  /** Soft on/off: deactivated branches keep their orders and their link. */
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * One branch's opinion about one menu item.
 *
 * Override-only: a row exists solely because a branch differs from the
 * store-wide menu. NO ROW means listed, available, and priced exactly as
 * `menu_items` says — the behaviour every branch had before per-branch menus
 * existed. Resolution is in `src/lib/outlets/outlet-menu-overrides.ts`; nothing
 * should read these fields directly.
 *
 * Mirrors `outlet_menu_items` from `20260806120000_outlet_menu_overrides.sql`.
 */
export interface OutletMenuOverride {
  id: string;
  tenant_id: string;
  outlet_id: string;
  menu_item_id: string;
  /** false = this branch does not carry the dish at all. */
  is_listed: boolean;
  /** false = listed but currently unorderable here (86'd at this branch). */
  is_available: boolean;
  /** Null = inherit `menu_items.price`. Zero is a real free item, not "unset". */
  price: number | null;
  /** Null = inherit `menu_items.discounted_price` — see `discount_cleared`. */
  discounted_price: number | null;
  /** true = this branch opts OUT of the store-wide discount and sells at full price. */
  discount_cleared: boolean;
  created_at: string;
  updated_at: string;
}

/** A single most-ordered item in a customer's derived profile. */
export interface CustomerTopItem {
  name: string;
  quantity: number;
}

/**
 * Per-tenant customer profile derived from order history. Identity key is the
 * normalized E.164 phone (email is the fallback). This is derived data, not an
 * auth account — there is no password or login. Mirrors the `customers` table
 * from migration `20260706120000_customer_identity.sql`.
 */
export interface Customer {
  id: string;
  tenant_id: string;
  /** Normalized E.164 identity key; null only for email-only fallback identities. */
  phone_e164: string | null;
  email: string | null;
  name: string | null;
  first_order_at: string | null;
  last_order_at: string | null;
  order_count: number;
  total_spent: number;
  /** Generated column: round(total_spent / order_count, 2), or 0 when no orders. */
  average_order_value: number;
  /** Distinct channels used: dine_in / pickup / delivery. */
  channels_used: string[];
  top_items: CustomerTopItem[];
  sms_consent: boolean;
  sms_consent_at: string | null;
  /**
   * How the profile came to exist. Before `20260819120000` the derived path was
   * the only writer, so every historic row is `'order'`. Needed because a
   * hand-entered guest who has not ordered yet and a derived row whose rollup
   * failed both have `order_count = 0`.
   */
  created_source: 'order' | 'manual' | 'import';
  /** Merchant-authored notes (allergies, preferences). Never derived. */
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsellPair {
  id: string;
  tenant_id: string;
  source_item_id: string;
  target_item_id: string;
  pair_type: 'complementary' | 'upgrade';
  display_order: number;
  is_active: boolean;
  source_label: string | null;
  target_label: string | null;
  upgrade_header: string | null;
  is_auto_generated: boolean;
  bcg_strategy: string | null;
  upgrade_display_style: 'inline' | 'modal';
  max_suggestions: number;
  created_at: string;
  updated_at: string;
}

/** Upgrade upsell with target item and customizable labels */
export interface UpgradeUpsell {
  targetItem: MenuItem;
  sourceLabel: string | null;
  targetLabel: string | null;
  upgradeHeader: string | null;
}

export interface UpsellPairWithItems extends UpsellPair {
  source_item: MenuItem;
  target_item: MenuItem;
}

// Complementary Pairs (Phase 2 — "Perfect With")
export interface ComplementaryPair {
  id: string
  tenant_id: string
  source_type: 'item' | 'category'
  source_item_id: string | null
  source_category_id: string | null
  target_item_id: string
  display_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ComplementaryPairWithTarget extends ComplementaryPair {
  target_item: MenuItem
}

export interface ComplementaryPairWithDetails extends ComplementaryPair {
  target_item: MenuItem
  source_item?: MenuItem
  source_category?: Category
}

// Note: Database type is now auto-generated in ./supabase.ts and re-exported above.
// Convenience type aliases above are kept for backward compatibility throughout the codebase.

// Lead Management (platform-level, no tenant_id)
export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  booking_date: string;
  booking_time: string;
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';
  source: string;
  converted_tenant_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadStatusHistory {
  id: string;
  lead_id: string;
  old_status: string | null;
  new_status: string;
  changed_by: string | null;
  note: string | null;
  created_at: string;
}

export interface LeadNote {
  id: string;
  lead_id: string;
  note: string;
  created_by: string | null;
  created_at: string;
}

// ============================================================
// Pairing Rules Types
// ============================================================

export interface TagDefinition {
  id: string;
  tenant_id: string | null;
  group_name: string;
  tag_value: string;
  is_preset: boolean;
  created_at: string;
}

export interface MenuItemTag {
  menu_item_id: string;
  tag_definition_id: string;
  tenant_id: string;
}

export interface PairingRule {
  id: string;
  tenant_id: string | null;
  name: string;
  source_type: 'category' | 'tag';
  source_category_id: string | null;
  source_tag_id: string | null;
  max_suggestions: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PairingRuleTarget {
  id: string;
  rule_id: string;
  target_type: 'category' | 'tag';
  target_category_id: string | null;
  target_tag_id: string | null;
  selection_mode: 'handpick' | 'any';
  display_order: number;
}

export interface PairingRuleTargetItem {
  target_id: string;
  menu_item_id: string;
  display_order: number;
}

export interface PairingRuleWithDetails extends PairingRule {
  source_category?: Category;
  source_tag?: TagDefinition;
  targets: PairingRuleTargetWithDetails[];
}

export interface PairingRuleTargetWithDetails extends PairingRuleTarget {
  target_category?: Category;
  target_tag?: TagDefinition;
  items: MenuItem[];
}

// Checkout Leads (platform-level, not tenant-scoped)
export type CheckoutLeadStatus = 'initiated' | 'paid' | 'setup_in_progress' | 'live' | 'cancelled'

export interface CheckoutLead {
  id: string
  reference_number: string
  name: string
  email: string
  phone: string
  business_name: string
  notes: string | null
  payment_term: SupabaseDatabase['public']['Tables']['checkout_leads']['Row']['payment_term']
  selected_payment_method_id: string | null
  status: CheckoutLeadStatus
  payment_proof_url: string | null
  payment_proof_uploaded_at: string | null
  amount: number
  created_at: string
  updated_at: string
}

export interface CheckoutLeadWithPaymentMethod extends CheckoutLead {
  platform_payment_methods: PlatformPaymentMethod | null
}

export interface CheckoutLeadStatusHistory {
  id: string
  checkout_lead_id: string
  old_status: string | null
  new_status: string
  changed_by: string | null
  note: string | null
  created_at: string
}

export interface PlatformPaymentMethod {
  id: string
  name: string
  type: 'qr_code' | 'bank_transfer' | 'other'
  details: string | null
  qr_code_url: string | null
  is_active: boolean
  order_index: number
  created_at: string
  updated_at: string
}
