// Database Types for Smart Restaurant Menu System
// Copied from web src/types/database.ts — keep in sync

export type BcgClassification = 'star' | 'plowhorse' | 'puzzle' | 'dog' | 'unclassified';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  accent_color?: string;
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
  hero_title?: string;
  hero_description?: string;
  hero_title_color?: string;
  hero_description_color?: string;
  card_template?: string;
  page_layout?: string;
  mobile_grid_columns?: number;
  messenger_page_id: string;
  messenger_username?: string;
  messenger_redirect_mode?: 'webhook' | 'direct';
  facebook_page_id?: string;
  is_active: boolean;
  mapbox_enabled: boolean;
  enable_order_management: boolean;
  lalamove_enabled?: boolean;
  lalamove_api_key?: string;
  lalamove_secret_key?: string;
  lalamove_market?: string;
  lalamove_service_type?: string;
  lalamove_sandbox?: boolean;
  restaurant_address?: string;
  restaurant_latitude?: number;
  restaurant_longitude?: number;
  announcement_text?: string;
  announcement_bg_color?: string;
  announcement_text_color?: string;
  is_announcement_visible?: boolean;
  promotion_image_url?: string;
  is_promotion_visible?: boolean;
  promotion_banners?: PromotionBanner[];
  checkout_modal_background_color?: string;
  checkout_modal_title_color?: string;
  checkout_modal_description_color?: string;
  checkout_modal_price_color?: string;
  checkout_modal_button_color?: string;
  checkout_modal_button_text_color?: string;
  checkout_modal_border_color?: string;
  menu_engineering_enabled?: boolean;
  hide_currency_symbol?: boolean;
  checkout_upsell_enabled?: boolean;
  checkout_upsell_title?: string;
  checkout_upsell_subtitle?: string;
  checkout_upsell_max_items?: number;
  convex_deployment_url?: string;
  convex_deploy_key?: string;
  ios_app_store_id?: string;
  android_package_name?: string;
  app_enabled?: boolean;
  operating_hours?: Record<string, { closed: boolean; open: string; close: string }> | null;
  timezone?: string | null;
  created_at: string;
  updated_at: string;
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
  order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Variation {
  id: string;
  name: string;
  price_modifier: number;
  is_default?: boolean;
}

export interface VariationOption {
  id: string;
  name: string;
  price_modifier: number;
  image_url?: string;
  is_default?: boolean;
  is_upgrade_target?: boolean;
  display_order: number;
}

export interface VariationType {
  id: string;
  name: string;
  is_required: boolean;
  display_order: number;
  options: VariationOption[];
}

export interface Addon {
  id: string;
  name: string;
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
  variation_types?: VariationType[];
  variations: Variation[];
  addons: Addon[];
  is_available: boolean;
  is_featured?: boolean;
  bcg_classification?: BcgClassification;
  badge_text?: string;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface CartItem {
  id: string;
  menu_item: MenuItem;
  selected_variations?: { [variationTypeId: string]: VariationOption };
  selected_variation?: Variation;
  selected_addons: Addon[];
  quantity: number;
  special_instructions?: string;
  subtotal: number;
}

export interface Cart {
  items: CartItem[];
  total: number;
  item_count: number;
}

export interface User {
  id: string;
  email: string;
  role: 'superadmin' | 'admin' | 'customer';
  tenant_id?: string;
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
  variations?: { [typeName: string]: string };
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
  // Advance order (scheduled / pre-order) configuration
  advance_order_enabled?: boolean;
  advance_order_allow_asap?: boolean;
  advance_order_lead_time_minutes?: number;
  advance_order_max_days_ahead?: number;
  advance_order_slot_interval_minutes?: number;
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
  total: number;
  /** Requested fulfillment time for advance/scheduled orders (UTC ISO); null/undefined = ASAP. */
  scheduled_for?: string | null;
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
  delivery_fee?: number;
  lalamove_quotation_id?: string;
  lalamove_order_id?: string;
  lalamove_status?: string;
  lalamove_driver_id?: string;
  lalamove_driver_name?: string;
  lalamove_driver_phone?: string;
  lalamove_tracking_url?: string;
  payment_method_id?: string;
  payment_method_name?: string;
  payment_method_details?: string;
  payment_method_qr_code_url?: string;
  payment_status?: 'pending' | 'paid' | 'failed' | 'verified';
  // Payment proof (screenshot and/or reference number captured at checkout)
  payment_proof_url?: string | null;
  payment_proof_public_id?: string | null;
  payment_proof_reference?: string | null;
  payment_proof_uploaded_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbOrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  menu_item_name: string;
  variation?: string | null;
  addons?: string[];
  quantity: number;
  price: number;
  subtotal: number;
  special_instructions?: string | null;
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
  created_at: string;
  updated_at: string;
}

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

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: Tenant;
        Insert: Omit<Tenant, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Tenant, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      categories: {
        Row: Category;
        Insert: Omit<Category, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Category, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      menu_items: {
        Row: MenuItem;
        Insert: Omit<MenuItem, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<MenuItem, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      order_types: {
        Row: OrderType;
        Insert: Omit<OrderType, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<OrderType, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      customer_form_fields: {
        Row: CustomerFormField;
        Insert: Omit<CustomerFormField, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<CustomerFormField, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      payment_methods: {
        Row: PaymentMethod;
        Insert: Omit<PaymentMethod, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<PaymentMethod, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      payment_method_order_types: {
        Row: PaymentMethodOrderType;
        Insert: Omit<PaymentMethodOrderType, 'id' | 'created_at'>;
        Update: Partial<Omit<PaymentMethodOrderType, 'id' | 'created_at'>>;
        Relationships: [];
      };
      orders: {
        Row: Order;
        Insert: Omit<Order, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Order, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      order_items: {
        Row: DbOrderItem;
        Insert: Omit<DbOrderItem, 'id'>;
        Update: Partial<Omit<DbOrderItem, 'id'>>;
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          id: string;
          tenant_id: string;
          device_token: string | null;
          expo_push_token: string | null;
          endpoint: string | null;
          p256dh: string | null;
          auth_key: string | null;
          platform: 'ios' | 'android' | 'web';
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          tenant_id: string;
          device_token?: string | null;
          expo_push_token?: string | null;
          endpoint?: string | null;
          p256dh?: string | null;
          auth_key?: string | null;
          platform: 'ios' | 'android' | 'web';
          is_active?: boolean;
        };
        Update: Partial<{
          device_token: string | null;
          expo_push_token: string | null;
          endpoint: string | null;
          p256dh: string | null;
          auth_key: string | null;
          is_active: boolean;
        }>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
