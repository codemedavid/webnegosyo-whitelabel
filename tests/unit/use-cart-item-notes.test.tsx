/**
 * The real cart keeps a dish's kitchen note with the line it was typed for.
 *
 * `addItem` used to merge a re-added dish into the line with the same options
 * and overwrite that line's note with the new one (`new || old`): a Burger "no
 * onions" added after a plain Burger turned BOTH burgers into "no onions", and
 * a second "extra sauce" burger wiped the first one's "no onions".
 */

import React from 'react'
import { act, renderHook } from '@testing-library/react'
import type { MenuItem } from '@/types/database'

jest.mock('next/navigation', () => ({
  usePathname: () => '/test-store/menu',
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

const burger: MenuItem = {
  id: 'burger', tenant_id: 'tenant-1', category_id: 'c-1', name: 'Burger', description: '',
  price: 100, image_url: '', is_available: true, order: 0, created_at: '', updated_at: '',
  variations: [], addons: [],
}

async function renderCart() {
  // Imported lazily: next/jest leaves static imports ahead of jest.mock.
  const { CartProvider, useCart } = await import('@/hooks/useCart')
  const wrapper = ({ children }: { children: React.ReactNode }) => <CartProvider>{children}</CartProvider>
  const view = renderHook(() => useCart(), { wrapper })
  act(() => view.result.current.setTenantContext('tenant-1', 'test-store'))
  return view
}

beforeEach(() => localStorage.clear())

describe('useCart — kitchen notes', () => {
  it('keeps two different notes on the same dish as two lines', async () => {
    const { result } = await renderCart()

    act(() => {
      result.current.addItem(burger, undefined, [], 1, 'no onions')
      result.current.addItem(burger, undefined, [], 1, 'extra sauce')
    })

    expect(result.current.items.map((line) => [line.quantity, line.special_instructions]))
      .toEqual([[1, 'no onions'], [1, 'extra sauce']])
  })

  it('keeps a plain dish and a dish with a note apart', async () => {
    const { result } = await renderCart()

    act(() => {
      result.current.addItem(burger, undefined, [], 1)
      result.current.addItem(burger, undefined, [], 2, 'no onions')
    })

    expect(result.current.items.map((line) => [line.quantity, line.special_instructions]))
      .toEqual([[1, undefined], [2, 'no onions']])
  })

  it('merges the same note into one line and keeps it', async () => {
    const { result } = await renderCart()

    act(() => {
      result.current.addItem(burger, undefined, [], 1, 'No onions')
      result.current.addItem(burger, undefined, [], 2, '  no   onions ')
    })

    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0]).toMatchObject({ quantity: 3, special_instructions: 'No onions', subtotal: 300 })
  })

  it('changes only the edited line\'s note', async () => {
    const { result } = await renderCart()
    act(() => {
      result.current.addItem(burger, undefined, [], 1, 'no onions')
      result.current.addItem(burger, undefined, [], 1)
    })
    const plainId = result.current.items[1].id

    act(() => result.current.updateItemConfiguration(plainId, burger, undefined, [], 1, 'well done'))

    expect(result.current.items.map((line) => line.special_instructions)).toEqual(['no onions', 'well done'])
  })
})
