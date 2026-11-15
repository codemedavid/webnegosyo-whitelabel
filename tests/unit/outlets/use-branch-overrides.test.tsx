/**
 * The browser's copy of a store's branch-menu differences (product page, the
 * cart's re-check, upsell suggestions). It reads through the same paged reader
 * as the menu page, so a store past 1,000 differences sees all of them here
 * too, and a failed read raises `didFail` instead of pricing store-wide.
 */
import { renderHook, waitFor } from '@testing-library/react'
import { fakeSupabaseTables } from '../../fixtures/fake-supabase-tables'

let fake: ReturnType<typeof fakeSupabaseTables>

jest.mock('@/lib/supabase/client', () => ({ createClient: () => fake.client }))

import { useBranchOverrides } from '@/hooks/use-branch-overrides'

function rows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `row-${index}`,
    tenant_id: 'tenant-1',
    outlet_id: `outlet-${index % 4}`,
    menu_item_id: `item-${String(index).padStart(5, '0')}`,
    is_listed: true,
    is_available: false,
    price: null,
    discounted_price: null,
    discount_cleared: false,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
  }))
}

describe('useBranchOverrides', () => {
  it('loads every difference past the first 1,000', async () => {
    fake = fakeSupabaseTables({ outlet_menu_items: rows(1800) })

    const { result } = renderHook(() => useBranchOverrides({ tenantId: 'tenant-1', isEnabled: true }))

    await waitFor(() => expect(result.current.overrides).toHaveLength(1800))
    expect(result.current.didFail).toBe(false)
  })

  it('flags a failed read and hands back no partial list', async () => {
    fake = fakeSupabaseTables({ outlet_menu_items: rows(1800) }, { outlet_menu_items: 'upstream request timeout' })
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

    const { result } = renderHook(() => useBranchOverrides({ tenantId: 'tenant-1', isEnabled: true }))

    await waitFor(() => expect(result.current.didFail).toBe(true))
    expect(result.current.overrides).toEqual([])
    warn.mockRestore()
  })

  it('never reads for a store without branches', () => {
    fake = fakeSupabaseTables({ outlet_menu_items: rows(3) })

    renderHook(() => useBranchOverrides({ tenantId: 'tenant-1', isEnabled: false }))

    expect(fake.seen).toHaveLength(0)
  })
})
