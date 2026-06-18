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
  hero_design?: Record<string, unknown> | null;  // HeroDesign JSON from hero designer
  card_template?: string; // 'classic' | 'minimal' | 'modern' | 'elegant' | 'compact' | 'bold' | 'glass' | 'polaroid' | 'brutalist' | 'magazine' | 'zen' | 'neon' | 'storefront'
  checkout_template?: string; // Checkout page design: 'classic' | 'modern' | 'wizard' | 'minimal' | 'express'
  cart_template?: string; // Cart page design: 'classic' | 'modern' | 'wizard' | 'minimal' | 'express'
  page_layout?: string; // 'default' | 'sidebar' | 'magazine' | 'grid-focus' | 'list' | 'mosaic'
  mobile_grid_columns?: number; // 1 or 2 - number of cards per row on mobile
  mobile_page_layout?: string | null; // Layout for mobile (<768px), falls back to page_layout
  mobile_card_template?: string | null; // Card template for mobile (<768px), falls back to card_template
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
  hide_currency_symbol?: boolean;
  checkout_upsell_enabled?: boolean;
  checkout_upsell_title?: string;
  checkout_upsell_subtitle?: string;
  checkout_upsell_max_items?: number;
  // Bundles
  bundles_enabled?: boolean;
  // Pairing rules
  pairing_rules_enabled?: boolean;
  // QR-handoff ordering
  qr_handoff_enabled?: boolean;
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

export interface MenuItem {
  id: string;
  tenant_id: string;
  category_id: string;
  name: string;
  description: string;
  price: number;
  discounted_price?: number;
  image_url: string;
  // New grouped variation system
  variation_types?: VariationType[];
  // Legacy flat variation system (kept for backward compatibility)
  variations: Variation[];
  addons: Addon[];
  is_available: boolean;
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
  service_charge_enabled: boolean;
  service_charge_type: "percentage" | "fixed";
  service_charge_value: number;
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
