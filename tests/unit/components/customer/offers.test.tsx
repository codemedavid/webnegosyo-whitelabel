import { act, fireEvent, render, screen } from '@testing-library/react'
import type { BundleWithSlots, MenuItem } from '@/types/database'
import { NEUTRAL_OFFER_THEME } from '@/components/customer/offers/offer-theme'

const mockAddItem = jest.fn()
const mockPush = jest.fn()
const mockTrack = jest.fn()
jest.mock('@/hooks/useCart', () => ({ useCart: () => ({ addItem: mockAddItem }) }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('@/app/actions/analytics', () => ({ trackAnalyticsEventAction: (...args: unknown[]) => mockTrack(...args) }))
jest.mock('@/hooks/useBodyScrollLock', () => ({ useBodyScrollLock: () => {} }))

const dish = (id: string, name: string, extra: Partial<MenuItem> = {}): MenuItem =>
  ({ id, name, price: 50, is_available: true, image_url: '', variations: [], variation_types: [], addons: [], ...extra }) as MenuItem

beforeEach(() => jest.clearAllMocks())

describe('combosContainingItem', () => {
  it('offers only combos that contain the dish — never the store’s first combo on every product', async () => {
    const { combosContainingItem } = await import('@/components/customer/offers/item-offers')
    const combo = (id: string, itemIds: string[], extra: Partial<BundleWithSlots> = {}) =>
      ({ id, name: id, is_active: true, show_as_upsell: true, slots: [{ id: `${id}-s`, included_item_ids: itemIds }], ...extra }) as unknown as BundleWithSlots
    const combos = [
      combo('burger-meal', ['burger', 'fries']),
      combo('pasta-set', ['pasta']),
      combo('paused', ['burger'], { is_active: false }),
      combo('menu-only', ['burger'], { show_as_upsell: false }),
    ]
    expect(combosContainingItem(combos, 'burger').map((c) => c.id)).toEqual(['burger-meal'])
    expect(combosContainingItem(combos, 'soup')).toEqual([])
  })
})

describe('AddedSheet', () => {
  const baseProps = {
    open: true,
    addedItem: dish('burger', 'Burger'),
    theme: NEUTRAL_OFFER_THEME,
    tenantId: 't1',
    primaryLabel: 'View cart',
    onPrimary: jest.fn(),
    onClose: jest.fn(),
  }

  it('adds a plain suggestion in one tap and marks it added', async () => {
    const { AddedSheet } = await import('@/components/customer/offers/added-sheet')
    const onAdd = jest.fn()
    render(<AddedSheet {...baseProps} suggestions={[dish('coke', 'Coke')]} onAdd={onAdd} onCustomize={jest.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Coke' }))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'coke' }))
    expect(screen.getByRole('button', { name: 'Coke added' })).toBeInTheDocument()
  })

  it('opens a suggestion that needs a size chosen instead of adding it half-configured', async () => {
    const { AddedSheet } = await import('@/components/customer/offers/added-sheet')
    const onAdd = jest.fn()
    const onCustomize = jest.fn()
    const tea = dish('tea', 'Iced Tea', { variations: [{ id: 'l', name: 'Large', price_modifier: 10 }] } as Partial<MenuItem>)
    render(<AddedSheet {...baseProps} suggestions={[tea]} onAdd={onAdd} onCustomize={onCustomize} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Iced Tea' }))
    expect(onAdd).not.toHaveBeenCalled()
    expect(onCustomize).toHaveBeenCalledWith(expect.objectContaining({ id: 'tea' }))
  })

  it('never suggests the dish that was just added, or anything out of stock', async () => {
    const { AddedSheet } = await import('@/components/customer/offers/added-sheet')
    render(
      <AddedSheet
        {...baseProps}
        suggestions={[dish('burger', 'Burger'), dish('fries', 'Fries', { is_available: false }), dish('coke', 'Coke')]}
        onAdd={jest.fn()}
        onCustomize={jest.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: 'Add Burger' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Fries' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Coke' })).toBeInTheDocument()
  })
})

describe('offer layering', () => {
  it('opens the "Added" sheet above the item sheet it is launched from', async () => {
    const { AddedSheet } = await import('@/components/customer/offers/added-sheet')
    const { STOREFRONT_LAYERS } = await import('@/components/customer/overlay-layers')
    render(
      <AddedSheet
        open
        addedItem={dish('bbq', 'Pork BBQ')}
        suggestions={[dish('lumpia', 'Lumpia')]}
        theme={NEUTRAL_OFFER_THEME}
        tenantId="t1"
        primaryLabel="View cart"
        onAdd={jest.fn()}
        onCustomize={jest.fn()}
        onPrimary={jest.fn()}
        onClose={jest.fn()}
      />
    )
    const sheet = screen.getByRole('dialog', { name: 'Added to your order' })
    expect(Number(sheet.style.zIndex)).toBeGreaterThan(STOREFRONT_LAYERS.itemSheet)
  })
})

describe('CartOfferRow', () => {
  it('scrolls inside its own box instead of widening the cart page', async () => {
    const { CartOfferRow } = await import('@/components/customer/offers/cart-offer-row')
    render(
      <CartOfferRow
        title="Before you go"
        items={['a', 'b', 'c', 'd'].map((id) => ({ id, name: id, priceLabel: '₱1' }))}
        addedIds={new Set()}
        theme={NEUTRAL_OFFER_THEME}
        onAdd={jest.fn()}
      />
    )
    // A horizontal scroller's cards otherwise set the min-content width of
    // the cart's grid column, pushing the whole page sideways on phones.
    const scroller = screen.getByRole('button', { name: 'Add a' }).parentElement as HTMLElement
    expect(scroller.style.contain).toBe('inline-size')
  })
})

describe('CartOffersSection', () => {
  const baseProps = {
    maxItems: 4,
    title: 'Add to your order',
    theme: NEUTRAL_OFFER_THEME,
    tenantId: 't1',
    tenantSlug: 'cafe',
  }

  it.each<Partial<MenuItem>>([
    { presell_enabled: true },
    { modifier_groups: [{ id: 'g', name: 'Extras', display_order: 0, min_select: 1, max_select: null, options: [] }] },
  ])('opens items with required ordering choices instead of adding an incomplete line (%j)', async (choices) => {
    const { CartOffersSection } = await import('@/components/customer/offers/cart-offers-section')
    const closeDrawer = jest.fn()
    render(<CartOffersSection {...baseProps} suggestions={[dish('tea', 'Tea', choices)]} cartItemIds={[]} onBeforeNavigate={closeDrawer} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Tea' }))
    expect(mockAddItem).not.toHaveBeenCalled()
    expect(closeDrawer).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledWith('/cafe/menu/item/tea')
  })

  it('leaves out what is already in the cart and adds the rest in one tap', async () => {
    const { CartOffersSection } = await import('@/components/customer/offers/cart-offers-section')
    render(
      <CartOffersSection {...baseProps} suggestions={[dish('coke', 'Coke'), dish('fries', 'Fries')]} cartItemIds={['fries']} />
    )
    expect(screen.queryByRole('button', { name: 'Add Fries' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add Coke' }))
    expect(mockAddItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'coke' }), undefined, [], 1, undefined, 'checkout_modal')
  })

  it('keeps the row on screen while the next suggestions load after an add', async () => {
    const { CartOffersSection } = await import('@/components/customer/offers/cart-offers-section')
    const suggestions = [dish('coke', 'Coke'), dish('cake', 'Cake')]
    const view = render(<CartOffersSection {...baseProps} suggestions={suggestions} cartItemIds={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Coke' }))
    // The cart changed, so the prefetched list is cleared until the next one lands.
    await act(async () => {
      view.rerender(<CartOffersSection {...baseProps} suggestions={null} cartItemIds={['coke']} />)
    })
    expect(screen.getByRole('button', { name: 'Coke added' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Cake' })).toBeInTheDocument()
  })

  it('renders nothing when there is nothing worth suggesting', async () => {
    const { CartOffersSection } = await import('@/components/customer/offers/cart-offers-section')
    const { container } = render(<CartOffersSection {...baseProps} suggestions={[]} cartItemIds={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
