import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { createClearanceStore, isMissingClearanceTable } from '@/lib/inventory/pos-stock-clearance-store'

function fakeDb(result: { data: { id: string } | null; error: { message: string; code?: string } | null }) {
  return {
    from: () => ({ insert: () => ({ select: () => ({ single: async () => result }) }) }),
  } as unknown as SupabaseClient<Database>
}

const ROW = {
  tenantId: 't1',
  outletId: null,
  orderId: 'o1',
  cashierUserId: 'u1',
  cashierName: 'Cashier',
  approverUserId: null,
  approverName: null,
  quantities: {},
  shortfalls: [],
}

describe('pos stock clearance store: table not migrated yet', () => {
  it('recognises "relation does not exist" and PostgREST schema-cache misses', () => {
    expect(isMissingClearanceTable({ code: '42P01', message: 'relation "public.pos_stock_clearances" does not exist' })).toBe(true)
    expect(isMissingClearanceTable({ code: 'PGRST205', message: "Could not find the table 'public.pos_stock_clearances'" })).toBe(true)
    expect(isMissingClearanceTable({ message: "Could not find the table 'public.pos_stock_clearances' in the schema cache" })).toBe(true)
    expect(isMissingClearanceTable({ code: '42501', message: 'permission denied' })).toBe(false)
    expect(isMissingClearanceTable(null)).toBe(false)
  })

  it('keeps the decision instead of a 500 (a 500 made the register sell as "offline" without a PIN)', async () => {
    const store = createClearanceStore(fakeDb({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.pos_stock_clearances'" } }))
    const { id } = await store.insertClearance(ROW)
    expect(id).toMatch(/^unrecorded-[0-9a-f-]{36}$/)
  })

  it('still throws on every other failure', async () => {
    const store = createClearanceStore(fakeDb({ data: null, error: { code: '42501', message: 'permission denied' } }))
    await expect(store.insertClearance(ROW)).rejects.toThrow('permission denied')
  })

  it('returns the stored id once the table exists', async () => {
    const store = createClearanceStore(fakeDb({ data: { id: 'c-1' }, error: null }))
    await expect(store.insertClearance(ROW)).resolves.toEqual({ id: 'c-1' })
  })
})
