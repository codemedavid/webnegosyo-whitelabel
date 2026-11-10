/**
 * The checkout blocks' "show this part" switches: each one switched off
 * hides exactly its part, and the default (nothing stored) draws the block
 * as it was — except the few parts that never existed before (store name,
 * logo, the secure line), which start off.
 */

import { render, screen } from '@testing-library/react'

import { HeroBuilderRenderer } from '@/components/hero-builder/renderer/hero-builder-renderer'
import { PageRuntimeProvider, type PageRuntime } from '@/components/hero-builder/renderer/page-runtime'
import { CheckoutBlocksProvider } from '@/components/page-designer/checkout/checkout-blocks-context'
import { CHECKOUT_LIVE_BLOCKS } from '@/components/page-designer/checkout/checkout-live-blocks'
import { buildSampleCheckout } from '@/components/page-designer/checkout/sample-checkout'
import { CHECKOUT_BLOCKS } from '@/lib/page-designer/blocks-checkout'
import { createStandardDesign, standardSection } from '@/lib/page-designer/standard-designs'
import type { HeroDesignV5, PageBlockContent } from '@/lib/hero-builder/types'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }))

const runtime: PageRuntime = { page: 'checkout', state: null, tokens: { store: 'Island Silog' }, labels: {}, blocks: CHECKOUT_LIVE_BLOCKS }

const ADDRESS = 'Blk 4 Lot 12, Mabini St'

function makeCheckout(overrides: Record<string, unknown> = {}): UseCheckoutReturn {
  const sample = buildSampleCheckout(null, 'Island Silog') as unknown as Record<string, unknown>
  const [first, second] = sample.items as Record<string, unknown>[]
  return {
    ...sample,
    tenant: { ...(sample.tenant as Record<string, unknown>), logo_url: 'https://ik.imagekit.io/x/logo.png' },
    items: [{ ...first, selected_addons: [{ id: 'egg', name: 'Fried egg', price: 15 }] }, second],
    serviceChargeAmount: 20,
    deliveryFee: 49,
    deliveryFeeAddress: ADDRESS,
    customerData: { ...(sample.customerData as Record<string, string>), delivery_address: ADDRESS },
    freeDeliveryRemaining: 115,
    ...overrides,
  } as unknown as UseCheckoutReturn
}

function soloDesign(blockId: string, options: Record<string, unknown>): HeroDesignV5 {
  const section = standardSection('checkout', [blockId])
  return {
    ...createStandardDesign('checkout'),
    sections: [
      {
        ...section,
        columns: section.columns.map((c) => ({
          ...c,
          widgets: c.widgets.map((w) => ({ ...w, content: { ...(w.content as PageBlockContent), options } })),
        })),
      },
    ],
  } as HeroDesignV5
}

function renderBlock(blockId: string, options: Record<string, unknown> = {}, checkout = makeCheckout()) {
  return render(
    <PageRuntimeProvider value={runtime}>
      <CheckoutBlocksProvider value={{ checkout }}>
        <HeroBuilderRenderer design={soloDesign(blockId, options)} />
      </CheckoutBlocksProvider>
    </PageRuntimeProvider>,
  )
}

const defaultOf = (blockId: string, key: string) => CHECKOUT_BLOCKS.find((b) => b.id === blockId)?.options.find((o) => o.key === key)?.default

describe('page header', () => {
  it('leaves the store name and logo out by default (they were never drawn)', () => {
    const { container } = renderBlock('checkout.header')
    expect(defaultOf('checkout.header', 'show_store_name')).toBe(false)
    expect(defaultOf('checkout.header', 'show_logo')).toBe(false)
    expect(screen.queryByText('Island Silog')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })

  it.each(['standard', 'centered', 'banner', 'compact'])('%s shows the store name and logo when switched on', (variant) => {
    const { container } = renderBlock('checkout.header', { variant, show_store_name: true, show_logo: true })
    expect(screen.getByText('Island Silog')).toBeInTheDocument()
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://ik.imagekit.io/x/logo.png')
  })

  it('never draws an unsafe logo URL', () => {
    const checkout = makeCheckout({ tenant: { name: 'Island Silog', logo_url: 'javascript:alert(1)' } })
    const { container } = renderBlock('checkout.header', { show_logo: true }, checkout)
    expect(container.querySelector('img')).toBeNull()
  })
})

describe('order summary', () => {
  it('shows add-ons, notes, fees and the free-delivery hint by default', () => {
    renderBlock('checkout.summary')
    expect(screen.getByText(/Add-ons: Fried egg/)).toBeInTheDocument()
    expect(screen.getByText('Note: Less ice')).toBeInTheDocument()
    expect(screen.getByText('Delivery Fee')).toBeInTheDocument()
    expect(screen.getByText('Service Charge')).toBeInTheDocument()
    expect(screen.getByText(/more for free delivery/)).toBeInTheDocument()
  })

  it.each([
    ['show_addons', /Add-ons: Fried egg/],
    ['show_notes', /Note: Less ice/],
    ['show_free_hint', /more for free delivery/],
  ] as const)('%s off hides only its row', (key, text) => {
    renderBlock('checkout.summary', { [key]: false })
    expect(screen.queryByText(text)).toBeNull()
    expect(screen.getByText('Subtotal')).toBeInTheDocument()
  })

  it('show_fees off hides the fee rows but the total still includes them', () => {
    renderBlock('checkout.summary', { show_fees: false })
    expect(screen.queryByText('Delivery Fee')).toBeNull()
    expect(screen.queryByText('Service Charge')).toBeNull()
    expect(screen.getByText('Total')).toBeInTheDocument()
  })
})

describe('voucher', () => {
  it('shows the prompt by default and keeps it for screen readers when switched off', () => {
    const { unmount } = renderBlock('checkout.voucher')
    expect(screen.getByText('Have a voucher?')).not.toHaveClass('sr-only')
    unmount()
    renderBlock('checkout.voucher', { show_title: false })
    expect(screen.getByLabelText('Have a voucher?')).toBeInTheDocument()
    expect(screen.getByText('Have a voucher?')).toHaveClass('sr-only')
  })

  it('always shows the prompt in the tucked-away design (it is the link)', () => {
    renderBlock('checkout.voucher', { variant: 'tucked', show_title: false })
    expect(screen.getByRole('button', { name: /Have a voucher\?/ })).toBeInTheDocument()
  })
})

describe('place order', () => {
  const under = { orderMinimum: { meets: false, minimum: 500, shortfall: 15 } }

  it('shows the minimum notice and the footer note by default, no lock line', () => {
    renderBlock('checkout.place_order', {}, makeCheckout(under))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Your order will be sent to the restaurant for confirmation')).toBeInTheDocument()
    expect(screen.queryByText('Secure checkout')).toBeNull()
    expect(defaultOf('checkout.place_order', 'show_secure_line')).toBe(false)
  })

  it('hides the minimum notice but the button still waits for the minimum', () => {
    renderBlock('checkout.place_order', { show_minimum_notice: false }, makeCheckout(under))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: /Place|Order|Proceed|Complete/i })).toBeDisabled()
  })

  it('hides the footer note and adds the lock line when asked', () => {
    renderBlock('checkout.place_order', { show_footer_note: false, show_secure_line: true })
    expect(screen.queryByText('Your order will be sent to the restaurant for confirmation')).toBeNull()
    expect(screen.getByText('Secure checkout')).toBeInTheDocument()
  })
})
