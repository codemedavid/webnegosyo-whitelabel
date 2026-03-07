// Database Types for Smart Restaurant Menu System
// Re-export the auto-generated Database type used by Supabase client
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
  card_template?: string; // 'classic' | 'minimal' | 'modern' | 'elegant' | 'compact' | 'bold' | 'glass' | 'polaroid' | 'brutalist' | 'magazine' | 'zen' | 'neon' | 'storefront'
  page_layout?: string; // 'default' | 'sidebar' | 'magazine' | 'grid-focus' | 'list' | 'mosaic'
  mobile_grid_columns?: number; // 1 or 2 - number of cards per row on mobile
  mobile_page_layout?: string | null; // Layout for mobile (<768px), falls back to page_layout
  mobile_card_template?: string | null; // Card template for mobile (<768px), falls back to card_template
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
  // Restaurant address for delivery pickup
  restaurant_address?: string;
  restaurant_latitude?: number;
  restaurant_longitude?: number;
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
  // Menu engineering
  menu_engineering_enabled?: boolean;
  hide_currency_symbol?: boolean;
  checkout_upsell_enabled?: boolean;
  checkout_upsell_title?: string;
  checkout_upsell_subtitle?: string;
  checkout_upsell_max_items?: number;
  // Bundles
  bundles_enabled?: boolean;
  // Flash screen
  flash_screen_feature_enabled?: boolean;
  flash_screen_is_active?: boolean;
  flash_screen_title?: string;
  flash_screen_subtitle?: string;
  flash_screen_image_url?: string;
  flash_screen_background_color?: string;
  flash_screen_text_color?: string;
  flash_screen_duration_ms?: number;
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
  order: number;
  created_at: string;
  updated_at: string;
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

export interface BundleItem {
  id: string;
  bundle_id: string;
  menu_item_id: string;
  quantity: number;
  display_order: number;
  menu_item?: MenuItem;
}

export interface BundleItemCustomization {
  menu_item: MenuItem;
  selected_variations?: { [variationTypeId: string]: VariationOption };
  selected_variation?: Variation;
  selected_addons: Addon[];
  quantity: number;
}

export interface CartBundleItem {
  id: string;
  bundle: Bundle;
  customizations: BundleItemCustomization[];
  quantity: number;
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
  payment_status?: 'pending' | 'paid' | 'failed' | 'verified';
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
