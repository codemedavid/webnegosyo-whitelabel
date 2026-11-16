import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { createClearanceStore } from '@/lib/inventory/pos-stock-clearance-store'

describe('pos stock clearance store', () => {
  it('writes nothing: no insert method, and the clearance table is never named (retired unapplied 2026-11-16)', async () => {
    const tables: string[] = []
    const db = {
      from: (table: string) => {
        tables.push(table)
        const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: { pos_stock_policy: 'block' }, error: null }) }
        return chain
      },
    } as unknown as SupabaseClient<Database>
    const store = createClearanceStore(db)
    expect('insertClearance' in store).toBe(false)
    await expect(store.readPolicy('t1')).resolves.toBe('block')
    expect(tables).toEqual(['tenants'])
  })
})
