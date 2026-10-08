/**
 * A dish without its own photo renders as a clean text card on every design.
 *
 * Cards used to fall back to the store logo (or an empty media box, an initial,
 * a utensil icon) when `image_url` was blank. On photo-less stores that
 * repeated the logo on every dish or drew rows of empty frames, which reads as
 * broken. The rule now: no photo, no media frame at all. Whatever used to sit
 * on the photo (sold-out state, badges, sale marker, add button) moves into the
 * text so nothing is lost. Dishes WITH a photo are unchanged.
 *
 * One test over the registry, not nineteen copies: a design registered tomorrow
 * is covered the moment it appears in `CARD_TEMPLATES`.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CARD_TEMPLATES } from '@/lib/card-templates'
import { getTenantBranding } from '@/lib/branding-utils'
import type { MenuItem } from '@/types/database'

const LOGO_URL = 'https://cdn.test/tenant-logo.png'
const DISH_PHOTO_URL = 'https://cdn.test/burger.png'
const DISH_NAME = 'Wintermelon Milk Tea'
const BADGE_TEXT = 'Best seller'
const SOLD_OUT_TEXT = /sold out|unavailable|^out$/i

const branding = getTenantBranding({ logo_url: LOGO_URL })

function makeItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 'item-1',
    tenant_id: 't-1',
    category_id: 'c-1',
    name: DISH_NAME,
    description: 'Brown sugar, fresh milk',
    price: 129,
    discounted_price: null,
    image_url: '',
    is_available: true,
    is_featured: false,
    badge_text: null,
    order: 1,
    variations: [],
    addons: [],
    created_at: '',
    updated_at: '',
    ...overrides,
  } as unknown as MenuItem
}

async function renderCard(template: string, item: MenuItem, extra: { menuEngineeringEnabled?: boolean } = {}) {
  const { CardTemplateRenderer } = await import('@/components/customer/card-templates')
  const onSelect = jest.fn()
  const view = render(
    <CardTemplateRenderer
      template={template as never}
      item={item}
      onSelect={onSelect}
      branding={branding}
      {...extra}
    />,
  )
  // Templates are lazy-loaded with next/dynamic; wait for the real chunk.
  await waitFor(() => expect(view.container.querySelector('button')).not.toBeNull())
  return { ...view, onSelect }
}

describe.each(CARD_TEMPLATES.map((definition) => definition.id))('the %s card', (template) => {
  describe('a dish without a photo', () => {
    it('draws no image, no logo and no media frame', async () => {
      const { container } = await renderCard(template, makeItem({ image_url: '' }))

      expect(container.querySelector('img')).toBeNull()
      expect(container.innerHTML).not.toContain('tenant-logo')
      expect(container.querySelector('[class*="aspect-"]')).toBeNull()
    })

    it('treats a whitespace-only image url as no photo', async () => {
      const { container } = await renderCard(template, makeItem({ image_url: '   ' }))

      expect(container.querySelector('img')).toBeNull()
    })

    it('still shows the name and price', async () => {
      const { container } = await renderCard(template, makeItem())

      expect(container.textContent).toContain(DISH_NAME)
      expect(container.textContent).toContain('129')
    })

    it('keeps the add button working', async () => {
      const item = makeItem()
      const { onSelect } = await renderCard(template, item)

      const [addButton] = screen.getAllByRole('button', { name: `Add ${DISH_NAME}` })
      fireEvent.click(addButton)

      expect(onSelect).toHaveBeenCalledWith(item)
    })

    it('says so when it is sold out', async () => {
      await renderCard(template, makeItem({ is_available: false }))

      expect(screen.getAllByText(SOLD_OUT_TEXT).length).toBeGreaterThan(0)
    })

    it('keeps its badge and its sale price', async () => {
      const { container } = await renderCard(
        template,
        makeItem({ badge_text: BADGE_TEXT, discounted_price: 99 }),
        { menuEngineeringEnabled: true },
      )

      expect(screen.getAllByText(BADGE_TEXT).length).toBeGreaterThan(0)
      const struck = container.querySelector('s, .line-through')
      expect(struck?.textContent).toContain('129')
      expect(container.textContent).toContain('99')
    })
  })

  describe('a dish with a photo', () => {
    it('shows the dish photo, not the logo', async () => {
      const { container } = await renderCard(template, makeItem({ image_url: DISH_PHOTO_URL }))

      const image = container.querySelector('img')
      expect(decodeURIComponent(image?.getAttribute('src') ?? '')).toContain('cdn.test/burger.png')
    })
  })
})
