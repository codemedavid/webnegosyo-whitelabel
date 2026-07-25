/**
 * Cart drawer — close ("back") affordance.
 *
 * The drawer relied on the Sheet primitive's default X, absolutely positioned at
 * top-4 right-4. In the compact drawer header that icon is easy to miss (and on
 * the storefront it was being painted over by the announcement strip), so a
 * customer on a phone had no obvious way back to the menu.
 *
 * These tests pin an explicit, labelled back control in the drawer header — and
 * that it is the ONLY close control, so the header does not grow a second,
 * overlapping X on top of it.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CartDrawer } from '@/components/customer/cart-drawer'
import type { CartItem, MenuItem } from '@/types/database'

// --- Mocks -----------------------------------------------------------------

let mockItems: CartItem[] = []

jest.mock('@/hooks/useCart', () => ({
  useCart: () => ({
    items: mockItems,
    total: mockItems.reduce((t, i) => t + i.subtotal, 0),
    bundleItems: [],
    updateQuantity: jest.fn(),
    removeItem: jest.fn(),
    updateItemConfiguration: jest.fn(),
    updateBundleQuantity: jest.fn(),
    removeBundleFromCart: jest.fn(),
  }),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), prefetch: jest.fn() }),
}))

jest.mock('@/app/actions/menu-engineering', () => ({
  getCheckoutUpsellsAction: jest.fn().mockResolvedValue({ success: false }),
}))

// --- Fixtures --------------------------------------------------------------

const branding = {
  primary: '#f97316',
  secondary: '#fb923c',
  accent: '#ea580c',
} as never

function makeLine(id: string): CartItem {
  return {
    id,
    menu_item: {
      id: 'menu-wings',
      tenant_id: 'tenant-1',
      category_id: 'cat-1',
      name: 'Wings Platter',
      description: null,
      price: 129,
      image_url: null,
      is_available: true,
      display_order: 1,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
      variations: [],
      addons: [],
      order: 1,
    } as unknown as MenuItem,
    selected_addons: [],
    quantity: 1,
    subtotal: 129,
  } as CartItem
}

function renderDrawer(onClose = jest.fn()) {
  render(
    <CartDrawer open onClose={onClose} tenantSlug="acme" branding={branding} />
  )
  return { onClose }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockItems = [makeLine('menu-wings_plain')]
})

// --- Tests -----------------------------------------------------------------

describe('CartDrawer close affordance', () => {
  it('renders a labelled back control in the drawer header', () => {
    // Arrange / Act
    renderDrawer()

    // Assert
    expect(
      screen.getByRole('button', { name: /back to menu|close cart/i })
    ).toBeInTheDocument()
  })

  it('closes the drawer when the back control is pressed', async () => {
    // Arrange
    const user = userEvent.setup()
    const { onClose } = renderDrawer()

    // Act
    await user.click(
      screen.getByRole('button', { name: /back to menu|close cart/i })
    )

    // Assert
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('exposes exactly one close control, not the default X on top of it', () => {
    // Arrange / Act
    renderDrawer()

    // Assert
    expect(
      screen.getAllByRole('button', { name: /back to menu|close cart|^close$/i })
    ).toHaveLength(1)
  })
})
