/**
 * Thank-you page block designs, shapes and colours (Page Designer only).
 * Every design says the same thing for a sent and a failed order, every
 * button still does its job, a stored design the block doesn't know renders
 * the first design, and a block colour re-publishes that block's `--co-*`.
 */

import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactElement } from 'react'

import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import type { CompletedOrderData } from '@/lib/checkout/completed-order'
import type { HeroDesignV5 } from '@/lib/hero-builder/types'
import { CONFIRMATION_BLOCKS } from '@/lib/page-designer/blocks-confirmation'
import { isPageBlockWidget } from '@/lib/page-designer/design-blocks'
import { createStandardDesign } from '@/lib/page-designer/standard-designs'
import type { CartItem } from '@/types/database'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

// next/jest leaves static imports ahead of jest.mock: load the components lazily.
/* eslint-disable @typescript-eslint/no-require-imports -- lazy on purpose, see above */
const load = () => ({
  ...(require('@/components/customer/checkout-templates/checkout-shared') as typeof import('@/components/customer/checkout-templates/checkout-shared')),
  ...(require('@/components/hero-builder/renderer/hero-builder-renderer') as typeof import('@/components/hero-builder/renderer/hero-builder-renderer')),
  ...(require('@/components/hero-builder/renderer/page-runtime') as typeof import('@/components/hero-builder/renderer/page-runtime')),
  ...(require('@/components/page-designer/samples/confirmation-samples') as typeof import('@/components/page-designer/samples/confirmation-samples')),
})
/* eslint-enable @typescript-eslint/no-require-imports */

const ORDER: CompletedOrderData = {
  items: [
    { id: 'l1', menu_item: { id: 'm1', name: 'Sisig', price: 200 }, selected_variation: { id: 'v1', name: 'Large', price_modifier: 0 }, selected_addons: [{ id: 'a1', name: 'Egg', price: 15, quantity: 1 }], quantity: 1, subtotal: 215, special_instructions: 'extra spicy' },
  ] as unknown as CartItem[],
  total: 215,
  deliveryFee: 50,
  serviceChargeAmount: 0,
  discounts: [{ code: 'SAVE10', label: 'SAVE10', amount: 20 }] as CompletedOrderData['discounts'],
  customerData: { customer_name: 'Maria Clara Santos', customer_phone: '0917 123 4567' },
  orderTypeName: 'Pickup',
  scheduledForLabel: null,
  paymentMethodName: 'GCash',
  paymentMethodDetails: '0917 000 0000',
  messengerMessage: 'Order: 1x Sisig',
  messengerUrl: 'https://m.me/lolas',
  formFields: [{ field_name: 'customer_name', field_label: 'Name' }, { field_name: 'customer_phone', field_label: 'Phone' }],
}

const FAILED = {
  orderSaveFailed: true,
  orderSaveNotice: { verdict: 'failed', message: 'We could not confirm your order with the store.', isMessengerRecoverable: true },
  trackingOrderId: null,
}

/** The standard thank-you design with block options set per block id. */
function withOptions(options: Record<string, Record<string, string | boolean>>): HeroDesignV5 {
  const design = createStandardDesign('confirmation')
  return {
    ...design,
    sections: design.sections.map((s) => ({
      ...s,
      columns: s.columns.map((c) => ({
        ...c,
        widgets: c.widgets.map((w) =>
          isPageBlockWidget(w) && options[w.content.block] ? { ...w, content: { ...w.content, options: options[w.content.block] } } : w,
        ),
      })),
    })),
  }
}

const router = { push: jest.fn(), replace: jest.fn() }

function checkoutWith(design: HeroDesignV5, overrides: Partial<Record<keyof UseCheckoutReturn, unknown>> = {}): UseCheckoutReturn {
  return {
    tenant: {
      id: 't-1', slug: 'lolas', name: 'Lola’s Kitchen',
      confirmation_design_enabled: true,
      confirmation_design: JSON.stringify(design),
    },
    branding: undefined,
    completedOrderData: ORDER,
    redirectCountdown: 0,
    trackingOrderId: 'order-1',
    trackingToken: 'tok-1',
    messageExpanded: false,
    setMessageExpanded: jest.fn(),
    router,
    tenantSlug: 'lolas',
    messengerEnabled: false,
    isKiosk: false,
    kioskCountdown: null,
    orderSaveFailed: false,
    orderSaveNotice: null,
    ...overrides,
  } as unknown as UseCheckoutReturn
}

const renderPage = (design: HeroDesignV5, overrides: Partial<Record<keyof UseCheckoutReturn, unknown>> = {}) => {
  const { CheckoutConfirmation } = load()
  return render(<CheckoutConfirmation checkout={checkoutWith(design, overrides)} />)
}

function designsOf(blockId: string): string[] {
  const def = CONFIRMATION_BLOCKS.find((d) => d.id === blockId)!
  const variant = def.options.find((o) => o.key === 'variant')
  return variant?.type === 'choice' ? variant.choices.map((c) => c.value) : []
}

beforeEach(() => jest.clearAllMocks())

describe('status designs', () => {
  it.each(designsOf('confirmation.status'))('%s says "Order Placed!" with its message', (variant) => {
    renderPage(withOptions({ 'confirmation.status': { variant } }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Order Placed!')
    expect(screen.getByText('Your order has been sent to Lola’s Kitchen')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each(designsOf('confirmation.status'))('%s keeps the not-confirmed title, message and help', (variant) => {
    renderPage(withOptions({ 'confirmation.status': { variant } }), FAILED)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Order Not Confirmed')
    expect(screen.getByText('We could not reach Lola’s Kitchen with this order.')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/contact the store directly/)
    expect(screen.queryByText('Order Placed!')).not.toBeInTheDocument()
  })

  it('a refused order keeps the store’s own reason in every design', () => {
    for (const variant of designsOf('confirmation.status')) {
      const { unmount } = renderPage(withOptions({ 'confirmation.status': { variant } }), {
        ...FAILED,
        orderSaveNotice: { verdict: 'refused', message: 'Sisig just sold out.', isMessengerRecoverable: false },
      })
      expect(screen.getByRole('alert')).toHaveTextContent('Sisig just sold out.')
      expect(screen.getByRole('alert')).toHaveTextContent(/Nothing has been sent to the store/)
      unmount()
    }
  })
})

describe('actions designs', () => {
  it.each(designsOf('confirmation.actions'))('%s: Track goes to tracking and Back to the menu', (variant) => {
    renderPage(withOptions({ 'confirmation.actions': { variant, button_shape: 'square' } }))
    fireEvent.click(screen.getByRole('button', { name: /Track Your Order/ }))
    expect(router.push).toHaveBeenCalledWith('/lolas/order/order-1?t=tok-1')
    fireEvent.click(screen.getByRole('button', { name: /Back to Menu/ }))
    expect(router.push).toHaveBeenCalledWith('/lolas/menu')
  })

  it.each(designsOf('confirmation.actions'))('%s: a failed order has no Track button, Back still works', (variant) => {
    renderPage(withOptions({ 'confirmation.actions': { variant } }), FAILED)
    expect(screen.queryByRole('button', { name: /Track Your Order/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Back to Menu/ }))
    expect(router.push).toHaveBeenCalledWith('/lolas/menu')
  })

  it.each(designsOf('confirmation.actions'))('%s: on a kiosk, Start a New Order returns to the kiosk menu', (variant) => {
    renderPage(withOptions({ 'confirmation.actions': { variant, button_shape: 'rounded' } }), { isKiosk: true, kioskCountdown: 4 })
    expect(screen.getByText('4s')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Start a New Order/ }))
    expect(router.push).toHaveBeenCalledWith('/lolas/menu?kiosk=1')
  })

  it('button shape changes the corners only', () => {
    renderPage(withOptions({ 'confirmation.actions': { button_shape: 'square' } }))
    expect(screen.getByRole('button', { name: /Track Your Order/ }).className).toContain('rounded-none')
    expect(screen.getByRole('button', { name: /Track Your Order/ }).className).not.toContain('rounded-full')
  })
})

describe('order cards', () => {
  it.each(designsOf('confirmation.summary'))('summary %s lists the dish, its details, fees, discount and total', (variant) => {
    for (const overrides of [{}, FAILED]) {
      const { container, unmount } = renderPage(withOptions({ 'confirmation.summary': { variant } }), overrides)
      const text = container.textContent ?? ''
      for (const part of ['Sisig', 'Large', 'Add-ons: Egg', 'Note: extra spicy', 'Delivery Fee', '₱50.00', 'SAVE10', '-₱20.00', 'Total', '₱245.00', 'Pickup']) {
        expect(text).toContain(part)
      }
      unmount()
    }
  })

  it.each(designsOf('confirmation.customer'))('customer + payment %s show what was filled in', (variant) => {
    renderPage(withOptions({ 'confirmation.customer': { variant }, 'confirmation.payment': { variant } }))
    expect(screen.getByText('Maria Clara Santos')).toBeInTheDocument()
    expect(screen.getByText('0917 123 4567')).toBeInTheDocument()
    expect(screen.getByText('GCash')).toBeInTheDocument()
    expect(screen.getByText('0917 000 0000')).toBeInTheDocument()
  })

  it('messenger button shape reaches the hand-off buttons', () => {
    renderPage(withOptions({ 'confirmation.messenger': { button_shape: 'square' } }), { messengerEnabled: true })
    expect(screen.getByRole('button', { name: /Go to Messenger/ }).className).toContain('rounded-none')
  })
})

describe('first design and fallbacks', () => {
  const html = (design: HeroDesignV5, overrides = {}) => {
    const { container, unmount } = renderPage(design, overrides)
    // useId prefixes count up across renders; everything else must match.
    const out = container.innerHTML.replace(/hb-r[0-9a-z]+/g, 'hb-id').replace(/«r[0-9a-z]+»|:r[0-9a-z]+:/g, 'id')
    unmount()
    return out
  }

  it.each([{}, FAILED])('the first design + default settings render exactly as a design without them', (overrides) => {
    const plain = html(createStandardDesign('confirmation'), overrides)
    const firsts = withOptions(Object.fromEntries(CONFIRMATION_BLOCKS.map((def) => [
      def.id,
      Object.fromEntries(def.options.map((o) => [o.key, o.default])),
    ])))
    expect(html(firsts, overrides)).toBe(plain)
  })

  it('an unknown stored design or shape renders the first one', () => {
    const plain = html(createStandardDesign('confirmation'))
    const bogus = withOptions(Object.fromEntries(CONFIRMATION_BLOCKS.map((def) => [def.id, { variant: 'neon', button_shape: 'blob', color_text: 'red' }])))
    expect(html(bogus)).toBe(plain)
  })
})

describe('block colours', () => {
  const colorsOf = (el: HTMLElement | null) => el?.closest('[data-block-colors]')?.getAttribute('style') ?? ''

  it('a colour knob re-publishes that block’s --co-* variable, and only that block', () => {
    renderPage(withOptions({ 'confirmation.summary': { color_accent: '#ff0000' } }))
    expect(colorsOf(screen.getByText('Order Summary'))).toMatch(/--co-accent:\s*#ff0000/i)
    expect(colorsOf(screen.getByRole('heading', { level: 1 }))).toBe('')
  })

  it('the banner paints from its own button colour', () => {
    renderPage(withOptions({ 'confirmation.status': { variant: 'banner', color_button: '#123456' } }))
    expect(colorsOf(screen.getByRole('heading', { level: 1 }))).toMatch(/--co-button:\s*#123456/i)
  })

  it('the editor sample previews block colours over the store row', () => {
    const { CONFIRMATION_SAMPLE_BLOCKS, HeroBuilderRenderer, PageRuntimeProvider } = load()
    const design = withOptions({ 'confirmation.actions': { color_button: '#00aa00' } })
    const view: ReactElement = (
      <PageRuntimeProvider value={{ page: 'confirmation', state: 'success', tokens: { store: 'Lola’s' }, labels: {}, blocks: CONFIRMATION_SAMPLE_BLOCKS, store: { name: 'Lola’s' } }}>
        <HeroBuilderRenderer design={design} isEditor />
      </PageRuntimeProvider>
    )
    const { container } = render(view)
    const wrapper = container.querySelector('[data-block-colors]') as HTMLElement
    expect(wrapper.getAttribute('style')).toMatch(/--co-button:\s*#00aa00/i)
    expect(within(wrapper).getByText('Track Your Order')).toBeInTheDocument()
  })
})
