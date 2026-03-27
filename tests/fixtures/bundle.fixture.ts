import type {
  Bundle,
  BundleSlot,
  BundleSlotPriceOverride,
  BundleWithSlots,
  CartBundleItem,
  CartBundleSlotSelection,
  Category,
} from '@/types/database'
import { createTestMenuItem } from './menu-item.fixture'

export function createTestBundle(overrides: Partial<Bundle> = {}): Bundle {
  return {
    id: 'bundle-1',
    tenant_id: 'tenant-1',
    name: 'Test Bundle',
    description: 'A test bundle',
    image_url: 'https://example.com/bundle.jpg',
    pricing_type: 'fixed',
    fixed_price: 200,
    discount_percent: undefined,
    is_active: true,
    show_on_menu: true,
    show_as_upsell: false,
    display_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

export function createTestCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'category-1',
    tenant_id: 'tenant-1',
    name: 'Beverages',
    description: 'Drinks',
    order: 0,
    is_active: true,
    display_layout: 'grid',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

export function createTestBundleSlot(overrides: Partial<BundleSlot> = {}): BundleSlot {
  return {
    id: 'slot-1',
    bundle_id: 'bundle-1',
    name: 'Choose your Drink',
    category_id: 'category-1',
    pick_count: 1,
    sort_order: 0,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

export function createTestPriceOverride(
  overrides: Partial<BundleSlotPriceOverride> = {}
): BundleSlotPriceOverride {
  return {
    id: 'override-1',
    slot_id: 'slot-1',
    menu_item_id: 'premium-item-1',
    price_override: 20,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

export function createTestBundleWithSlots(
  overrides: Partial<BundleWithSlots> = {}
): BundleWithSlots {
  return {
    ...createTestBundle(),
    slots: [
      createTestBundleSlot({
        items: [
          createTestMenuItem({ id: 'drink-1', name: 'Coke', price: 45, category_id: 'category-1' }),
          createTestMenuItem({ id: 'drink-2', name: 'Iced Tea', price: 40, category_id: 'category-1' }),
        ],
        price_overrides: [],
        category: createTestCategory(),
      }),
    ],
    ...overrides,
  }
}

export function createTestSlotSelection(
  overrides: Partial<CartBundleSlotSelection> = {}
): CartBundleSlotSelection {
  return {
    slotId: 'slot-1',
    slotName: 'Choose your Drink',
    menuItemId: 'drink-1',
    menuItemName: 'Coke',
    menuItemImage: 'https://example.com/coke.jpg',
    menuItemPrice: 45,
    quantity: 1,
    selectedAddons: [],
    priceOverride: 0,
    ...overrides,
  }
}

export function createTestCartBundleItem(
  overrides: Partial<CartBundleItem> = {}
): CartBundleItem {
  return {
    id: 'cart-bundle-1',
    bundleId: 'bundle-1',
    bundleName: 'Test Bundle',
    slots: [createTestSlotSelection()],
    quantity: 1,
    pricingType: 'fixed',
    basePrice: 200,
    subtotal: 200,
    ...overrides,
  }
}
