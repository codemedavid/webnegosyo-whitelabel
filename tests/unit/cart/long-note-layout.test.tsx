/**
 * Browser QA 2026-11-04: a 200-character note with no spaces widened the
 * classic cart page to 1553px, pushed the express cart's fixed Proceed bar
 * away, shoved the drawer's Edit/delete/price off-screen and overflowed the
 * checkout summary. A note must break anywhere, and no row-flex or grid item
 * between it and its line may keep the default `min-width: auto` (a flex item
 * never shrinks below its longest word otherwise).
 *
 * jsdom has no layout, so this pins the two CSS facts that make it wrap.
 */
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ClassicCart } from '@/components/customer/cart-templates/classic-cart'
import { CartItemRow } from '@/components/customer/cart-templates/cart-primitives'
import { OrderSummaryLines } from '@/components/customer/checkout-templates/order-summary-lines'
import { OrderItemsDisplay } from '@/components/admin/order-items-display'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import type { CartItem } from '@/types/database'
import { LONG_UNBROKEN_NOTE, cartLine, makeCartView } from './cart-view-fixture'

let mockDrawerItems: CartItem[] = []

jest.mock('@/components/shared/optimized-image', () => ({ OptimizedImage: () => null }))
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), prefetch: jest.fn(), back: jest.fn() }),
  useParams: () => ({ tenant: 'acme' }),
}))
jest.mock('@/hooks/useCart', () => ({
  useCart: () => ({
    items: mockDrawerItems,
    total: 120,
    bundleItems: [],
    updateQuantity: jest.fn(),
    removeItem: jest.fn(),
    updateItemConfiguration: jest.fn(),
    updateBundleQuantity: jest.fn(),
    removeBundleFromCart: jest.fn(),
  }),
}))
jest.mock('@/app/actions/menu-engineering', () => ({
  getCheckoutUpsellsAction: jest.fn().mockResolvedValue({ success: false }),
}))

/** The innermost element that holds the whole note. */
function noteElement(): HTMLElement {
  const holders = screen.getAllByText((_, element) =>
    Boolean(element?.textContent?.includes(LONG_UNBROKEN_NOTE))
    && !Array.from(element?.children ?? []).some((child) => child.textContent?.includes(LONG_UNBROKEN_NOTE)),
  )
  return holders[0]
}

const isRowFlex = (element: Element | null) =>
  Boolean(element?.classList.contains('flex') && !element.classList.contains('flex-col'))
const isGrid = (element: Element | null) => Boolean(element?.classList.contains('grid'))

function expectNoteWraps() {
  const note = noteElement()
  expect(note.closest('.wrap-anywhere')).not.toBeNull()

  const stuck: string[] = []
  for (let node: HTMLElement | null = note; node && node !== document.body; node = node.parentElement) {
    if ((isRowFlex(node.parentElement) || isGrid(node.parentElement)) && !node.classList.contains('min-w-0')) {
      stuck.push(`<${node.tagName.toLowerCase()} class="${node.className}">`)
    }
  }
  expect(stuck).toEqual([])
}

const notedLine = () => cartLine({ special_instructions: LONG_UNBROKEN_NOTE })

describe('a long unbroken kitchen note wraps', () => {
  it('on the classic cart page', () => {
    render(<ClassicCart cart={makeCartView([notedLine()])} />)
    expectNoteWraps()
  })

  it('on the shared cart row (modern, minimal, wizard, express)', () => {
    const line = notedLine()
    render(<CartItemRow cart={makeCartView([line])} item={line} index={0} />)
    expectNoteWraps()
  })

  it('in the cart drawer', async () => {
    mockDrawerItems = [notedLine()]
    const { CartDrawer } = await import('@/components/customer/cart-drawer')
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CartDrawer open onClose={jest.fn()} tenantSlug="acme" branding={{} as never} />
      </QueryClientProvider>,
    )
    expectNoteWraps()
  })

  it.each(['default', 'classic'] as const)('in the %s checkout order summary', (variant) => {
    const checkout = {
      tenant: { id: 'tenant-1', name: 'Acme' }, branding: {}, items: [notedLine()], bundleItems: [],
      total: 120, deliveryFee: null, isFetchingDeliveryFee: false, deliveryFeeAddress: null, deliveryFeeError: null,
      freeDeliveryRemaining: null, customerData: {}, serviceChargeAmount: 0, grandTotal: 120,
      voucherCodes: [], voucherPreview: null, isCheckingVoucher: false, applyVoucherCode: jest.fn(),
      removeVoucherCode: jest.fn(), voucherLineNames: {}, setVoucherUnitPicks: jest.fn(), govLines: null,
    } as unknown as UseCheckoutReturn
    render(<OrderSummaryLines checkout={checkout} variant={variant} />)
    expectNoteWraps()
  })

  it('on the admin order screen', () => {
    render(
      <OrderItemsDisplay
        orderItems={[{
          id: 'oi-1', menu_item_name: 'Latte', quantity: 1, price: 120, subtotal: 120,
          special_instructions: LONG_UNBROKEN_NOTE,
        } as never]}
      />,
    )
    expectNoteWraps()
  })
})
