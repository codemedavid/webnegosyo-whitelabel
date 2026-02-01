import type { MenuItem, Variation, Addon, VariationOption } from '@/types/database'

export function createTestMenuItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 'test-item-1',
    tenant_id: 'test-tenant-1',
    category_id: 'test-category-1',
    name: 'Test Item',
    description: 'A test menu item',
    price: 100,
    discounted_price: undefined,
    image_url: 'https://example.com/image.jpg',
    variation_types: [],
    variations: [],
    addons: [],
    is_available: true,
    is_featured: false,
    order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

export function createTestVariation(overrides: Partial<Variation> = {}): Variation {
  return {
    id: 'test-variation-1',
    name: 'Large',
    price_modifier: 20,
    is_default: false,
    ...overrides,
  }
}

export function createTestAddon(overrides: Partial<Addon> = {}): Addon {
  return {
    id: 'test-addon-1',
    name: 'Extra Cheese',
    price: 10,
    is_default: false,
    ...overrides,
  }
}

export function createTestVariationOption(overrides: Partial<VariationOption> = {}): VariationOption {
  return {
    id: 'test-option-1',
    name: 'Large',
    price_modifier: 20,
    image_url: undefined,
    is_default: false,
    display_order: 0,
    ...overrides,
  }
}

export function createTestVariationType(overrides: Partial<{
  id: string
  name: string
  is_required: boolean
  display_order: number
  options: VariationOption[]
}> = {}): { id: string; name: string; is_required: boolean; display_order: number; options: VariationOption[] } {
  return {
    id: 'test-type-1',
    name: 'Size',
    is_required: true,
    display_order: 0,
    options: [],
    ...overrides,
  }
}
