/**
 * The voucher field as a customer actually meets it.
 *
 * Every existing voucher test is pure logic: the engine, the stacking rules,
 * the fingerprint. None of them render anything, so all four of the money bugs
 * that shipped were bugs of WIRING — a correct number computed and then not
 * shown, or shown and not charged. This suite drives the real `useCheckout`
 * hook through the real `VoucherField`/`OrderSummaryLines` markup and reads the
 * peso figures back out of the DOM.
 *
 * Only the edges are faked: the server action (which opens a service-role
 * Supabase client) is backed by the REAL discount engine over an in-memory
 * voucher table, so the amounts on screen are the amounts the engine produces.
 * `checkout-codes`, `order-totals`, `preview`, `resolve`, `stacking` and
 * `discount` all run for real — mocking any of them would recreate exactly the
 * blind spot this suite exists to close.
 */

import React from 'react'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { buildVoucherPreview } from '@/lib/vouchers/preview'
import type { VoucherLookup } from '@/lib/vouchers/resolve'
import type { Voucher } from '@/lib/vouchers/types'
import type { CartItem, Tenant } from '@/types/database'

// ---- The cart, mutable between renders -----------------------------------

const cartItem = (id: string, name: string, subtotal: number): CartItem =>
  ({
    id,
    menu_item: { id: `menu-${id}`, name, category_id: 'cat-1', price: subtotal },
    selected_addons: [],
    quantity: 1,
    subtotal,
  }) as unknown as CartItem

let cartItems: CartItem[] = []
const clearCart = jest.fn()
const setOrderType = jest.fn()
const BUNDLE_ITEMS: never[] = []

// Every function and array here is hoisted deliberately. `useCheckout`'s data-load
// effect lists `setOrderType` among its dependencies, so a mock that minted a new
// callback per render would re-fetch the tenant on every render — forever.
jest.mock('@/hooks/useCart', () => ({
  useCart: () => ({
    items: cartItems,
    bundleItems: BUNDLE_ITEMS,
    total: cartItems.reduce((sum, item) => sum + item.subtotal, 0),
    clearCart,
    orderType: 'ot-pickup',
    setOrderType,
    messengerPsid: null,
  }),
}))

// ---- Everything useCheckout reaches outside the browser -------------------

const TENANT = {
  id: 'tenant-1',
  slug: 'acme',
  name: 'Acme Silog',
  enable_order_management: true,
} as unknown as Tenant

const createOrderAction = jest.fn()
const toastError = jest.fn()

const ROUTER = { push: jest.fn(), replace: jest.fn() }
const SEARCH_PARAMS = new URLSearchParams()
jest.mock('next/navigation', () => ({
  useRouter: () => ROUTER,
  useSearchParams: () => SEARCH_PARAMS,
  usePathname: () => '/acme/checkout',
}))

jest.mock('@/lib/tenants-client', () => ({
  getTenantBySlugClient: jest.fn(async () => ({ data: TENANT, error: null })),
}))

jest.mock('@/lib/order-types-client', () => ({
  getEnabledOrderTypesByTenantClient: jest.fn(async () => []),
  getCustomerFormFieldsByOrderTypeClient: jest.fn(async () => []),
}))

jest.mock('@/lib/payment-methods-client', () => ({
  getPaymentMethodsByOrderTypeClient: jest.fn(async () => []),
}))

jest.mock('@/lib/outlets/outlets-client', () => ({
  fetchActiveOutlets: jest.fn(async () => []),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
    }),
  }),
}))

jest.mock('@/app/actions/orders', () => ({
  createOrderAction: (...args: unknown[]) => {
    createOrderAction(...args)
    return Promise.resolve({ success: true, data: { id: 'order-1' } })
  },
}))

jest.mock('@/app/actions/analytics', () => ({
  trackAnalyticsEventAction: jest.fn(async () => undefined),
}))

jest.mock('@/app/actions/lalamove', () => ({ createQuotationAction: jest.fn(async () => ({ success: false })) }))
jest.mock('@/app/actions/delivery', () => ({ calculateDistanceDeliveryFeeAction: jest.fn(async () => ({ success: false })) }))

jest.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: jest.fn(),
  },
}))

// ---- The voucher table, in memory ----------------------------------------

const voucher = (overrides: Partial<Voucher> & { code: string }): Voucher => ({
  id: `v-${overrides.code}`,
  name: overrides.code,
  discountType: 'fixed',
  discountValue: 0,
  scope: 'universal',
  isStackable: true,
  usedCount: 0,
  channels: ['checkout', 'pos'],
  isActive: true,
  ...overrides,
})

/** ₱100 off, but only on carts of ₱500 or more — the staleness trap. */
const SAVE100 = voucher({
  code: 'SAVE100',
  name: 'Hundred off',
  discountType: 'fixed',
  discountValue: 100,
  minOrderAmount: 500,
})

/** Ran out of redemptions, so the engine has a reason to state. */
const EXPIRED = voucher({
  code: 'GONE',
  name: 'All used up',
  discountType: 'fixed',
  discountValue: 50,
  usageLimitTotal: 10,
  usedCount: 10,
})

let voucherTable: Voucher[] = []

const lookup: VoucherLookup = {
  findByCodes: async (_tenantId, codes) =>
    voucherTable.filter((v) => codes.includes(v.code.toUpperCase())),
  countCustomerRedemptions: async () => ({}),
}

/**
 * Holds the next re-price open.
 *
 * The stale window is the whole point of the fingerprint rule, and in jsdom a
 * mocked action resolves so fast that the window closes before anything can
 * look at it. Set this and the customer is left standing in it.
 */
let gate: Promise<void> | null = null

const validateVoucherAction = jest.fn(
  async (input: {
    tenantId: string
    codes: string[]
    lines: { id: string; menuItemId: string; categoryId?: string | null; quantity: number; subtotal: number }[]
    deliveryFee?: number | null
    serviceCharge?: number | null
  }) => (gate ? await gate : undefined, {
    success: true,
    data: await buildVoucherPreview({
      tenantId: input.tenantId,
      codes: input.codes,
      context: {
        lines: input.lines,
        deliveryFee: input.deliveryFee ?? 0,
        serviceCharge: input.serviceCharge ?? 0,
        channel: 'checkout',
        now: new Date(),
      },
      lookup,
    }),
  }),
)

jest.mock('@/app/actions/vouchers', () => ({
  validateVoucherAction: (...args: [never]) => validateVoucherAction(...args),
}))

// Imported after the mocks so the hook picks them up.
import { useCheckout } from '@/hooks/useCheckout'
import {
  OrderSummaryLines,
  CheckoutCTA,
} from '@/components/customer/checkout-templates/checkout-primitives'

function CheckoutHarness() {
  const checkout = useCheckout('acme')
  return (
    <div>
      <OrderSummaryLines checkout={checkout} />
      <CheckoutCTA checkout={checkout} />
    </div>
  )
}

/** The bold figure at the bottom of the summary — what the customer will pay. */
function displayedTotal(): string {
  const label = screen.getByText('Total')
  return label.parentElement!.querySelector('span:last-child')!.textContent!.trim()
}

async function renderCheckout() {
  const view = render(<CheckoutHarness />)
  // The tenant load settles before anything voucher-related can run.
  await screen.findByText('Subtotal')
  return view
}

async function applyCode(user: ReturnType<typeof userEvent.setup>, code: string) {
  await user.type(screen.getByLabelText('Have a voucher?'), code)
  await user.click(screen.getByRole('button', { name: 'Apply' }))
}

beforeEach(() => {
  jest.clearAllMocks()
  gate = null
  voucherTable = [SAVE100, EXPIRED]
  cartItems = [cartItem('line-1', 'Tapsilog', 600)]
})

describe('applying a voucher at checkout', () => {
  it('names the code, shows what it took off, and drops the total by that much', async () => {
    const user = userEvent.setup()
    await renderCheckout()

    expect(displayedTotal()).toBe('₱600.00')

    await applyCode(user, 'SAVE100')

    await waitFor(() => expect(screen.getByText('Discount')).toBeInTheDocument())

    // The code is named on its own row, with its own amount, so a customer
    // stacking two codes can see which one is doing what.
    expect(screen.getByText('SAVE100')).toBeInTheDocument()
    expect(screen.getAllByText('−₱100.00')).toHaveLength(2)

    expect(displayedTotal()).toBe('₱500.00')
  })

  it('tells the customer WHY a code was turned down instead of doing nothing', async () => {
    // The sibling POS bug: the engine's message was computed and then dropped,
    // so a rejected code looked identical to a code that had not been typed.
    const user = userEvent.setup()
    await renderCheckout()

    await applyCode(user, 'GONE')

    await waitFor(() => expect(screen.getByText('GONE')).toBeInTheDocument())

    // The engine's own phrasing reaches the screen.
    const preview = await validateVoucherAction.mock.results[0].value
    const reason = preview.data!.rejected[0].message
    expect(reason).not.toBe('')
    expect(screen.getByText(reason)).toBeInTheDocument()

    // And nothing came off.
    expect(screen.queryByText('Discount')).not.toBeInTheDocument()
    expect(displayedTotal()).toBe('₱600.00')
  })

  it('surfaces an unrecognised code rather than swallowing it', async () => {
    const user = userEvent.setup()
    await renderCheckout()

    await applyCode(user, 'NOPE')

    await waitFor(() => expect(screen.getByText(/not recognised/i)).toBeInTheDocument())
    expect(displayedTotal()).toBe('₱600.00')
  })

  it('restores the full price when the code is removed', async () => {
    const user = userEvent.setup()
    await renderCheckout()

    await applyCode(user, 'SAVE100')
    await waitFor(() => expect(displayedTotal()).toBe('₱500.00'))

    await user.click(screen.getByRole('button', { name: 'Remove voucher SAVE100' }))

    await waitFor(() => expect(displayedTotal()).toBe('₱600.00'))
    expect(screen.queryByText('Discount')).not.toBeInTheDocument()
    expect(screen.queryByText('SAVE100')).not.toBeInTheDocument()
  })
})

describe('a preview never outlives the cart it was computed against', () => {
  it('shows FULL price while the re-price is still in flight', async () => {
    // The window the fingerprint rule exists for. The cart has moved, the old
    // ₱100 was computed against a cart that no longer exists, and the server
    // has not answered yet. Anything other than full price here is a number
    // the customer is shown and will not be charged — or worse, the reverse.
    const user = userEvent.setup()
    const { rerender } = await renderCheckout()

    await applyCode(user, 'SAVE100')
    await waitFor(() => expect(displayedTotal()).toBe('₱500.00'))

    let release: () => void = () => {}
    gate = new Promise<void>((resolve) => {
      release = resolve
    })

    await act(async () => {
      cartItems = [cartItem('line-1', 'Tapsilog', 800)]
      rerender(<CheckoutHarness />)
    })

    // ₱800 still clears the ₱500 minimum, so the discount WILL come back — but
    // it must not be applied on the strength of the previous cart's answer.
    expect(displayedTotal()).toBe('₱800.00')
    expect(screen.queryByText('Discount')).not.toBeInTheDocument()

    await act(async () => {
      release()
      gate = null
    })

    await waitFor(() => expect(displayedTotal()).toBe('₱700.00'))
  })

  it('stops billing the old discount the moment the cart changes', async () => {
    // ₱600 clears SAVE100's ₱500 minimum. Drop to ₱400 and it no longer does,
    // so the server would charge full price. A summary still showing ₱500 is
    // the worst outcome: shown one number, billed another.
    const user = userEvent.setup()
    const { rerender } = await renderCheckout()

    await applyCode(user, 'SAVE100')
    await waitFor(() => expect(displayedTotal()).toBe('₱500.00'))

    await act(async () => {
      cartItems = [cartItem('line-1', 'Tapsilog', 400)]
      rerender(<CheckoutHarness />)
    })

    // Whatever the re-price ends up saying, the total must NEVER be the old
    // 600 − 100. It settles at the full ₱400 because the minimum is not met.
    await waitFor(() => expect(displayedTotal()).toBe('₱400.00'))
    expect(screen.queryByText('Discount')).not.toBeInTheDocument()
  })

  it('re-prices rather than freezing, when the smaller cart still qualifies', async () => {
    const user = userEvent.setup()
    const { rerender } = await renderCheckout()

    await applyCode(user, 'SAVE100')
    await waitFor(() => expect(displayedTotal()).toBe('₱500.00'))

    await act(async () => {
      cartItems = [cartItem('line-1', 'Tapsilog', 550)]
      rerender(<CheckoutHarness />)
    })

    await waitFor(() => expect(displayedTotal()).toBe('₱450.00'))
    expect(screen.getAllByText('−₱100.00')).toHaveLength(2)
  })

  it('keeps the code entered so the customer does not have to retype it', async () => {
    const user = userEvent.setup()
    const { rerender } = await renderCheckout()

    await applyCode(user, 'SAVE100')
    await waitFor(() => expect(displayedTotal()).toBe('₱500.00'))

    await act(async () => {
      cartItems = [cartItem('line-1', 'Tapsilog', 400)]
      rerender(<CheckoutHarness />)
    })

    await waitFor(() => expect(displayedTotal()).toBe('₱400.00'))
    expect(screen.getByRole('button', { name: 'Remove voucher SAVE100' })).toBeInTheDocument()
  })
})

describe('what leaves the browser', () => {
  it('submits the CODES, never a discount amount the browser worked out', async () => {
    // A client-supplied amount is a free lunch for anyone with dev tools.
    const user = userEvent.setup()
    await renderCheckout()

    await applyCode(user, 'SAVE100')
    await waitFor(() => expect(displayedTotal()).toBe('₱500.00'))

    await user.click(screen.getByRole('button', { name: /Place Order|Order|₱/ }))

    await waitFor(() => expect(createOrderAction).toHaveBeenCalled())

    // By identity, not by position: the codes used to be the last argument
    // until the per-attempt client order id was appended after them, and what
    // matters is that the CODES travel — not where in the list they sit.
    const args = createOrderAction.mock.calls[0]
    expect(args).toContainEqual(['SAVE100'])

    // No argument anywhere in the call carries the computed 100.
    const serialised = JSON.stringify(args)
    expect(serialised).not.toContain('discountTotal')
    expect(serialised).not.toContain('"discount"')
  })
})
