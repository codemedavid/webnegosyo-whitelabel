import { describe, it, expect } from '@jest/globals'
import { renderHook } from '@testing-library/react'
import { readFileSync } from 'fs'
import { join } from 'path'
import { useBranchMenu } from '@/hooks/use-branch-menu'
import type { MenuItem, OutletMenuOverride } from '@/types/database'

/**
 * The seam where a branch's menu actually reaches the customer.
 *
 * The resolution itself is proven in `outlet-menu-overrides.test.ts`. What
 * breaks in this codebase is the plumbing around it: a column the query never
 * selects, or a prop the server computes and the client never applies, no-ops
 * silently and the feature ships invisible. Unified modifier groups and mobile
 * branding overrides both shipped fully built and completely dead that way.
 *
 * So this asserts the wiring: the server fetches the overrides, and the client
 * renders the menu it was given through the resolver rather than around it.
 */

const read = (relativePath: string): string =>
  readFileSync(join(process.cwd(), relativePath), 'utf8')

const item = (id: string, price: number): MenuItem =>
  ({
    id,
    tenant_id: 't1',
    category_id: 'c1',
    name: id,
    description: '',
    price,
    discounted_price: null,
    image_url: '',
    variations: [],
    addons: [],
    is_available: true,
    is_featured: false,
    order: 0,
    created_at: '',
    updated_at: '',
  }) as unknown as MenuItem

const override = (
  over: Partial<OutletMenuOverride> & { outlet_id: string; menu_item_id: string }
): OutletMenuOverride =>
  ({
    id: `omi-${over.outlet_id}-${over.menu_item_id}`,
    tenant_id: 't1',
    is_listed: true,
    is_available: true,
    price: null,
    discounted_price: null,
    discount_cleared: false,
    created_at: '',
    updated_at: '',
    ...over,
  }) as OutletMenuOverride

describe('useBranchMenu', () => {
  const items = [item('adobo', 180), item('sinigang', 200)]

  it('returns the store-wide menu when no branch is selected', () => {
    const { result } = renderHook(() =>
      useBranchMenu({ items, overrides: [], selectedOutletId: null })
    )

    expect(result.current.items.map((i) => i.id)).toEqual(['adobo', 'sinigang'])
  })

  it('returns the store-wide menu for a tenant with no overrides at all', () => {
    const { result } = renderHook(() =>
      useBranchMenu({ items, overrides: [], selectedOutletId: 'branch-a' })
    )

    expect(result.current.items.map((i) => i.id)).toEqual(['adobo', 'sinigang'])
  })

  it('hides a dish the selected branch does not carry', () => {
    const { result } = renderHook(() =>
      useBranchMenu({
        items,
        overrides: [override({ outlet_id: 'branch-a', menu_item_id: 'sinigang', is_listed: false })],
        selectedOutletId: 'branch-a',
      })
    )

    expect(result.current.items.map((i) => i.id)).toEqual(['adobo'])
  })

  it('prices a dish as the selected branch sells it', () => {
    const { result } = renderHook(() =>
      useBranchMenu({
        items,
        overrides: [override({ outlet_id: 'branch-a', menu_item_id: 'adobo', price: 160 })],
        selectedOutletId: 'branch-a',
      })
    )

    expect(result.current.items.find((i) => i.id === 'adobo')?.price).toBe(160)
  })

  it("leaves another branch's customers unaffected", () => {
    const { result } = renderHook(() =>
      useBranchMenu({
        items,
        overrides: [override({ outlet_id: 'branch-a', menu_item_id: 'adobo', price: 160 })],
        selectedOutletId: 'branch-b',
      })
    )

    expect(result.current.items.find((i) => i.id === 'adobo')?.price).toBe(180)
  })

  it('tolerates an override list that failed to load', () => {
    const { result } = renderHook(() =>
      useBranchMenu({ items, overrides: undefined, selectedOutletId: 'branch-a' })
    )

    expect(result.current.items).toHaveLength(2)
  })

  it('exposes a lookup for a single dish, for the product detail page', () => {
    const { result } = renderHook(() =>
      useBranchMenu({
        items,
        overrides: [override({ outlet_id: 'branch-a', menu_item_id: 'adobo', price: 160 })],
        selectedOutletId: 'branch-a',
      })
    )

    expect(result.current.resolveItem(item('adobo', 180)).price).toBe(160)
    expect(result.current.resolveItem(item('sinigang', 200)).price).toBe(200)
  })
})

describe('storefront wiring', () => {
  const menuServer = read('src/app/[tenant]/menu/menu-server.tsx')
  const menuClient = read('src/app/[tenant]/menu/menu-client.tsx')

  it('fetches branch overrides on the menu query', () => {
    expect(menuServer).toContain('outlet_menu_items')
    expect(menuServer).toContain('OUTLET_MENU_OVERRIDE_SELECT')
  })

  it('hands the overrides to the client', () => {
    expect(menuServer).toContain('menuOverrides')
    expect(read('src/app/[tenant]/menu/page.tsx')).toContain('menuOverrides')
  })

  it('carries an override load failure rather than silently pricing store-wide', () => {
    // Same reasoning as `outletsFailed`: an empty override set is the specific
    // claim "every branch sells at the store-wide price", which is the wrong
    // thing to assert after a failed query.
    expect(menuServer).toContain('overridesFailed')
  })

  it('renders the menu through the branch resolver', () => {
    expect(menuClient).toContain('useBranchMenu')
  })
})
