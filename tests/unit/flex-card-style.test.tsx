/**
 * The Card style knobs must mean the same thing on every flexible template.
 * One test parameterised over the registry: a seventh flexible design is
 * covered the moment it is flagged `isFlexible` in CARD_TEMPLATES.
 */

import { render, screen, waitFor } from '@testing-library/react'
import { CARD_TEMPLATES } from '@/lib/card-templates'
import { AUTO_CARD_STYLE, type CardStyleSettings } from '@/lib/card-style'
import type { BrandingColors } from '@/lib/branding-utils'
import type { MenuItem } from '@/types/database'

const FLEXIBLE_TEMPLATES = CARD_TEMPLATES.filter((t) => t.isFlexible).map((t) => t.id)

const buildBranding = (cardStyle: Partial<CardStyleSettings>): BrandingColors =>
  ({
    primary: '#b91c1c',
    secondary: '#444444',
    accent: '#facc15',
    cards: '#ffffff',
    cardsBorder: '#eeeeee',
    cardTitle: '#111111',
    cardPrice: '#111111',
    cardDescription: '#555555',
    textPrimary: '#111111',
    textSecondary: '#444444',
    textMuted: '#888888',
    buttonPrimary: '#111111',
    buttonPrimaryText: '#ffffff',
    error: '#dc2626',
    background: '#ffffff',
    logoUrl: null,
    cardStyle: { ...AUTO_CARD_STYLE, ...cardStyle },
  }) as unknown as BrandingColors

const ITEM = {
  id: 'item-1',
  tenant_id: 'tenant-1',
  category_id: 'category-1',
  name: 'Chicken Inasal',
  description: 'Char-grilled with annatto oil',
  price: 220,
  discounted_price: 180,
  image_url: 'https://example.com/inasal.jpg',
  is_available: true,
  variations: [],
  addons: [],
} as unknown as MenuItem

const renderCard = async (template: string, cardStyle: Partial<CardStyleSettings>) => {
  const { CardTemplateRenderer } = await import('@/components/customer/card-templates')
  const view = render(
    <CardTemplateRenderer template={template as never} item={ITEM} onSelect={jest.fn()} branding={buildBranding(cardStyle)} />
  )
  await waitFor(() => expect(screen.getByRole('button', { name: ITEM.name })).toBeInTheDocument())
  return view
}

describe.each(FLEXIBLE_TEMPLATES)('the flexible %s card', (template) => {
  it('makes the dish name the card button', async () => {
    await renderCard(template, {})

    expect(screen.getByRole('button', { name: 'Chicken Inasal' })).toBeInTheDocument()
  })

  it('drops the add button when the merchant hides it', async () => {
    await renderCard(template, { addButton: 'hidden' })

    expect(screen.queryByRole('button', { name: 'Add Chicken Inasal' })).not.toBeInTheDocument()
  })

  it('shows or hides the description on request', async () => {
    const shown = await renderCard(template, { description: 'show' })
    expect(screen.getByText('Char-grilled with annatto oil')).toBeInTheDocument()
    shown.unmount()

    await renderCard(template, { description: 'hide' })
    expect(screen.queryByText('Char-grilled with annatto oil')).not.toBeInTheDocument()
  })

  it('frames the photo in the chosen shape', async () => {
    const { container } = await renderCard(template, { imageRatio: 'wide' })

    expect(container.querySelector('.aspect-\\[16\\/9\\]')).not.toBeNull()
  })

  it('shows the sale price and the struck-through original', async () => {
    const { container } = await renderCard(template, {})

    expect(container.textContent).toContain('180')
    expect(container.querySelector('s')?.textContent).toContain('220')
  })
})
