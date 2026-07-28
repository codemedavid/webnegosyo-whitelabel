/**
 * Tapping an out-of-stock card must not open it.
 *
 * Every card template disables its own "+" button, but the card body itself is
 * a separate click target that routes to the product page — where the customer
 * can add the dish anyway. Thirteen templates each own their body click, so the
 * guard lives on `MenuItemCard`, the single wrapper they all render through
 * (the same reason the click-to-inspect tag lives there).
 */

import { render, fireEvent, screen, waitFor } from '@testing-library/react'
import { MenuItemCard } from '@/components/customer/menu-item-card'
import { getTenantBranding } from '@/lib/branding-utils'
import type { MenuItem } from '@/types/database'
import { CARD_TEMPLATES } from '@/lib/card-templates'

function dish(overrides: Partial<MenuItem>): MenuItem {
  return {
    id: 'item-1',
    tenant_id: 't-1',
    category_id: 'c-1',
    name: 'Lechon Kawali',
    description: 'Crispy pork belly',
    price: 280,
    image_url: '',
    is_available: true,
    is_featured: false,
    order: 1,
    variations: [],
    addons: [],
    created_at: '',
    updated_at: '',
    ...overrides,
  } as unknown as MenuItem
}

/**
 * Templates are `next/dynamic` chunks behind a skeleton fallback. Clicking
 * before the chunk resolves hits the skeleton, which has no click handler at
 * all — every assertion here would pass without the feature existing. So the
 * helper waits for the real card and returns the element the design hangs its
 * body click on: the template's own root, the wrapper's only child.
 */
async function renderCard(item: MenuItem, onSelect: jest.Mock, template = 'classic') {
  const { container } = render(
    <MenuItemCard
      item={item}
      onSelect={onSelect}
      branding={getTenantBranding(null)}
      template={template as never}
    />,
  )
  const wrapper = container.querySelector('[data-branding-scope="storefront/cards"]')!

  await waitFor(() => {
    expect(wrapper.firstElementChild?.className).not.toContain('animate-pulse')
  })

  return wrapper.firstElementChild as HTMLElement
}

describe('a dish that is out of stock', () => {
  it('does not open when the customer taps its card', async () => {
    const onSelect = jest.fn()
    const body = await renderCard(dish({ is_available: false }), onSelect)

    fireEvent.click(body)

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('still says it is unavailable so the customer knows it exists', async () => {
    await renderCard(dish({ is_available: false }), jest.fn())

    expect(screen.getByText(/unavailable/i)).toBeInTheDocument()
  })

  /*
   * The guard is on the shared wrapper precisely so no template can opt out of
   * it. Asserting every registered template, rather than the default one, is
   * what stops a future card design from quietly reopening the hole.
   */
  it.each(CARD_TEMPLATES.map((t) => t.id))('stays closed on the %s template', async (template) => {
    const onSelect = jest.fn()
    const body = await renderCard(dish({ is_available: false }), onSelect, template)

    fireEvent.click(body)

    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('a dish that is in stock', () => {
  /*
   * The mirror of every assertion above. Without it the guard could be a
   * blanket "never open anything" and the out-of-stock tests would still pass.
   */
  it.each(CARD_TEMPLATES.map((t) => t.id))('opens on the %s template', async (template) => {
    const onSelect = jest.fn()
    const body = await renderCard(dish({ is_available: true }), onSelect, template)

    fireEvent.click(body)

    expect(onSelect).toHaveBeenCalled()
  })
})
