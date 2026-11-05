/**
 * The thank-you page with a published Page Designer design: every block
 * renders from the live checkout values, "Show when" follows the save outcome,
 * block wording and tokens apply, the owner's tracking countdown runs and can
 * be stopped, and the editor's samples follow its state switcher.
 */

import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import type { ReactElement } from 'react'

import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import type { CompletedOrderData } from '@/lib/checkout/completed-order'
import type { ConfirmationHandoff } from '@/lib/checkout/tracking-redirect'
import type { HeroDesignV5 } from '@/lib/hero-builder/types'
import { isPageBlockWidget } from '@/lib/page-designer/design-blocks'
import { createStandardDesign } from '@/lib/page-designer/standard-designs'
import { PAGE_TEMPLATES } from '@/lib/page-designer/templates'
import { CONFIRMATION_BLOCKS } from '@/lib/page-designer/blocks-confirmation'
import { confirmationThemeStyle } from '@/components/page-designer/editor/page-theme-confirmation'
import { confirmationGrandTotal, confirmationTokens } from '@/components/page-designer/confirmation/confirmation-runtime'
import { useTrackingCountdown } from '@/components/page-designer/confirmation/use-tracking-countdown'
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
  items: [{ id: 'l1', menu_item: { id: 'm1', name: 'Sisig', price: 200 }, selected_addons: [], quantity: 1, subtotal: 200 }] as unknown as CartItem[],
  total: 200,
  deliveryFee: null,
  serviceChargeAmount: 0,
  discounts: [],
  customerData: { customer_name: 'Maria Clara Santos' },
  orderTypeName: 'Pickup',
  scheduledForLabel: null,
  paymentMethodName: 'GCash',
  paymentMethodDetails: '0917 000 0000',
  messengerMessage: 'Order: 1x Sisig',
  messengerUrl: 'https://m.me/lolas',
  formFields: [{ field_name: 'customer_name', field_label: 'Name' }],
}

function withTexts(design: HeroDesignV5, block: string, texts: Record<string, string>): HeroDesignV5 {
  return {
    ...design,
    sections: design.sections.map((s) => ({
      ...s,
      columns: s.columns.map((c) => ({
        ...c,
        widgets: c.widgets.map((w) => (isPageBlockWidget(w) && w.content.block === block ? { ...w, content: { ...w.content, texts } } : w)),
      })),
    })),
  }
}

const router = { push: jest.fn(), replace: jest.fn() }

function checkoutWith(design: HeroDesignV5 | null, overrides: Partial<Record<keyof UseCheckoutReturn, unknown>> = {}): UseCheckoutReturn {
  return {
    tenant: {
      id: 't-1', slug: 'lolas', name: 'Lola’s Kitchen',
      confirmation_design_enabled: design !== null,
      confirmation_design: design ? JSON.stringify(design) : null,
      storefront_labels: { 'confirmation.title': 'Got it!' },
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

const renderPage = (checkout: UseCheckoutReturn) => {
  const { CheckoutConfirmation } = load()
  return render(<CheckoutConfirmation checkout={checkout} />)
}

beforeEach(() => jest.clearAllMocks())

describe('designed thank-you page', () => {
  it('renders the owner design inside the --co-* themed root with live data and labels', () => {
    const { container } = renderPage(checkoutWith(createStandardDesign('confirmation')))
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('style')).toContain('--co-bg')
    expect(root.querySelector('.hb-root, [data-hb-root], section')).not.toBeNull()
    // The store's Branding Studio label reaches the designed page.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Got it!')
    expect(screen.getByText('Your order has been sent to Lola’s Kitchen')).toBeInTheDocument()
    expect(screen.getByText('Sisig')).toBeInTheDocument()
    expect(screen.getByText('GCash')).toBeInTheDocument()
    expect(screen.queryByText('Go to Messenger')).not.toBeInTheDocument()
  })

  it('applies block wording and tokens', () => {
    const design = withTexts(createStandardDesign('confirmation'), 'confirmation.status', { title: 'Salamat, {name}!', subtitle: '{order_type} · {total}' })
    renderPage(checkoutWith(design))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Salamat, Maria!')
    expect(screen.getByText('Pickup · ₱200.00')).toBeInTheDocument()
  })

  it('shows the failed variant and the recovery notice when the save failed', () => {
    renderPage(checkoutWith(createStandardDesign('confirmation'), {
      orderSaveFailed: true,
      orderSaveNotice: { verdict: 'failed', message: 'We could not confirm your order with the store.', isMessengerRecoverable: true },
      trackingOrderId: null,
    }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Order Not Confirmed')
    expect(screen.getByRole('alert')).toHaveTextContent(/contact the store directly/)
    expect(screen.queryByText('Track Your Order')).not.toBeInTheDocument()
  })

  it('hides "Show when: Order sent" sections on a failed order (Celebrate banner)', () => {
    const celebrate = PAGE_TEMPLATES.confirmation.find((t) => t.id === 'celebrate')!.build()
    const { unmount } = renderPage(checkoutWith(celebrate))
    expect(screen.getByText('Salamat, Maria!')).toBeInTheDocument()
    unmount()
    renderPage(checkoutWith(celebrate, { orderSaveFailed: true, orderSaveNotice: null }))
    expect(screen.queryByText('Salamat, Maria!')).not.toBeInTheDocument()
  })

  it('shows the Messenger hand-off when Messenger is on, and Track order goes to tracking', () => {
    renderPage(checkoutWith(createStandardDesign('confirmation'), { messengerEnabled: true }))
    expect(screen.getByText('Go to Messenger')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Track Your Order'))
    expect(router.push).toHaveBeenCalledWith('/lolas/order/order-1?t=tok-1')
  })

  it('on a kiosk the actions block is the start-a-new-order card and Messenger is gone', () => {
    renderPage(checkoutWith(createStandardDesign('confirmation'), { isKiosk: true, kioskCountdown: 2, messengerEnabled: true }))
    expect(screen.getByText('Start a New Order')).toBeInTheDocument()
    expect(screen.getByText('2s')).toBeInTheDocument()
    expect(screen.queryByText('Go to Messenger')).not.toBeInTheDocument()
    expect(screen.queryByText('Track Your Order')).not.toBeInTheDocument()
  })
})

describe('the owner’s tracking countdown', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  const COUNTDOWN: ConfirmationHandoff = { kind: 'countdown', path: '/lolas/order/order-1?t=tok-1', seconds: 3 }

  it('counts down on the standard page, then replaces it with tracking', () => {
    renderPage(checkoutWith(null, { confirmationHandoff: COUNTDOWN }))
    expect(screen.getByText(/Opening your order tracking in/)).toHaveTextContent('Opening your order tracking in 3s...')
    act(() => { jest.advanceTimersByTime(2000) })
    expect(router.replace).not.toHaveBeenCalled()
    act(() => { jest.advanceTimersByTime(1000) })
    expect(router.replace).toHaveBeenCalledTimes(1)
    expect(router.replace).toHaveBeenCalledWith(COUNTDOWN.path)
  })

  it('"Stay on this page" stops it for good', () => {
    renderPage(checkoutWith(createStandardDesign('confirmation'), { confirmationHandoff: COUNTDOWN }))
    fireEvent.click(screen.getByText('Stay on this page'))
    act(() => { jest.advanceTimersByTime(10_000) })
    expect(router.replace).not.toHaveBeenCalled()
    expect(screen.queryByText(/Opening your order tracking/)).not.toBeInTheDocument()
    expect(screen.getByText('Track Your Order')).toBeInTheDocument()
  })

  it('tapping Back to Menu mid-countdown stops it, so tracking never takes over', () => {
    renderPage(checkoutWith(createStandardDesign('confirmation'), { confirmationHandoff: COUNTDOWN }))
    fireEvent.click(screen.getByText('Back to Menu'))
    act(() => { jest.advanceTimersByTime(10_000) })
    expect(router.push).toHaveBeenCalledWith('/lolas/menu')
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('stay and none never move on by themselves', () => {
    const replace = jest.fn()
    for (const handoff of [{ kind: 'stay', path: '/x' }, { kind: 'none' }, null] as const) {
      const { result, unmount } = renderHook(() => useTrackingCountdown(handoff, replace))
      act(() => { jest.advanceTimersByTime(60_000) })
      expect(result.current).toEqual({ secondsLeft: null, stay: null })
      unmount()
    }
    expect(replace).not.toHaveBeenCalled()
  })
})

describe('editor samples and theme', () => {
  it('every block has a sample, and the status follows the state switcher', () => {
    const { CONFIRMATION_SAMPLE_BLOCKS, HeroBuilderRenderer, PageRuntimeProvider } = load()
    for (const def of CONFIRMATION_BLOCKS) expect(CONFIRMATION_SAMPLE_BLOCKS[def.id]).toBeDefined()
    const view = (state: string): ReactElement => (
      <PageRuntimeProvider value={{ page: 'confirmation', state, tokens: { store: 'Lola’s Kitchen' }, labels: {}, blocks: CONFIRMATION_SAMPLE_BLOCKS }}>
        <HeroBuilderRenderer design={createStandardDesign('confirmation')} isEditor />
      </PageRuntimeProvider>
    )
    const { rerender } = render(view('success'))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Order Placed!')
    expect(screen.getByText('Go to Messenger')).toBeInTheDocument()
    rerender(view('failed'))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Order Not Confirmed')
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('the editor canvas gets the same --co-* variables as the live page', () => {
    const style = confirmationThemeStyle({ name: 'Lola’s' }) as Record<string, string>
    expect(style['--co-bg']).toBeTruthy()
    expect(style['--co-accent']).toBeTruthy()
  })

  it('tokens: first name, order type and the grand total', () => {
    const withFee = { ...ORDER, deliveryFee: 50 }
    expect(confirmationGrandTotal(withFee)).toBe(250)
    expect(confirmationTokens('Lola’s', withFee, 250)).toEqual({ store: 'Lola’s', name: 'Maria', order_type: 'Pickup', total: '₱250.00' })
    expect(confirmationTokens('Lola’s', { ...ORDER, customerData: {}, orderTypeName: null }, 200)).toMatchObject({ name: '', order_type: '' })
  })
})
