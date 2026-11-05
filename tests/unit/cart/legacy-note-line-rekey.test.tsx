/**
 * Carts saved before line ids carried the note kept the note on the line but
 * not in its id. Loaded as-is, a plain add of the same dish matched that id
 * and merged into the noted line, so the plain dish inherited "no onions".
 * On load, a saved line with a note gets the id today's rule would give it.
 */
import React from 'react'
import { act, renderHook } from '@testing-library/react'
import { generateCartItemId, rekeyLegacyNoteLines } from '@/lib/cart-utils'
import type { CartItem, MenuItem } from '@/types/database'

jest.mock('next/navigation', () => ({
  usePathname: () => '/test-store/cart',
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

const burger: MenuItem = {
  id: 'burger', tenant_id: 'tenant-1', category_id: 'c-1', name: 'Burger', description: '',
  price: 100, image_url: '', is_available: true, order: 0, created_at: '', updated_at: '',
  variations: [], addons: [],
}

/** Exactly what the old build wrote to `restaurant_cart_<slug>`. */
function oldFormatLine(overrides: Partial<CartItem> = {}): CartItem {
  return { id: 'burger', menu_item: burger, selected_addons: [], quantity: 1, subtotal: 100, special_instructions: 'no onions', ...overrides } as CartItem
}

describe('rekeyLegacyNoteLines', () => {
  it('gives an old noted line the id the current rule gives it', () => {
    const [line] = rekeyLegacyNoteLines([oldFormatLine()])

    expect(line.id).toBe(generateCartItemId('burger', undefined, [], undefined, 'no onions'))
    expect(line.special_instructions).toBe('no onions')
  })

  it('leaves plain lines and already-keyed lines alone', () => {
    const plain = oldFormatLine({ special_instructions: undefined })
    const current = oldFormatLine({ id: generateCartItemId('burger', undefined, [], undefined, 'no onions') })

    expect(rekeyLegacyNoteLines([plain, current])).toEqual([plain, current])
  })

  it('merges an old line into a new one it now matches', () => {
    const current = oldFormatLine({ id: generateCartItemId('burger', undefined, [], undefined, 'No onions'), quantity: 2, subtotal: 200 })

    const lines = rekeyLegacyNoteLines([oldFormatLine(), current])

    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ quantity: 3, subtotal: 300, special_instructions: 'no onions' })
  })

  it('does not change the array it was given', () => {
    const saved = [oldFormatLine()]
    rekeyLegacyNoteLines(saved)
    expect(saved[0].id).toBe('burger')
  })
})

describe('useCart — a cart saved by the old build', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('tenant_context', JSON.stringify({ tenantId: 'tenant-1', tenantSlug: 'test-store' }))
    localStorage.setItem('restaurant_cart_test-store', JSON.stringify([oldFormatLine()]))
  })

  it('keeps a plain add of the same dish out of the noted line', async () => {
    const { CartProvider, useCart } = await import('@/hooks/useCart')
    const wrapper = ({ children }: { children: React.ReactNode }) => <CartProvider>{children}</CartProvider>
    const { result } = renderHook(() => useCart(), { wrapper })
    expect(result.current.items).toHaveLength(1)

    act(() => {
      result.current.addItem(burger, undefined, [], 1)
    })

    expect(result.current.items.map((line) => [line.quantity, line.special_instructions]))
      .toEqual([[1, 'no onions'], [1, undefined]])
  })
})
