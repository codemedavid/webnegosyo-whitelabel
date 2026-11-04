/**
 * Browser QA 2026-11-05: on 390px phones the "Only N left" badge sat
 * top-centre on the photo and ran into the ★ featured and SALE corner badges
 * (classic: every card; arch: "Only 6 left" under SALE). jsdom has no layout,
 * so this pins the placement by the classes that decide it, for EVERY
 * registered card design with a featured, discounted, low-stock dish:
 *
 *   - the badge never shares an edge of the photo with the featured or SALE
 *     badge (an in-flow badge has no edge and cannot collide);
 *   - on the bottom edge, a design with a button/price in the bottom-right
 *     corner keeps the badge short of it;
 *   - long owner wording truncates instead of spilling.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { CARD_TEMPLATES } from '@/lib/card-templates'
import type { MenuItem } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'

jest.mock('@/hooks/use-stock-ceilings', () => ({
  useStockCeilings: () => new Map([['dish-1', 4]]),
}))

const branding = {
  primary: '#111111', cards: '#ffffff', cardsBorder: '#eeeeee', cardTitle: '#111111',
  cardDescription: '#666666', textPrimary: '#111111', textSecondary: '#444444', textMuted: '#888888',
  buttonPrimary: '#123456', buttonPrimaryText: '#fefefe', error: '#dd0000', background: '#ffffff', logoUrl: null,
} as unknown as BrandingColors

const ITEM = {
  id: 'dish-1', tenant_id: 'tenant-1', category_id: 'category-1', name: 'Tapsilog',
  description: 'Beef tapa, egg, rice', price: 200, discounted_price: 160, image_url: null,
  is_featured: true, variations: [], badge_text: null, is_available: true,
} as unknown as MenuItem

const CLEAR_OF_CORNER = 'max-w-[calc(100%-5.5rem)]'
const SALE_TEXT = /SALE|^[−-]\d+%$/
const FEATURED_TEXT = /⭐|★|Featured|FEATURED|Editor/

type Edge = 'top' | 'bottom' | null

const classTokens = (element: Element) => (element.getAttribute('class') ?? '').split(/\s+/)
const isAbsolute = (element: Element) => classTokens(element).includes('absolute')

/** The nearest absolutely placed box holding `element` (itself included). */
function positionedBox(element: Element): Element | null {
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (isAbsolute(node)) return node
  }
  return null
}

function edgeOf(element: Element): Edge {
  const box = positionedBox(element)
  if (!box) return null
  const tokens = classTokens(box)
  if (tokens.some((token) => /^bottom-/.test(token))) return 'bottom'
  if (tokens.some((token) => /^top-/.test(token))) return 'top'
  return null
}

async function renderCard(template: string) {
  const { CardTemplateRenderer } = await import('@/components/customer/card-templates')
  const { MenuStockProvider } = await import('@/components/customer/card-templates/card-stock')
  const view = render(
    <MenuStockProvider tenantId="tenant-1" outletId={null} isInventoryEnabled>
      <CardTemplateRenderer template={template as never} item={ITEM} onSelect={jest.fn()} branding={branding} />
    </MenuStockProvider>,
  )
  await waitFor(() => expect(screen.getByTestId('low-stock-badge')).toBeInTheDocument())
  return view
}

describe.each(CARD_TEMPLATES.map((definition) => definition.id))('"Only N left" on the %s card', (template) => {
  it('never shares an edge of the photo with the featured or SALE badge', async () => {
    await renderCard(template)
    const badgeEdge = edgeOf(screen.getByTestId('low-stock-badge'))
    if (badgeEdge === null) return

    const corners = [...screen.queryAllByText(SALE_TEXT), ...screen.queryAllByText(FEATURED_TEXT)]
    for (const corner of corners) {
      expect(edgeOf(corner)).not.toBe(badgeEdge)
    }
  })

  it('stops short of anything in the bottom-right corner of the card', async () => {
    const { container } = await renderCard(template)
    const badge = screen.getByTestId('low-stock-badge')
    if (edgeOf(badge) !== 'bottom') return

    const box = positionedBox(badge) as Element
    const cornerOverlays = Array.from(container.querySelectorAll('*')).filter((element) => {
      if (element === box || element.contains(box) || box.contains(element) || !isAbsolute(element)) return false
      const tokens = classTokens(element)
      // A full-width strip (left AND right, e.g. neon's glow line) is decoration, not a corner.
      const isCorner = tokens.some((token) => /^right-/.test(token)) && !tokens.some((token) => /^left-/.test(token))
      return isCorner && tokens.some((token) => /^bottom-/.test(token))
    })
    if (cornerOverlays.length > 0) {
      expect(classTokens(box)).toContain(CLEAR_OF_CORNER)
    }
  })

  it('truncates long wording instead of spilling over the photo', async () => {
    await renderCard(template)
    expect(classTokens(screen.getByTestId('low-stock-badge'))).toContain('truncate')
  })
})
