/**
 * The checkout's order-type question in every Page Designer design: each
 * one lists every way to order, picks through the checkout hook, keeps the
 * pre-order chip, and an unknown stored design falls back to the standard
 * tiles. A block's own colour repaints only that block.
 */

import { fireEvent, render, screen, within } from '@testing-library/react'

import { PageRuntimeProvider, type PageRuntime } from '@/components/hero-builder/renderer/page-runtime'
import { HeroBuilderRenderer } from '@/components/hero-builder/renderer/hero-builder-renderer'
import { CheckoutBlocksProvider } from '@/components/page-designer/checkout/checkout-blocks-context'
import { CHECKOUT_LIVE_BLOCKS } from '@/components/page-designer/checkout/checkout-live-blocks'
import { buildSampleCheckout } from '@/components/page-designer/checkout/sample-checkout'
import { ORDER_TYPE_DESIGNS } from '@/components/customer/checkout-templates/order-type-choices'
import { pageBlockDef } from '@/lib/page-designer/blocks'
import { createStandardDesign } from '@/lib/page-designer/standard-designs'
import type { HeroDesignV5, PageBlockContent } from '@/lib/hero-builder/types'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }))
jest.mock('@/hooks/use-loyalty-progress', () => ({
  useLoyaltyProgress: () => ({ offer: null, card: null, isLoading: false, error: null, refresh: jest.fn() }),
}))

const runtime: PageRuntime = { page: 'checkout', state: null, tokens: { store: 'Island Silog', total: '₱485.00' }, labels: {}, blocks: CHECKOUT_LIVE_BLOCKS }

function makeCheckout(setOrderType = jest.fn()): UseCheckoutReturn {
  return { ...buildSampleCheckout(null, 'Island Silog'), setOrderType, handleProceedToPayment: jest.fn() } as unknown as UseCheckoutReturn
}

/** Only the order-type block, with `options`. */
function orderTypeDesign(options: Record<string, unknown>): HeroDesignV5 {
  const design = createStandardDesign('checkout')
  return {
    ...design,
    sections: design.sections.map((s) => ({
      ...s,
      columns: s.columns.map((c) => ({
        ...c,
        widgets: c.widgets
          .filter((w) => (w.content as PageBlockContent).block === 'checkout.order_type')
          .map((w) => ({ ...w, content: { ...(w.content as PageBlockContent), options } })),
      })),
    })),
  } as HeroDesignV5
}

function renderOrderType(options: Record<string, unknown>, checkout = makeCheckout()) {
  // Required blocks missing from this slimmed design are appended by preparePageDesign on the
  // storefront; rendering the bare design keeps the test on this one block.
  return render(
    <PageRuntimeProvider value={runtime}>
      <CheckoutBlocksProvider value={{ checkout }}>
        <HeroBuilderRenderer design={orderTypeDesign(options)} />
      </CheckoutBlocksProvider>
    </PageRuntimeProvider>,
  )
}

const choice = (name: RegExp) => screen.getByRole('button', { name })

describe('order type designs', () => {
  it('offers every design in the block’s gallery, the standard tiles first', () => {
    const def = pageBlockDef('checkout', 'checkout.order_type')
    const variant = def?.options.find((o) => o.key === 'variant')
    expect(variant?.type === 'choice' && variant.choices.map((c) => c.value)).toEqual([...ORDER_TYPE_DESIGNS])
    expect(variant?.default).toBe('tiles')
  })

  it.each(ORDER_TYPE_DESIGNS)('%s lists every way to order and picks through the checkout hook', (design) => {
    const setOrderType = jest.fn()
    renderOrderType({ variant: design }, makeCheckout(setOrderType))
    expect(choice(/Pickup/)).toHaveAttribute('aria-pressed', 'true')
    expect(choice(/Delivery/)).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(choice(/Delivery/))
    expect(setOrderType).toHaveBeenCalledWith('sample-delivery')
  })

  it.each(ORDER_TYPE_DESIGNS)('%s keeps the pre-order mark on the way that takes advance orders', (design) => {
    renderOrderType({ variant: design })
    const pickup = choice(/Pickup/)
    expect(within(pickup).queryByText('Pre-order') ?? within(pickup).queryByLabelText('Pre-order')).not.toBeNull()
    expect(within(choice(/Delivery/)).queryByText('Pre-order')).toBeNull()
  })

  it('shows the descriptions in the list design and hides them when switched off', () => {
    const { unmount } = renderOrderType({ variant: 'list' })
    expect(screen.getByText('Pick it up at the counter')).toBeInTheDocument()
    unmount()
    renderOrderType({ variant: 'list', show_descriptions: false })
    expect(screen.queryByText('Pick it up at the counter')).toBeNull()
  })

  it('shows the chosen way’s details under the pill toggle', () => {
    renderOrderType({ variant: 'segmented' })
    expect(screen.getByText('Pick it up at the counter')).toBeInTheDocument()
    expect(screen.queryByText('We bring it to you')).toBeNull()
  })

  it('draws the owner’s photo on a photo tile and an illustrated tile without one', () => {
    const { container } = renderOrderType({ variant: 'photo', image_pickup: 'https://ik.imagekit.io/x/pickup.jpg' })
    const images = container.querySelectorAll('img')
    expect(images).toHaveLength(1)
    expect(images[0]).toHaveAttribute('src', 'https://ik.imagekit.io/x/pickup.jpg')
  })

  it('never draws an unsafe stored photo URL', () => {
    const { container } = renderOrderType({ variant: 'photo', image_pickup: 'javascript:alert(1)' })
    expect(container.querySelectorAll('img')).toHaveLength(0)
  })

  it('falls back to the standard tiles for an unknown stored design', () => {
    const { container } = renderOrderType({ variant: 'carousel' })
    // The standard tiles: three across, each choice a stacked tile.
    const grid = container.querySelector('.grid.grid-cols-3')
    expect(grid).not.toBeNull()
    expect(within(grid as HTMLElement).getAllByRole('button')).toHaveLength(2)
  })

  it('repaints only this block with its own highlight colour', () => {
    const { container } = renderOrderType({ variant: 'list', color_accent: '#0f766e' })
    const themed = [...container.querySelectorAll<HTMLElement>('[style]')].find((el) => el.style.getPropertyValue('--co-accent'))
    expect(themed?.style.getPropertyValue('--co-accent')).toBe('#0f766e')
  })
})
