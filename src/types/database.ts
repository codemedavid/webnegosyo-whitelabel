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
  messenger_page_id: string;
  messenger_username?: string;
  is_active: boolean;
  mapbox_enabled: boolean;
  enable_order_management: boolean;
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

export interface Variation {
  id: string;
  name: string; // "Small", "Medium", "Large"
  price_modifier: number; // +0, +2, +5
  is_default?: boolean;
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

