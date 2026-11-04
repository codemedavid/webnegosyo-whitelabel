/**
 * The stock-aware hand toggle: the permission check comes first, the stock
 * question only for inventory stores, a failed stock read never blocks the
 * toggle, and an RLS refusal (zero rows) is an error — not a success.
 */

const mockVerify = jest.fn()
const mockBlockers = jest.fn()
const mockUntil = jest.fn()
let inventoryEnabled: boolean | null = true
let updatedRows: unknown[] = [{ id: 'dish' }]
const updates: unknown[] = []

jest.mock('@/lib/admin-service', () => ({ verifyTenantPermission: (...a: unknown[]) => mockVerify(...a) }))
jest.mock('@/lib/inventory/dish-availability', () => ({
  ...jest.requireActual('@/lib/inventory/dish-availability'),
  readDishStockBlockers: (...a: unknown[]) => mockBlockers(...a),
  sellAnywayUntil: (...a: unknown[]) => mockUntil(...a),
}))
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const chain: Record<string, unknown> = {}
    chain.from = () => chain
    chain.select = () => chain
    chain.eq = () => chain
    chain.maybeSingle = () => Promise.resolve({ data: { inventory_enabled: inventoryEnabled }, error: null })
    return chain
  },
}))
jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    const chain: Record<string, unknown> = {}
    chain.from = () => chain
    chain.update = (patch: unknown) => { updates.push(patch); return chain }
    chain.eq = () => chain
    chain.select = () => Promise.resolve({ data: updatedRows, error: null })
    return chain
  },
}))

const UNTIL = '2026-11-03T16:00:00.000Z'
const EGG = { ingredientId: 'egg', name: 'Egg', onHand: 0, unit: 'pc' }

async function load() {
  return import('@/lib/inventory/dish-availability-service')
}

beforeEach(() => {
  jest.clearAllMocks()
  updates.length = 0
  inventoryEnabled = true
  updatedRows = [{ id: 'dish' }]
  mockVerify.mockResolvedValue({})
  mockBlockers.mockResolvedValue([EGG])
  mockUntil.mockResolvedValue(UNTIL)
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

it('asks first and writes nothing when the dish cannot be made', async () => {
  const { setDishAvailability } = await load()

  const result = await setDishAvailability({ tenantId: 't', menuItemId: 'dish', isAvailable: true })

  expect(result).toEqual({ status: 'needs_confirmation', blockers: [EGG], sellAnywayUntil: UNTIL })
  expect(updates).toEqual([])
})

it('writes the end-of-day override once the owner says "sell anyway"', async () => {
  const { setDishAvailability } = await load()

  const result = await setDishAvailability({ tenantId: 't', menuItemId: 'dish', isAvailable: true, sellAnyway: true })

  expect(result).toEqual({ status: 'saved', isAvailable: true, snoozedUntil: UNTIL })
  expect(updates).toEqual([{ is_available: true, auto_disabled_at: null, auto_86_snoozed_until: UNTIL }])
})

it('never asks a store that does not track inventory', async () => {
  inventoryEnabled = false
  const { setDishAvailability } = await load()

  const result = await setDishAvailability({ tenantId: 't', menuItemId: 'dish', isAvailable: true })

  expect(result).toMatchObject({ status: 'saved', snoozedUntil: null })
  expect(mockBlockers).not.toHaveBeenCalled()
})

it('turns the dish on without the question when the stock read fails', async () => {
  mockBlockers.mockRejectedValue(new Error('timeout'))
  const { setDishAvailability } = await load()

  const result = await setDishAvailability({ tenantId: 't', menuItemId: 'dish', isAvailable: true })

  expect(result).toMatchObject({ status: 'saved', isAvailable: true, snoozedUntil: null })
})

it('refuses before reading anything when the caller lacks the menu permission', async () => {
  mockVerify.mockRejectedValue(new Error('Unauthorized: Missing permission for this feature'))
  const { setDishAvailability } = await load()

  await expect(setDishAvailability({ tenantId: 't', menuItemId: 'dish', isAvailable: true })).rejects.toThrow('Unauthorized')
  expect(mockBlockers).not.toHaveBeenCalled()
  expect(updates).toEqual([])
})

it('treats an update that touched no row as a refusal', async () => {
  updatedRows = []
  const { setDishAvailability } = await load()

  await expect(setDishAvailability({ tenantId: 't', menuItemId: 'dish', isAvailable: false })).rejects.toThrow('could not be updated')
})

export {}
