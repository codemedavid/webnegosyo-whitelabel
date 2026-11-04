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
})
