// Database Types for Smart Restaurant Menu System

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
  // Card template selection
  card_template?: string; // 'classic' | 'minimal' | 'modern' | 'elegant' | 'compact' | 'bold'
  messenger_page_id: string;
  messenger_username?: string;
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
  created_at: string;
  updated_at: string;
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

// Database schema definition (for Supabase)
export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: Tenant;
        Insert: Omit<Tenant, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Tenant, 'id' | 'created_at' | 'updated_at'>>;
      };
      categories: {
        Row: Category;
        Insert: Omit<Category, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Category, 'id' | 'created_at' | 'updated_at'>>;
      };
      menu_items: {
        Row: MenuItem;
        Insert: Omit<MenuItem, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<MenuItem, 'id' | 'created_at' | 'updated_at'>>;
      };
      order_types: {
        Row: OrderType;
        Insert: Omit<OrderType, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<OrderType, 'id' | 'created_at' | 'updated_at'>>;
      };
      customer_form_fields: {
        Row: CustomerFormField;
        Insert: Omit<CustomerFormField, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<CustomerFormField, 'id' | 'created_at' | 'updated_at'>>;
      };
      payment_methods: {
        Row: PaymentMethod;
        Insert: Omit<PaymentMethod, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<PaymentMethod, 'id' | 'created_at' | 'updated_at'>>;
      };
      payment_method_order_types: {
        Row: PaymentMethodOrderType;
        Insert: Omit<PaymentMethodOrderType, 'id' | 'created_at'>;
        Update: Partial<Omit<PaymentMethodOrderType, 'id' | 'created_at'>>;
      };
      users: {
        Row: User;
        Insert: Omit<User, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>>;
      };
      app_users: {
        Row: AppUser;
        Insert: Omit<AppUser, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<AppUser, 'user_id' | 'created_at' | 'updated_at'>>;
      };
      orders: {
        Row: Order;
        Insert: Omit<Order, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Order, 'id' | 'created_at' | 'updated_at'>>;
      };
    };
  };
}

