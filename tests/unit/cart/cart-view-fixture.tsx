/**
 * A minimal `useCartView()` result for rendering the cart designs in jsdom.
 * Only what the line rows and the page shells read; everything else no-ops.
 */
import type { UseCartViewReturn } from '@/hooks/useCartView'
import type { CartItem, MenuItem } from '@/types/database'

/** 200 characters with no space: the QA note that broke every layout. */
export const LONG_UNBROKEN_NOTE = 'N'.repeat(200)

export function plainDish(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 'latte', tenant_id: 'tenant-1', category_id: 'drinks', name: 'Latte', description: '',
    price: 120, image_url: '', is_available: true, order: 0, created_at: '', updated_at: '',
    variations: [], addons: [],
    ...overrides,
  } as MenuItem
}

export function cartLine(overrides: Partial<CartItem> = {}): CartItem {
  return {
    id: 'latte', menu_item: plainDish(), selected_addons: [], quantity: 1, subtotal: 120,
    ...overrides,
  } as CartItem
}

export function makeCartView(items: CartItem[], overrides: Partial<UseCartViewReturn> = {}): UseCartViewReturn {
  return {
    router: { push: jest.fn(), back: jest.fn(), prefetch: jest.fn() },
    tenantSlug: 'acme',
    tenant: { id: 'tenant-1', slug: 'acme', name: 'Acme' },
    branding: {},
    items,
    bundleItems: [],
    total: items.reduce((sum, line) => sum + line.subtotal, 0),
    updateQuantity: jest.fn(),
    removeBundleFromCart: jest.fn(),
    updateBundleQuantity: jest.fn(),
    setItemToRemove: jest.fn(),
    setItemToEdit: jest.fn(),
    handleDecreaseQuantity: jest.fn(),
    canIncreaseItem: () => true,
    presellHintFor: () => null,
    stockHintFor: () => null,
    isNavigating: false,
    requestCheckout: jest.fn(),
    exitToMenu: jest.fn(),
    showCartOffers: false,
    ...overrides,
  } as unknown as UseCartViewReturn
}
