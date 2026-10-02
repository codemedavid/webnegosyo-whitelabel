/** @jest-environment node */
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveProgramCatalog } from '@/lib/loyalty/program-catalog'
import type { LoyaltyRules } from '@/lib/loyalty/types'

type Row = { id: string; name: string; is_available: boolean; presell_enabled?: boolean; image_url?: string | null }

function catalog(rows: Row[]) {
  const select = jest.fn()
  const client = {
    from: () => ({
      select: (columns: string) => {
        select(columns)
        const query = {
          eq: () => query,
          in: (_column: string, ids: string[]) => Promise.resolve({ data: rows.filter((row) => ids.includes(row.id)), error: null }),
        }
        return query
      },
    }),
  } as unknown as SupabaseClient
  return { client, select }
}

const BASE: LoyaltyRules = {
  earnMode: 'stamp', threshold: 10, pointsPerPeso: null, minSpend: null, rewardExpiryDays: null, isExclusive: true,
  reward: { type: 'free_item', menuItemId: 'item', itemName: 'Client name' },
}

it.each([
  [{ presell_enabled: true }, false],
  [{}, true],
])('only permits redeemable regular items: %j', async (flags, allowed) => {
  const { client, select } = catalog([{ id: 'item', name: 'Catalog name', is_available: true, ...flags }])
  const result = await resolveProgramCatalog(client, 'tenant', BASE)
  expect('rules' in result).toBe(allowed)
  expect(select).toHaveBeenCalledWith(expect.stringContaining('presell_enabled'))
  if ('rules' in result) expect(result.rules.reward).toMatchObject({ itemName: 'Catalog name' })
})

it('canonicalises every rung and snapshots the menu photo without touching the input', async () => {
  const { client } = catalog([
    { id: 'item', name: 'Chicken Meal', is_available: true, image_url: 'https://img/meal.jpg' },
    { id: 'tea', name: 'Iced Tea', is_available: true, image_url: null },
  ])
  const rules: LoyaltyRules = {
    ...BASE,
    milestones: [{ at: 5, reward: { type: 'free_item', menuItemId: 'tea', itemName: 'tea?', emoji: '🥤' } }],
  }
  const result = await resolveProgramCatalog(client, 'tenant', rules)
  expect(result).toEqual({
    rules: {
      ...BASE,
      reward: { type: 'free_item', menuItemId: 'item', itemName: 'Chicken Meal', imageUrl: 'https://img/meal.jpg' },
      milestones: [{ at: 5, reward: { type: 'free_item', menuItemId: 'tea', itemName: 'Iced Tea', emoji: '🥤' } }],
    },
  })
  expect(rules.milestones?.[0].reward).toMatchObject({ itemName: 'tea?' })
})

it('refuses a ladder whose middle reward is no longer on the menu', async () => {
  const { client } = catalog([{ id: 'item', name: 'Meal', is_available: true }])
  const rules: LoyaltyRules = { ...BASE, milestones: [{ at: 5, reward: { type: 'free_item', menuItemId: 'gone', itemName: 'Gone' } }] }
  expect(await resolveProgramCatalog(client, 'tenant', rules)).toEqual({ error: 'Choose an available menu item from this store.' })
})

it('skips the catalog entirely when no rung is a free item', async () => {
  const { client, select } = catalog([])
  const rules: LoyaltyRules = { ...BASE, reward: { type: 'fixed', amount: 50 } }
  expect(await resolveProgramCatalog(client, 'tenant', rules)).toEqual({ rules })
  expect(select).not.toHaveBeenCalled()
})
