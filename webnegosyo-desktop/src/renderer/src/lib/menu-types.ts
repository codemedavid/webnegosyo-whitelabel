// Supabase menu-side types used by the POS register. Mirrors the shapes the
// mobile customer app reads from Supabase (mobile/types/database.ts).

export interface Category {
  id: string
  tenant_id: string
  name: string
  description?: string
  icon?: string
  order: number
  is_active: boolean
}

export interface Variation {
  id: string
  name: string
  price_modifier: number
  is_default?: boolean
}

export interface VariationOption {
  id: string
  name: string
  price_modifier: number
  image_url?: string
  is_default?: boolean
  display_order: number
}

export interface VariationType {
  id: string
  name: string
  is_required: boolean
  display_order: number
  options: VariationOption[]
}

export interface Addon {
  id: string
  name: string
  price: number
  is_default?: boolean
}

export interface MenuItem {
  id: string
  tenant_id: string
  category_id: string
  name: string
  description: string
  price: number
  discounted_price?: number
  image_url: string
  variation_types?: VariationType[]
  variations: Variation[]
  addons: Addon[]
  is_available: boolean
  badge_text?: string
  order: number
}

export interface OrderType {
  id: string
  tenant_id: string
  type: 'dine_in' | 'pickup' | 'delivery'
  name: string
  description?: string
  note?: string
  is_enabled: boolean
  order_index: number
}

export interface PaymentMethod {
  id: string
  tenant_id: string
  name: string
  details?: string
  qr_code_url?: string
  is_active: boolean
  order_index: number
}
