import { getPhoneLoyaltyProgress } from '@/lib/loyalty/progress-lookup'
import { createAdminClient } from '@/lib/supabase/admin'

jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))

const query = { tenantId: 'tenant-1', phone: '0917 123 4567' }
let tables: Record<string, Record<string, unknown>[]>
let failingTable: string | null

beforeEach(() => {
  jest.clearAllMocks()
  failingTable = null
  tables = {
    tenants: [{ id: 'tenant-1', is_active: true, loyalty_enabled: true, loyalty_shadow: false }],
    loyalty_programs: [{ id: 'program-1', tenant_id: 'tenant-1', name: 'Coffee Club', scope: 'business', outlet_id: null, status: 'active', activates_at: '2026-01-01T00:00:00Z', ends_at: null, current_version_id: 'version-1' }],
    loyalty_program_versions: [{ id: 'version-1', program_id: 'program-1', version: 1, created_at: '2026-01-01T00:00:00Z', rules: { earnMode: 'stamp', threshold: 8, minSpend: null, reward: { type: 'fixed', amount: 100 } } }],
    loyalty_balances: [{ tenant_id: 'tenant-1', program_id: 'program-1', customer_key: 'phone:+639171234567', balance: 5 }],
    loyalty_entitlements: [{ id: 'reward-1', tenant_id: 'tenant-1', program_id: 'program-1', customer_key: 'phone:+639171234567', status: 'issued', expires_at: null }],
  }
  const from = (table: string) => {
    let rows = tables[table] ?? []
    const result = () =>
      failingTable === table
        ? { data: null, count: null, error: { message: 'boom' } }
        : { data: rows, count: rows.length, error: null }
    const builder = {
      select: () => builder,
      eq: (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return builder },
      in: (key: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[key])); return builder },
      not: () => builder,
      or: () => builder,
      single: async () => ({ data: rows[0] ?? null, error: null }),
      maybeSingle: async () => (failingTable === table
        ? { data: null, error: { message: 'boom' } }
        : { data: rows[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    }
    return builder
  }
  jest.mocked(createAdminClient).mockReturnValue({ from } as unknown as ReturnType<typeof createAdminClient>)
})

it('returns the live offer and the number\'s own progress', async () => {
  expect(await getPhoneLoyaltyProgress(query)).toEqual({
    ok: true,
    progress: {
      offer: { programName: 'Coffee Club', earnMode: 'stamp', threshold: 8, rewardLabel: '₱100 off', minSpend: null },
      card: { earnedOnOrder: false, programName: 'Coffee Club', earnMode: 'stamp', balance: 5, threshold: 8, rewardsAvailable: 1, rewardLabel: '₱100 off' },
    },
  })
})

it('accepts any dialling form of the same number', async () => {
  const local = await getPhoneLoyaltyProgress({ ...query, phone: '+63 917 123 4567' })
  expect(local).toMatchObject({ ok: true, progress: { card: { balance: 5 } } })
})

it('shows an empty card for a number the store has never stamped', async () => {
  const result = await getPhoneLoyaltyProgress({ ...query, phone: '09181234567' })
  expect(result).toMatchObject({ ok: true, progress: { card: { balance: 0, rewardsAvailable: 0 } } })
})

it('refuses a number that is not a PH mobile', async () => {
  expect(await getPhoneLoyaltyProgress({ ...query, phone: '12345' })).toEqual({ ok: false, error: 'invalid_phone' })
})

it('says nothing at all while the store is only shadow-earning', async () => {
  tables.tenants[0].loyalty_shadow = true
  expect(await getPhoneLoyaltyProgress(query)).toEqual({ ok: true, progress: { offer: null, card: null } })
})

it('says nothing at all while loyalty is switched off', async () => {
  tables.tenants[0].loyalty_enabled = false
  expect(await getPhoneLoyaltyProgress(query)).toEqual({ ok: true, progress: { offer: null, card: null } })
})

it('says nothing when no program is live yet', async () => {
  tables.loyalty_programs[0].activates_at = null
  expect(await getPhoneLoyaltyProgress(query)).toEqual({ ok: true, progress: { offer: null, card: null } })
})

it('never reads another tenant\'s balance', async () => {
  tables.loyalty_balances[0].tenant_id = 'tenant-2'
  expect(await getPhoneLoyaltyProgress(query)).toMatchObject({ ok: true, progress: { card: { balance: 0 } } })
})

it('reports unavailable rather than inventing a balance', async () => {
  failingTable = 'loyalty_balances'
  expect(await getPhoneLoyaltyProgress(query)).toEqual({ ok: false, error: 'unavailable' })
})
