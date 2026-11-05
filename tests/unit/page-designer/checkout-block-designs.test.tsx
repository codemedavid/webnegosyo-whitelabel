/**
 * Checkout block designs: every design of every block renders from the live
 * checkout, choosing still calls the hook's own setter, the place-order
 * button still submits (and stays disabled while sending or under the
 * minimum) in every shape, the tucked-away voucher stays reachable, an
 * invalid stored design reads as the first one, and a block's colour knob
 * paints only that block.
 */

import { fireEvent, render, screen, within } from '@testing-library/react'

import { HeroBuilderRenderer } from '@/components/hero-builder/renderer/hero-builder-renderer'
import { PageRuntimeProvider, type PageRuntime } from '@/components/hero-builder/renderer/page-runtime'
import { CheckoutBlocksProvider } from '@/components/page-designer/checkout/checkout-blocks-context'
import { CHECKOUT_LIVE_BLOCKS } from '@/components/page-designer/checkout/checkout-live-blocks'
import { buildSampleCheckout } from '@/components/page-designer/checkout/sample-checkout'
import { CHECKOUT_BLOCKS } from '@/lib/page-designer/blocks-checkout'
import { pageDesignProblem } from '@/lib/page-designer/rules'
import { createStandardDesign } from '@/lib/page-designer/standard-designs'
import type { HeroDesignV5, PageBlockContent } from '@/lib/hero-builder/types'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }))

jest.mock('@/hooks/use-loyalty-progress', () => ({
  useLoyaltyProgress: () => ({ offer: null, card: null, isLoading: false, error: null, refresh: jest.fn() }),
}))

function makeCheckout(overrides: Record<string, unknown> = {}): UseCheckoutReturn {
  return {
    ...buildSampleCheckout(null, 'Island Silog'),
    router: { push: jest.fn(), back: jest.fn() },
    setOrderType: jest.fn(),
    setScheduleMode: jest.fn(),
    setSelectedPaymentMethod: jest.fn(),
    setCustomerData: jest.fn(),
    applyVoucherCode: jest.fn(async () => undefined),
    handleProceedToPayment: jest.fn(),
    ...overrides,
  } as unknown as UseCheckoutReturn
}

const runtime: PageRuntime = {
  page: 'checkout',
  state: null,
  tokens: { store: 'Island Silog', total: '₱485.00' },
  labels: {},
  blocks: CHECKOUT_LIVE_BLOCKS,
}

/** The standard checkout with `options` on each listed block. */
function withOptions(byBlock: Record<string, Record<string, string | boolean>>): HeroDesignV5 {
  const design = createStandardDesign('checkout')
  return {
    ...design,
    sections: design.sections.map((s) => ({
      ...s,
      columns: s.columns.map((c) => ({
        ...c,
        widgets: c.widgets.map((w) => {
          const content = w.content as PageBlockContent
          const options = w.kind === 'page-block' ? byBlock[content.block] : undefined
          return options ? { ...w, content: { ...content, options } } : w
        }),
      })),
    })),
  } as HeroDesignV5
}

function renderDesign(checkout: UseCheckoutReturn, design: HeroDesignV5 = createStandardDesign('checkout')) {
  return render(
    <PageRuntimeProvider value={runtime}>
      <CheckoutBlocksProvider value={{ checkout }}>
        <HeroBuilderRenderer design={design} />
      </CheckoutBlocksProvider>
    </PageRuntimeProvider>,
  )
}

/** Every design value a block offers (the `variant` knob), first = standard. */
function designsOf(blockId: string): string[] {
  const def = CHECKOUT_BLOCKS.find((b) => b.id === blockId)
  const knob = def?.options.find((o) => o.key === 'variant')
  return knob && knob.type === 'choice' ? knob.choices.map((c) => c.value) : []
}

/** The page's markup without per-render ids (React useId, the renderer's scope class). */
function markup(checkout: UseCheckoutReturn, design?: HeroDesignV5): string {
  const { container, unmount } = renderDesign(checkout, design)
  const html = container.innerHTML.replace(/hb-r\d+/g, 'hb-r').replace(/[«:]r[0-9a-z]+[»:]/g, 'rid')
  unmount()
  return html
}

const placeOrder = () => document.querySelector('[data-branding-scope="checkout/place-order"]') as HTMLButtonElement

describe('checkout block registry knobs', () => {
  it('gives every checkout block except the stamp card a design or its own colours', () => {
    for (const def of CHECKOUT_BLOCKS) {
      if (def.id === 'checkout.loyalty') continue
      expect(def.options.some((o) => o.key === 'variant' || o.type === 'color')).toBe(true)
    }
  })

  it('keeps keys storable and within the per-block limit', () => {
    for (const def of CHECKOUT_BLOCKS) {
      expect(def.options.length).toBeLessThanOrEqual(24)
      const keys = def.options.map((o) => o.key)
      expect(new Set(keys).size).toBe(keys.length)
      for (const option of def.options) {
        expect(option.key).toMatch(/^[a-z0-9_]{1,40}$/)
        if (option.type === 'color') expect(option.key).toMatch(/^color_/)
      }
    }
  })

  it('publishes every design of every block', () => {
    for (const def of CHECKOUT_BLOCKS) {
      for (const variant of designsOf(def.id)) {
        expect(pageDesignProblem(withOptions({ [def.id]: { variant } }), 'checkout')).toBeNull()
      }
    }
  })
})

describe('the standard look is untouched', () => {
  it('renders the same page with every knob at its default as with no knobs at all', () => {
    const plain = markup(makeCheckout())
    const defaults = Object.fromEntries(
      CHECKOUT_BLOCKS.map((def) => [def.id, Object.fromEntries(def.options.map((o) => [o.key, o.default]))]),
    )
    expect(markup(makeCheckout(), withOptions(defaults))).toBe(plain)
  })

  it('reads an invalid stored design as the first one', () => {
    const plain = markup(makeCheckout())
    const broken = Object.fromEntries(CHECKOUT_BLOCKS.map((def) => [def.id, { variant: 'carousel', corners: 'blob' }]))
    expect(markup(makeCheckout(), withOptions(broken))).toBe(plain)
  })
})

describe('every design keeps the block working', () => {
  it.each(designsOf('checkout.header'))('header %s: back to cart', (variant) => {
    const checkout = makeCheckout()
    renderDesign(checkout, withOptions({ 'checkout.header': { variant } }))
    expect(screen.getByRole('heading', { name: 'Checkout', level: 1 })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to cart' }))
    expect(checkout.router.push).toHaveBeenCalledWith('/sample/cart')
  })

  it.each(designsOf('checkout.store_closed'))('store closed %s: says when it opens', (variant) => {
    const openStatus = { isOpen: false, isOrderingBlocked: true, reason: 'after_close', nextOpenLabel: 'tomorrow at 9:00 AM', closesAt: null }
    renderDesign(makeCheckout({ openStatus }), withOptions({ 'checkout.store_closed': { variant } }))
    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent('Ordering is currently closed')
    expect(notice).toHaveTextContent('Opens tomorrow at 9:00 AM')
  })

  it.each(designsOf('checkout.schedule'))('schedule %s: now or later calls the hook', (variant) => {
    const checkout = makeCheckout()
    renderDesign(checkout, withOptions({ 'checkout.schedule': { variant } }))
    const when = screen.getByRole('radiogroup', { name: 'When' })
    expect(within(when).getByRole('radio', { name: /As soon as possible/ })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(within(when).getByRole('radio', { name: /Schedule for later/ }))
    expect(checkout.setScheduleMode).toHaveBeenCalledWith('scheduled')
  })

  it.each(designsOf('checkout.customer'))('customer %s: typing still fills the details', (variant) => {
    const checkout = makeCheckout()
    renderDesign(checkout, withOptions({ 'checkout.customer': { variant } }))
    fireEvent.change(screen.getByLabelText(/Notes for the kitchen/), { target: { value: 'No onions' } })
    expect(checkout.setCustomerData).toHaveBeenCalled()
  })

  it.each(designsOf('checkout.summary'))('summary %s: lines and the total', (variant) => {
    renderDesign(makeCheckout(), withOptions({ 'checkout.summary': { variant } }))
    const summary = document.querySelector('[data-branding-scope="checkout/summary"]') as HTMLElement
    expect(within(summary).getByText('Chicken Adobo Rice Bowl')).toBeInTheDocument()
    expect(within(summary).getByText('Total')).toBeInTheDocument()
    expect(within(summary).getAllByText('₱485.00').length).toBeGreaterThan(0)
  })

  it.each(designsOf('checkout.voucher'))('voucher %s: a code can always be applied', (variant) => {
    const checkout = makeCheckout()
    renderDesign(checkout, withOptions({ 'checkout.voucher': { variant } }))
    if (variant !== 'field') {
      expect(screen.queryByPlaceholderText('Enter code')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: /Have a voucher\?/ }))
    }
    const input = screen.getByPlaceholderText('Enter code')
    fireEvent.change(input, { target: { value: 'save10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(checkout.applyVoucherCode).toHaveBeenCalledWith('SAVE10')
  })

  it('tucked-away voucher stays open while a code is on the order', () => {
    renderDesign(makeCheckout({ voucherCodes: ['SAVE10'] }), withOptions({ 'checkout.voucher': { variant: 'tucked' } }))
    expect(screen.getByPlaceholderText('Enter code')).toBeInTheDocument()
    expect(screen.getByText('SAVE10')).toBeInTheDocument()
  })

  it.each(designsOf('checkout.payment'))('payment %s: choosing calls the hook, the chosen method shows its details', (variant) => {
    const checkout = makeCheckout()
    renderDesign(checkout, withOptions({ 'checkout.payment': { variant } }))
    expect(document.querySelector('[data-payment-methods]')).not.toBeNull()
    expect(screen.getByRole('radio', { name: /GCash/ })).toBeChecked()
    expect(screen.getByText('Pay with GCash')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: /^Cash$/ }))
    expect(checkout.setSelectedPaymentMethod).toHaveBeenCalledWith('sample-cash')
    expect(checkout.handleProceedToPayment).not.toHaveBeenCalled()
  })

  describe.each(designsOf('checkout.place_order'))('place order %s', (variant) => {
    it.each([
      { size: 'regular', width: 'full' },
      { size: 'large', width: 'auto' },
    ])('submits through the hook ($size, $width)', (look) => {
      const checkout = makeCheckout()
      renderDesign(checkout, withOptions({ 'checkout.place_order': { variant, ...look } }))
      fireEvent.click(placeOrder())
      expect(checkout.handleProceedToPayment).toHaveBeenCalledTimes(1)
    })

    it('is disabled while sending', () => {
      renderDesign(makeCheckout({ isProcessing: true }), withOptions({ 'checkout.place_order': { variant, size: 'large', width: 'auto' } }))
      expect(placeOrder()).toBeDisabled()
      expect(placeOrder()).toHaveTextContent('Processing Order...')
    })

    it('is disabled under the minimum, with the notice', () => {
      const orderMinimum = { meets: false, minimum: 500, shortfall: 15 }
      renderDesign(makeCheckout({ orderMinimum }), withOptions({ 'checkout.place_order': { variant } }))
      expect(placeOrder()).toBeDisabled()
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })
})

describe('block colours', () => {
  const varOn = (el: Element | null, name: string) => (el?.closest('[style*="--co-accent"]') as HTMLElement | null)?.style.getPropertyValue(name)

  it('paints only the block whose colour was set', () => {
    renderDesign(makeCheckout(), withOptions({ 'checkout.payment': { color_accent: '#123456' } }))
    const payment = document.querySelector('[data-payment-methods]')
    expect(varOn(payment, '--co-accent')).toBe('#123456')
    // The summary next door keeps the store's accent.
    const summary = document.querySelector('[data-branding-scope="checkout/summary"] > div')
    expect(varOn(summary, '--co-accent')).not.toBe('#123456')
  })

  it.each([
    ['checkout.place_order', 'color_button', '--co-button', '#0a7d3b'],
    ['checkout.summary', 'color_summary', '--co-summary', '#fef3c7'],
    ['checkout.header', 'color_text', '--co-text', '#1e293b'],
    ['checkout.customer', 'color_border', '--co-border', '#94a3b8'],
  ])('%s %s sets %s for the block', (blockId, knob, cssVar, hex) => {
    const { container } = renderDesign(makeCheckout(), withOptions({ [blockId]: { [knob]: hex } }))
    const painted = [...container.querySelectorAll<HTMLElement>('[style]')].some((el) => el.style.getPropertyValue(cssVar) === hex)
    expect(painted).toBe(true)
  })
})
