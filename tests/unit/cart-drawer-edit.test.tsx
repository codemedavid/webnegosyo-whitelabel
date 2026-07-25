/**
 * Cart drawer — edit line item.
 *
 * The cart *page* already lets a customer re-open a line item and change its
 * flavor/add-ons/quantity/note. The slide-out drawer on the menu page did not:
 * it only offered +/- and delete, so a customer who picked the wrong flavor had
 * to delete the line and rebuild it from the menu.
 *
 * These tests pin the drawer's wiring: an edit affordance per line, the edit
 * modal seeded from *that* line, and the commit routed through
 * `updateItemConfiguration` with the correct cart-item id (so editing one of two
 * same-product lines never touches its sibling).
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CartDrawer } from '@/components/customer/cart-drawer'
import type { CartItem, MenuItem, VariationOption } from '@/types/database'

// --- Mocks -----------------------------------------------------------------

const mockUpdateItemConfiguration = jest.fn()
const mockUpdateQuantity = jest.fn()
const mockRemoveItem = jest.fn()

let mockItems: CartItem[] = []

jest.mock('@/hooks/useCart', () => ({
  useCart: () => ({
    items: mockItems,
    total: mockItems.reduce((t, i) => t + i.subtotal, 0),
    bundleItems: [],
    updateQuantity: mockUpdateQuantity,
    removeItem: mockRemoveItem,
    updateItemConfiguration: mockUpdateItemConfiguration,
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

/**
 * Stub the edit modal: this suite is about the *drawer's* wiring, not the
 * modal's internals (those are covered by the item-detail tests). The stub
 * reports which cart line it was seeded with and lets the test commit an edit.
 */
jest.mock('@/components/customer/item-detail-modal', () => ({
  ItemDetailModal: ({
    open,
    item,
    editItem,
    onAddToCart,
    onClose,
  }: {
    open: boolean
    item: MenuItem | null
    editItem?: CartItem | null
    onAddToCart: (
      item: MenuItem,
      variation: undefined,
      addons: [],
      quantity: number,
      specialInstructions?: string
    ) => void
    onClose: () => void
  }) =>
    open ? (
      /* `pointerEvents: auto` mirrors what real Radix dialog content sets: an
         open Sheet puts `pointer-events: none` on everything outside it. */
      <div data-testid="edit-modal" style={{ pointerEvents: 'auto' }}>
        <span data-testid="edit-modal-cart-item-id">{editItem?.id}</span>
        <span data-testid="edit-modal-quantity">{editItem?.quantity}</span>
        {/* Queried by testid, not role: the open Radix Sheet marks sibling DOM
            aria-hidden, which hides this plain-div stub from role queries. The
            real modal portals out, so this is a harness artifact only. */}
        <button data-testid="commit-edit" onClick={() => onAddToCart(item!, undefined, [], 3, 'less ice')}>
          Commit Edit
        </button>
        <button data-testid="close-edit" onClick={onClose}>
          Close Edit
        </button>
      </div>
    ) : null,
}))

// --- Fixtures --------------------------------------------------------------

const branding = {
  primary: '#f97316',
  secondary: '#fb923c',
  accent: '#ea580c',
} as never

function makeMenuItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 'menu-latte',
    tenant_id: 'tenant-1',
    category_id: 'cat-1',
    name: 'Latte',
    description: 'Espresso and milk',
    price: 100,
    image_url: null,
    is_available: true,
    display_order: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  } as MenuItem
}

function makeLine(id: string, flavorName: string, quantity: number): CartItem {
  const option: VariationOption = {
    id: `opt-${flavorName}`,
    variation_type_id: 'type-flavor',
    name: flavorName,
    price_modifier: 0,
    is_available: true,
    display_order: 1,
  } as VariationOption

  return {
    id,
    menu_item: makeMenuItem(),
    selected_variations: { 'type-flavor': option },
    selected_addons: [],
    quantity,
    subtotal: 100 * quantity,
  } as CartItem
}

function renderDrawer() {
  return render(
    <CartDrawer open onClose={jest.fn()} tenantSlug="acme" branding={branding} />
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockItems = [
    makeLine('menu-latte_type-flavor:opt-Vanilla', 'Vanilla', 1),
    makeLine('menu-latte_type-flavor:opt-Hazelnut', 'Hazelnut', 2),
  ]
})

// --- Tests -----------------------------------------------------------------

describe('CartDrawer edit line item', () => {
  it('renders an edit affordance for every cart line', () => {
    // Arrange / Act
    renderDrawer()

    // Assert
    expect(screen.getAllByRole('button', { name: /edit item/i })).toHaveLength(2)
  })

  it('opens the edit modal seeded from the line that was clicked', async () => {
    // Arrange
    const user = userEvent.setup()
    renderDrawer()

    // Act — edit the SECOND line (Hazelnut, qty 2)
    await user.click(screen.getAllByRole('button', { name: /edit item/i })[1])

    // Assert
    expect(screen.getByTestId('edit-modal-cart-item-id')).toHaveTextContent(
      'menu-latte_type-flavor:opt-Hazelnut'
    )
    expect(screen.getByTestId('edit-modal-quantity')).toHaveTextContent('2')
  })

  it('commits the edit against the clicked line id, leaving the sibling line alone', async () => {
    // Arrange
    const user = userEvent.setup()
    renderDrawer()

    // Act
    await user.click(screen.getAllByRole('button', { name: /edit item/i })[1])
    await user.click(screen.getByTestId('commit-edit'))

    // Assert — routed through the cart's edit path with the right line id
    expect(mockUpdateItemConfiguration).toHaveBeenCalledTimes(1)
    expect(mockUpdateItemConfiguration).toHaveBeenCalledWith(
      'menu-latte_type-flavor:opt-Hazelnut',
      expect.objectContaining({ id: 'menu-latte' }),
      undefined,
      [],
      3,
      'less ice'
    )
    // Editing must not fall back to the blunt quantity/remove paths
    expect(mockUpdateQuantity).not.toHaveBeenCalled()
    expect(mockRemoveItem).not.toHaveBeenCalled()
  })

  it('closes the edit modal after a successful commit', async () => {
    // Arrange
    const user = userEvent.setup()
    renderDrawer()

    // Act
    await user.click(screen.getAllByRole('button', { name: /edit item/i })[0])
    expect(screen.getByTestId('edit-modal')).toBeInTheDocument()
    await user.click(screen.getByTestId('commit-edit'))

    // Assert
    expect(screen.queryByTestId('edit-modal')).not.toBeInTheDocument()
  })

  it('closes the edit modal on cancel without changing the cart', async () => {
    // Arrange
    const user = userEvent.setup()
    renderDrawer()

    // Act
    await user.click(screen.getAllByRole('button', { name: /edit item/i })[0])
    await user.click(screen.getByTestId('close-edit'))

    // Assert
    expect(screen.queryByTestId('edit-modal')).not.toBeInTheDocument()
    expect(mockUpdateItemConfiguration).not.toHaveBeenCalled()
  })
})
