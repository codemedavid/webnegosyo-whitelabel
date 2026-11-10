/**
 * Designed checkout: every block renders from the page's checkout context,
 * required blocks that don't apply render nothing, the summary leaves the
 * voucher and Senior/PWD fields to their own blocks, and the ONLY way the
 * page submits is the place-order block calling handleProceedToPayment.
 */

import { fireEvent, render, screen, within } from '@testing-library/react'

import { HeroBuilderRenderer } from '@/components/hero-builder/renderer/hero-builder-renderer'
import { PageRuntimeProvider, type PageRuntime } from '@/components/hero-builder/renderer/page-runtime'
import { CheckoutBlocksProvider } from '@/components/page-designer/checkout/checkout-blocks-context'
import { CHECKOUT_LIVE_BLOCKS } from '@/components/page-designer/checkout/checkout-live-blocks'
import { buildSampleCheckout } from '@/components/page-designer/checkout/sample-checkout'
import { CHECKOUT_SAMPLE_BLOCKS } from '@/components/page-designer/samples/checkout-samples'
import { CHECKOUT_BLOCKS, CHECKOUT_STANDARD_ORDER } from '@/lib/page-designer/blocks-checkout'
import { createStandardDesign } from '@/lib/page-designer/standard-designs'
import { PAGE_TEMPLATES } from '@/lib/page-designer/templates'
import type { HeroDesignV5 } from '@/lib/hero-builder/types'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }))

jest.mock('@/hooks/use-loyalty-progress', () => ({
  useLoyaltyProgress: () => ({ offer: null, card: null, isLoading: false, error: null, refresh: jest.fn() }),
}))

function makeCheckout(overrides: Record<string, unknown> = {}): UseCheckoutReturn {
  return {
    ...buildSampleCheckout(null, 'Island Silog'),
    router: { push: jest.fn(), back: jest.fn() },
    handleProceedToPayment: jest.fn(),
    ...overrides,
  } as unknown as UseCheckoutReturn
}

function runtime(extra: Partial<PageRuntime> = {}): PageRuntime {
  return {
    page: 'checkout',
    state: null,
    tokens: { store: 'Island Silog', total: '₱485.00' },
    labels: {},
    blocks: CHECKOUT_LIVE_BLOCKS,
    ...extra,
  }
}

function renderDesign(checkout: UseCheckoutReturn, design: HeroDesignV5 = createStandardDesign('checkout'), extra: Partial<PageRuntime> = {}) {
  return render(
    <PageRuntimeProvider value={runtime(extra)}>
      <CheckoutBlocksProvider value={{ checkout }}>
        <HeroBuilderRenderer design={design} />
      </CheckoutBlocksProvider>
    </PageRuntimeProvider>,
  )
}

describe('checkout block registry', () => {
  it('has a live and a sample renderer for every block', () => {
    for (const def of CHECKOUT_BLOCKS) {
      expect(CHECKOUT_LIVE_BLOCKS[def.id]).toBeDefined()
      expect(CHECKOUT_SAMPLE_BLOCKS[def.id]).toBeDefined()
    }
    expect([...CHECKOUT_STANDARD_ORDER].sort()).toEqual(CHECKOUT_BLOCKS.map((b) => b.id).sort())
  })
})

describe('designed checkout blocks', () => {
  it('renders every section from the checkout context with today’s wording', () => {
    renderDesign(makeCheckout())
    expect(screen.getByRole('heading', { name: 'Checkout' })).toBeInTheDocument()
    expect(screen.getByText('How would you like to receive your order?')).toBeInTheDocument()
    expect(screen.getByText('When would you like it?')).toBeInTheDocument()
    expect(screen.getByText('Customer Information')).toBeInTheDocument()
    expect(screen.getByText('Order Summary')).toBeInTheDocument()
    expect(screen.getByText('Chicken Adobo Rice Bowl')).toBeInTheDocument()
    expect(screen.getByText('Subtotal')).toBeInTheDocument()
    expect(screen.getByLabelText('Have a voucher?')).toBeInTheDocument()
    expect(screen.getByText(/Show your ID at the counter/)).toBeInTheDocument()
    expect(screen.getByText('Payment')).toBeInTheDocument()
    expect(document.querySelector('[data-payment-methods]')).not.toBeNull()
    expect(document.querySelector('[data-advance-order]')).not.toBeNull()
    expect(screen.getByText(/Text me updates and offers from Island Silog/)).toBeInTheDocument()
    expect(screen.getByText('Your order will be sent to the restaurant for confirmation')).toBeInTheDocument()
  })

  it('places the order only through the place-order block', () => {
    const checkout = makeCheckout()
    renderDesign(checkout)
    // Choosing an order type or a payment method never submits.
    fireEvent.click(screen.getByRole('button', { name: /Delivery/ }))
    fireEvent.click(screen.getByRole('radio', { name: /^Cash$/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to cart' }))
    expect(checkout.router.push).toHaveBeenCalledWith('/sample/cart')
    expect(checkout.handleProceedToPayment).not.toHaveBeenCalled()

    const placeOrder = document.querySelector('[data-branding-scope="checkout/place-order"]') as HTMLButtonElement
    fireEvent.click(placeOrder)
    expect(checkout.handleProceedToPayment).toHaveBeenCalledTimes(1)
  })

  it('keeps the button disabled while processing or below the minimum', () => {
    renderDesign(makeCheckout({ isProcessing: true }))
    const button = document.querySelector('[data-branding-scope="checkout/place-order"]') as HTMLButtonElement
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('Processing Order...')
  })

  it('renders nothing for required blocks that don’t apply', () => {
    renderDesign(makeCheckout({ shouldAskFulfillment: false, advanceConfig: { enabled: false, allowAsap: true, leadTimeMinutes: 0 }, govSetup: null }))
    expect(screen.queryByText('How would you like to receive your order?')).toBeNull()
    expect(screen.queryByText('When would you like it?')).toBeNull()
    expect(screen.queryByText(/Senior Citizen or PWD/)).toBeNull()
    // The rest of the page is still there.
    expect(screen.getByText('Order Summary')).toBeInTheDocument()
  })

  it('shows the voucher and Senior/PWD fields once — in their own blocks, not the summary', () => {
    renderDesign(makeCheckout())
    expect(screen.getAllByLabelText('Have a voucher?')).toHaveLength(1)
    expect(screen.getAllByText(/Show your ID at the counter/)).toHaveLength(1)
    const summary = document.querySelector('[data-branding-scope="checkout/summary"]') as HTMLElement
    expect(within(summary).queryByLabelText('Have a voucher?')).toBeNull()
    expect(within(summary).queryByText(/Show your ID/)).toBeNull()
  })

  it('uses the owner’s wording, then the store label, then the default', () => {
    const design = createStandardDesign('checkout')
    const reworded: HeroDesignV5 = {
      ...design,
      sections: design.sections.map((s) => ({
        ...s,
        columns: s.columns.map((c) => ({
          ...c,
          widgets: c.widgets.map((w) =>
            w.content.kind === 'page-block' && w.content.block === 'checkout.place_order'
              ? { ...w, content: { ...w.content, texts: { footer: 'Salamat, {store}!' } } }
              : w,
          ),
        })),
      })),
    }
    renderDesign(makeCheckout(), reworded, { labels: { 'checkout.total': 'Babayaran' } })
    expect(screen.getByText('Salamat, Island Silog!')).toBeInTheDocument()
    expect(screen.getByText('Babayaran')).toBeInTheDocument()
  })

  it('renders every template with a live checkout', () => {
    for (const template of PAGE_TEMPLATES.checkout) {
      const { unmount } = renderDesign(makeCheckout(), template.build())
      expect(document.querySelectorAll('[data-branding-scope="checkout/place-order"]')).toHaveLength(1)
      expect(document.querySelectorAll('[data-payment-methods]')).toHaveLength(1)
      unmount()
    }
  })
})

describe('checkout editor samples', () => {
  it('render every block with sample data and inert buttons', () => {
    render(
      <PageRuntimeProvider value={runtime({ blocks: CHECKOUT_SAMPLE_BLOCKS })}>
        <HeroBuilderRenderer design={createStandardDesign('checkout')} isEditor />
      </PageRuntimeProvider>,
    )
    expect(screen.getByText('Chicken Adobo Rice Bowl')).toBeInTheDocument()
    expect(screen.getByText('GCash')).toBeInTheDocument()
    expect(screen.getByText('Pickup')).toBeInTheDocument()
    expect(screen.getByTestId('loyalty-progress-panel')).toBeInTheDocument()
    expect(screen.queryByText(/shows here/)).toBeNull()
  })
})

describe('DesignedCheckout (storefront)', () => {
  it('renders the published design with {store} and {total} filled in, submitting only via the hook', () => {
    // Imported here: next/jest leaves static imports ahead of jest.mock.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DesignedCheckout } = require('@/components/page-designer/checkout/designed-checkout') as typeof import('@/components/page-designer/checkout/designed-checkout')
    const order = PAGE_TEMPLATES.checkout.find((t) => t.id === 'order-first')!
    const checkout = makeCheckout()
    render(<DesignedCheckout design={order.build()} checkout={checkout} />)
    expect(screen.getByText('Here’s your order from Island Silog. Add your details and choose how to pay.')).toBeInTheDocument()
    fireEvent.click(document.querySelector('[data-branding-scope="checkout/place-order"]') as HTMLButtonElement)
    expect(checkout.handleProceedToPayment).toHaveBeenCalledTimes(1)
  })
})
