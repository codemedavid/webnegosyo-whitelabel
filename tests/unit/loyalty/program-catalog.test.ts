/** @jest-environment node */
import type { SupabaseClient } from '@supabase/supabase-js'
import { validateProgramCatalog } from '@/lib/loyalty/program-catalog'
import type { LoyaltyRules } from '@/lib/loyalty/types'

it.each([
  [{ presell_enabled: true }, false],
  [{}, true],
])('only permits redeemable regular items: %j', async (flags, allowed) => {
  const row = { id: 'item', name: 'Catalog name', is_available: true, ...flags }
  interface Query { select: jest.Mock<Query, []>; eq: jest.Mock<Query, []>; maybeSingle: () => Promise<{ data: typeof row; error: null }> }
  const query: Query = { select: jest.fn(() => query), eq: jest.fn(() => query), maybeSingle: async () => ({ data: row, error: null }) }
  const client = { from: () => query } as unknown as SupabaseClient
  const rules = { reward: { type: 'free_item', menuItemId: 'item', itemName: 'Client name' } } as LoyaltyRules
  const error = await validateProgramCatalog(client, 'tenant', rules)
  expect(error === null).toBe(allowed)
  expect(query.select).toHaveBeenCalledWith(expect.stringContaining('presell_enabled'))
  if (allowed) expect(rules.reward).toMatchObject({ itemName: 'Catalog name' })
})
