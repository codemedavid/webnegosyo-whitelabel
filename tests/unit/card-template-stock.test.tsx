/**
 * Stock on every menu card design (client complaint 2026-11-04: "it should
 * say out of stock"). Ceilings come from `/api/inventory/ceilings` through
 * `MenuStockProvider`; the renderer resolves them once and every template
 * shows the result. Parameterised over the registry, so a new design is
 * covered the moment it is registered.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { CARD_TEMPLATES } from '@/lib/card-templates'
import type { MenuItem } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'

let mockCeilings = new Map<string, number>()
jest.mock('@/hooks/use-stock-ceilings', () => ({
  useStockCeilings: (tenantId: string | null) => (tenantId ? mockCeilings : new Map()),
}))

const branding = {
  primary: '#111111', cards: '#ffffff', cardsBorder: '#eeeeee', cardTitle: '#111111',
  cardDescription: '#666666', textPrimary: '#111111', textSecondary: '#444444', textMuted: '#888888',
  buttonPrimary: '#123456', buttonPrimaryText: '#fefefe', error: '#dd0000', background: '#ffffff', logoUrl: null,
} as unknown as BrandingColors

const ITEM = {
  id: 'dish-1', tenant_id: 'tenant-1', category_id: 'category-1', name: 'Tapsilog',
  description: 'Beef tapa, egg, rice', price: 180, discounted_price: null, image_url: null,
  is_featured: false, variations: [], badge_text: null, is_available: true,
} as unknown as MenuItem

async function renderCard(template: string, options: { isInventoryEnabled?: boolean } = {}) {
  const { CardTemplateRenderer } = await import('@/components/customer/card-templates')
  const { MenuStockProvider } = await import('@/components/customer/card-templates/card-stock')
  const view = render(
    <MenuStockProvider tenantId="tenant-1" outletId={null} isInventoryEnabled={options.isInventoryEnabled ?? true}>
      <CardTemplateRenderer template={template as never} item={ITEM} onSelect={jest.fn()} branding={branding} />
    </MenuStockProvider>,
  )
  await waitFor(() => expect(view.container.querySelector('button')).not.toBeNull())
  return view
}

const disabledButtons = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('button')).filter((button) => button.disabled)

beforeEach(() => {
  mockCeilings = new Map()
})

describe.each(CARD_TEMPLATES.map((definition) => definition.id))('the %s card template', (template) => {
  it('says sold out and refuses the add when the kitchen can make none, though the dish is switched on', async () => {
    mockCeilings = new Map([['dish-1', 0]])
    const { container } = await renderCard(template)

    expect(disabledButtons(container).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/sold out|^out$/i).length).toBeGreaterThan(0)
    expect(screen.queryByText(/unavailable/i)).toBeNull()
  })

  it('shows "Only N left" in the store colours when few remain', async () => {
    mockCeilings = new Map([['dish-1', 3]])
    const { container } = await renderCard(template)

    const badge = screen.getByTestId('low-stock-badge')
    expect(badge).toHaveTextContent('Only 3 left')
    expect(badge).toHaveStyle({ backgroundColor: '#123456', color: '#fefefe' })
    expect(disabledButtons(container)).toHaveLength(0)
  })

  it('looks exactly as before for an untracked dish', async () => {
    const { container } = await renderCard(template)

    expect(screen.queryByTestId('low-stock-badge')).toBeNull()
    expect(disabledButtons(container)).toHaveLength(0)
  })

  it('reads no stock for a store without inventory', async () => {
    mockCeilings = new Map([['dish-1', 0]])
    const { container } = await renderCard(template, { isInventoryEnabled: false })

    expect(disabledButtons(container)).toHaveLength(0)
  })

  // Browser QA 2026-11-04: on phones a sold-out card's "+" kept its white,
  // active look on top of the "Sold out" veil, so it read as tappable.
  it('does not show a live-looking add button on a sold-out card', async () => {
    mockCeilings = new Map([['dish-1', 0]])
    const { container } = await renderCard(template)

    const quiet = /(^|\s)disabled:(invisible|hidden|opacity-\d+)(\s|$)/
    for (const button of disabledButtons(container)) {
      expect(button.className).toMatch(quiet)
    }
  })
})

describe('the flexible kit\'s round "+" on a sold-out card', () => {
  // The icon "+" sits on the photo in several designs; dimmed to 40% it still
  // read as a live white button over the dark "Sold out" veil on phones.
  it('is hidden rather than dimmed (the veil already says "Sold out")', async () => {
    const { AddButton } = await import('@/components/customer/card-templates/flex/card-kit')
    render(
      <AddButton item={ITEM} variant="icon" isOrderable={false} onSelect={jest.fn()} background="#ffffff" color="#111111" />,
    )

    const button = screen.getByRole('button', { name: 'Add Tapsilog' })
    expect(button).toBeDisabled()
    expect(button.className).toMatch(/(^|\s)disabled:invisible(\s|$)/)
  })

  it('stays dimmed, not hidden, when it carries the "Sold out" words', async () => {
    const { AddButton } = await import('@/components/customer/card-templates/flex/card-kit')
    render(
      <AddButton item={ITEM} variant="pill" isOrderable={false} onSelect={jest.fn()} background="#ffffff" color="#111111" />,
    )

    const button = screen.getByRole('button', { name: 'Add Tapsilog' })
    expect(button.className).not.toMatch(/disabled:invisible/)
    expect(button).toHaveTextContent('Sold out')
  })
})

describe('"Only N left" in the store\'s own words', () => {
  it('uses the owner\'s menu.only_left label with the count filled in', async () => {
    const { LowStockBadge, CardStockProvider } = await import('@/components/customer/card-templates/card-stock')
    const { StorefrontLabelsProvider } = await import('@/components/customer/storefront-labels-provider')
    render(
      <StorefrontLabelsProvider tenant={{ storefront_labels: { 'menu.only_left': '{count} na lang' } }}>
        <CardStockProvider stock={{ isOrderable: true, isSoldOut: false, onlyLeft: 2 }}>
          <LowStockBadge branding={branding} />
        </CardStockProvider>
      </StorefrontLabelsProvider>,
    )

    expect(screen.getByTestId('low-stock-badge')).toHaveTextContent('2 na lang')
  })
})
