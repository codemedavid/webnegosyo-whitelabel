/**
 * Every card template has to ask the same question about a dish.
 *
 * `isMenuItemOrderable` is the one home for "may a customer add this?" — it
 * reads a missing `is_available` as orderable on purpose (a dropped projection
 * must not blank out a whole menu) and it is where any future refusal reason
 * lands. Each of the thirteen card designs used to read `item.is_available`
 * itself, which got both halves wrong: an unset flag rendered as "Unavailable",
 * and a dish the helper refuses for any other reason still rendered a live
 * "+" button.
 *
 * This is deliberately one test parameterised over the template registry rather
 * than thirteen copies: a fourteenth design registered tomorrow is covered the
 * moment it appears in `CARD_TEMPLATES`.
 */

import { render, waitFor } from '@testing-library/react'
import { CARD_TEMPLATES } from '@/lib/card-templates'
import type { MenuItem } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'

const MOCK_REFUSED_ITEM_ID = 'refused-for-another-reason'

/*
 * Stand in for the real helper so the test can prove the templates *call* it
 * rather than re-deriving the answer from `is_available`. The stub refuses one
 * id whose flag says it is perfectly available — no field read can pass that.
 */
jest.mock('@/lib/menu-item-availability', () => ({
  isMenuItemOrderable: (item: { id?: string; is_available?: boolean | null }) =>
    item.id !== MOCK_REFUSED_ITEM_ID && item.is_available !== false,
}))

const branding = {
  primary: '#111111',
  cards: '#ffffff',
  cardsBorder: '#eeeeee',
  cardTitle: '#111111',
  cardDescription: '#666666',
  textPrimary: '#111111',
  textSecondary: '#444444',
  textMuted: '#888888',
  buttonPrimary: '#111111',
  buttonPrimaryText: '#ffffff',
  error: '#dd0000',
  background: '#ffffff',
  logoUrl: null,
} as unknown as BrandingColors

const buildItem = (overrides: Partial<MenuItem>): MenuItem =>
  ({
    id: 'orderable-item',
    tenant_id: 'tenant-1',
    category_id: 'category-1',
    name: 'Adobo Rice Bowl',
    description: 'House adobo over garlic rice',
    price: 180,
    discounted_price: null,
    image_url: null,
    is_featured: false,
    variations: [],
    badge_text: null,
    ...overrides,
  }) as unknown as MenuItem

const renderCard = async (template: string, item: MenuItem) => {
  const { CardTemplateRenderer } = await import('@/components/customer/card-templates')

  const view = render(
    <CardTemplateRenderer
      template={template as never}
      item={item}
      onSelect={jest.fn()}
      branding={branding}
    />,
  )

  // Templates are lazy-loaded with next/dynamic; wait for the real chunk.
  await waitFor(() => expect(view.container.querySelector('button')).not.toBeNull())

  return view
}

const disabledButtons = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('button')).filter((button) => button.disabled)

describe.each(CARD_TEMPLATES.map((definition) => definition.id))(
  'the %s card template',
  (template) => {
    it('lets a customer order a dish whose availability flag was never set', async () => {
      const { container } = await renderCard(template, buildItem({ is_available: undefined }))

      expect(disabledButtons(container)).toHaveLength(0)
    })

    it('refuses a dish the availability rule rejects for a reason other than the flag', async () => {
      const { container } = await renderCard(
        template,
        buildItem({ id: MOCK_REFUSED_ITEM_ID, is_available: true }),
      )

      expect(disabledButtons(container).length).toBeGreaterThan(0)
    })

    it('still refuses a dish that is explicitly out of stock', async () => {
      const { container } = await renderCard(template, buildItem({ is_available: false }))

      expect(disabledButtons(container).length).toBeGreaterThan(0)
    })
  },
)
