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

/** Only the order-type block, with `options` (the `label_*` / `desc_*` keys are its wording). */
function orderTypeDesign(settings: Record<string, unknown>): HeroDesignV5 {
  const isText = (key: string) => /^(label|desc)_/.test(key)
  const options = Object.fromEntries(Object.entries(settings).filter(([key]) => !isText(key)))
  const texts = Object.fromEntries(Object.entries(settings).filter(([key]) => isText(key)))
  const design = createStandardDesign('checkout')
  return {
    ...design,
    sections: design.sections.map((s) => ({
      ...s,
      columns: s.columns.map((c) => ({
        ...c,
        widgets: c.widgets
          .filter((w) => (w.content as PageBlockContent).block === 'checkout.order_type')
          .map((w) => ({ ...w, content: { ...(w.content as PageBlockContent), options, texts } })),
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

/** The first seven designs are pressed buttons; the v3 designs are radios. */
const choice = (name: RegExp) => screen.queryByRole('button', { name }) ?? screen.getByRole('radio', { name })
const isChosen = (el: HTMLElement) => el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-checked') === 'true'

const V3_DESIGNS = ORDER_TYPE_DESIGNS.slice(ORDER_TYPE_DESIGNS.indexOf('tabs'))

const DINE_IN = { id: 'sample-dine-in', name: 'Dine-in', type: 'dine_in', description: 'Eat here with us', advance_order_enabled: false }

/** The sample checkout with a third way (dine-in) first. */
function threeWays(setOrderType = jest.fn()): UseCheckoutReturn {
  const checkout = makeCheckout(setOrderType)
  return { ...checkout, orderTypes: [DINE_IN, ...checkout.orderTypes] } as unknown as UseCheckoutReturn
}

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
    expect(isChosen(choice(/Pickup/))).toBe(true)
    expect(isChosen(choice(/Delivery/))).toBe(false)
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

describe('v3 order type designs', () => {
  it('appends the six new designs after the first seven, so stored values keep their meaning', () => {
    expect(ORDER_TYPE_DESIGNS.slice(0, 7)).toEqual(['tiles', 'segmented', 'list', 'cards', 'buttons', 'chips', 'photo'])
    expect(V3_DESIGNS).toEqual(['tabs', 'switch', 'expanding', 'swipe', 'ticket', 'doors'])
  })

  it.each(V3_DESIGNS)('%s is a radio group with one tab stop on the chosen way', (design) => {
    renderOrderType({ variant: design })
    const group = screen.getByRole('radiogroup', { name: 'Order type' })
    const radios = within(group).getAllByRole('radio')
    expect(radios).toHaveLength(2)
    expect(within(group).getByRole('radio', { name: /Pickup/ })).toHaveAttribute('aria-checked', 'true')
    expect(within(group).getByRole('radio', { name: /Delivery/ })).toHaveAttribute('aria-checked', 'false')
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1])
  })

  it.each(V3_DESIGNS.filter((d) => d !== 'switch'))('%s lists all three ways and picks each one', (design) => {
    const setOrderType = jest.fn()
    renderOrderType({ variant: design }, threeWays(setOrderType))
    for (const [name, id] of [[/Dine-in/, 'sample-dine-in'], [/Pickup/, 'sample-pickup'], [/Delivery/, 'sample-delivery']] as const) {
      fireEvent.click(screen.getByRole('radio', { name }))
      expect(setOrderType).toHaveBeenLastCalledWith(id)
    }
  })

  it.each(V3_DESIGNS)('%s moves the choice with the arrow keys', (design) => {
    const setOrderType = jest.fn()
    renderOrderType({ variant: design }, makeCheckout(setOrderType))
    const group = screen.getByRole('radiogroup', { name: 'Order type' })
    fireEvent.keyDown(group, { key: 'ArrowRight' })
    expect(setOrderType).toHaveBeenLastCalledWith('sample-delivery')
    fireEvent.keyDown(group, { key: 'ArrowLeft' })
    expect(setOrderType).toHaveBeenLastCalledWith('sample-delivery')
    fireEvent.keyDown(group, { key: 'Home' })
    expect(setOrderType).toHaveBeenLastCalledWith('sample-pickup')
  })

  it('falls back to the standard tiles when the switch would not have exactly two ways', () => {
    const { container } = renderOrderType({ variant: 'switch' }, threeWays())
    expect(screen.queryByRole('radiogroup')).toBeNull()
    const grid = container.querySelector('.grid.grid-cols-3')
    expect(within(grid as HTMLElement).getAllByRole('button')).toHaveLength(3)
  })

  it('shows only the chosen card’s details in the expanding design', () => {
    renderOrderType({ variant: 'expanding' })
    expect(within(screen.getByRole('radio', { name: /Pickup/ })).getByText('Pick it up at the counter')).toBeInTheDocument()
    expect(screen.getByText('Pick it up at the counter')).toBeInTheDocument()
    expect(screen.queryByText('We bring it to you')).toBeNull()
  })

  it('never lets a switched-off way be picked', () => {
    const setOrderType = jest.fn()
    const checkout = threeWays(setOrderType)
    const off = { ...checkout, orderTypes: checkout.orderTypes.map((ot) => (ot.id === 'sample-dine-in' ? { ...ot, is_enabled: false } : ot)) }
    renderOrderType({ variant: 'ticket' }, off as unknown as UseCheckoutReturn)
    expect(screen.getByRole('radio', { name: /Dine-in/ })).toBeDisabled()
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'End' })
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'Home' })
    expect(setOrderType).not.toHaveBeenCalledWith('sample-dine-in')
  })

  it('draws page dots for the swipe cards, one per way', () => {
    const { container } = renderOrderType({ variant: 'swipe' }, threeWays())
    const dots = container.querySelectorAll('[aria-hidden="true"].justify-center > span')
    expect(dots).toHaveLength(3)
  })

  it('stamps the chosen ticket only', () => {
    renderOrderType({ variant: 'ticket' })
    expect(within(screen.getByRole('radio', { name: /Pickup/ })).getByText('Picked')).toBeInTheDocument()
    expect(within(screen.getByRole('radio', { name: /Delivery/ })).queryByText('Picked')).toBeNull()
  })
})

describe('per-type wording and icons', () => {
  const wording = { label_pickup: 'Grab & go', desc_pickup: 'Ready at the window', icon_pickup: 'ShoppingBag' }

  it.each(ORDER_TYPE_DESIGNS.filter((d) => d !== 'chips'))('%s shows the block’s own name and details', (design) => {
    renderOrderType({ variant: design, ...wording })
    expect(choice(/Grab & go/)).toBeInTheDocument()
    expect(screen.queryByText('Pickup')).toBeNull()
    if (!['chips', 'photo', 'tiles'].includes(design)) expect(screen.getByText('Ready at the window')).toBeInTheDocument()
  })

  it('renames the chip too', () => {
    renderOrderType({ variant: 'chips', ...wording })
    expect(choice(/Grab & go/)).toBeInTheDocument()
  })

  it('keeps the store’s own name and details while the slots are blank', () => {
    renderOrderType({ variant: 'list', label_pickup: '   ' })
    expect(choice(/Pickup/)).toBeInTheDocument()
    expect(screen.getByText('Pick it up at the counter')).toBeInTheDocument()
  })

  it('draws the picked icon in place of the kind’s own', () => {
    const { container, unmount } = renderOrderType({ variant: 'list' })
    const before = container.querySelector('[data-part="icon"] svg')?.getAttribute('class')
    unmount()
    const { container: after } = renderOrderType({ variant: 'list', icon_pickup: 'ShoppingBag' })
    const picked = after.querySelector('[data-part="icon"] svg')?.getAttribute('class')
    expect(before).toMatch(/lucide-package/)
    expect(picked).toMatch(/lucide-shopping-bag/)
  })

  it('ignores an icon that is not offered for that kind', () => {
    const { container } = renderOrderType({ variant: 'list', icon_pickup: 'Bike' })
    expect(container.querySelector('[data-part="icon"] svg')?.getAttribute('class')).toMatch(/lucide-package/)
  })

  it('never renames the order type itself (only this block)', () => {
    const checkout = makeCheckout()
    renderOrderType({ variant: 'list', ...wording }, checkout)
    expect(checkout.orderTypes.find((ot) => ot.id === 'sample-pickup')?.name).toBe('Pickup')
  })

  it('offers name and details slots for the three core ways, blank by default', () => {
    const def = pageBlockDef('checkout', 'checkout.order_type')!
    const slots = def.texts.filter((t) => /^(label|desc)_/.test(t.key))
    expect(slots.map((t) => t.key)).toEqual(['label_dine_in', 'desc_dine_in', 'label_pickup', 'desc_pickup', 'label_delivery', 'desc_delivery'])
    expect(slots.every((t) => t.fallback === '')).toBe(true)
    const icons = def.options.filter((o) => o.key.startsWith('icon_') && o.key !== 'icon_style')
    expect(icons.map((o) => [o.key, o.default])).toEqual([['icon_dine_in', 'auto'], ['icon_pickup', 'auto'], ['icon_delivery', 'auto']])
  })
})
