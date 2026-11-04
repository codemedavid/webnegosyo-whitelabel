/**
 * @jest-environment node
 */
/**
 * POST /api/inventory/dish-availability — the merchant app's stock-aware
 * switch. The store comes from the dish, never from the caller.
 */

const mockSetDishAvailability = jest.fn()
const mockRevalidate = jest.fn()
let dishRow: unknown = null

jest.mock('@/lib/inventory/dish-availability-service', () => ({
  setDishAvailability: (...a: unknown[]) => mockSetDishAvailability(...a),
}))
jest.mock('@/lib/storefront/revalidate', () => ({ revalidateStorefrontMenu: (...a: unknown[]) => mockRevalidate(...a) }))
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const chain: Record<string, unknown> = {}
    chain.from = () => chain
    chain.select = () => chain
    chain.eq = () => chain
    chain.maybeSingle = () => Promise.resolve({ data: dishRow, error: null })
    return chain
  },
}))

const DISH = '11111111-1111-4111-8111-111111111111'
const TENANT = '22222222-2222-4222-8222-222222222222'

function post(body: unknown) {
  return new Request('http://x/api/inventory/dish-availability', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

async function load() {
  return import('@/app/api/inventory/dish-availability/route')
}

beforeEach(() => {
  mockSetDishAvailability.mockReset()
  mockRevalidate.mockReset()
  dishRow = { tenant_id: TENANT, tenants: { slug: 'lolys-cafe' } }
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

it('asks first instead of saving when the dish reads empty', async () => {
  const question = { status: 'needs_confirmation', blockers: [{ ingredientId: 'e', name: 'Egg', onHand: 0, unit: 'pc' }], sellAnywayUntil: '2026-11-03T16:00:00.000Z' }
  mockSetDishAvailability.mockResolvedValue(question)
  const { POST } = await load()

  const response = await POST(post({ menuItemId: DISH, isAvailable: true }) as never)

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(question)
  expect(mockSetDishAvailability).toHaveBeenCalledWith({ tenantId: TENANT, menuItemId: DISH, isAvailable: true, sellAnyway: undefined })
  expect(mockRevalidate).not.toHaveBeenCalled()
})

it('saves "sell anyway" and refreshes the storefront menu', async () => {
  mockSetDishAvailability.mockResolvedValue({ status: 'saved', isAvailable: true, snoozedUntil: '2026-11-03T16:00:00.000Z' })
  const { POST } = await load()

  const response = await POST(post({ menuItemId: DISH, isAvailable: true, sellAnyway: true }) as never)

  expect(await response.json()).toMatchObject({ status: 'saved' })
  expect(mockRevalidate).toHaveBeenCalledWith('lolys-cafe')
})

it('refuses a body whose tenant disagrees with the dish', async () => {
  const { POST } = await load()

  const response = await POST(post({ menuItemId: DISH, isAvailable: true, tenantId: '33333333-3333-4333-8333-333333333333' }) as never)

  expect(response.status).toBe(404)
  expect(mockSetDishAvailability).not.toHaveBeenCalled()
})

it('answers 403 for a caller without the menu permission', async () => {
  mockSetDishAvailability.mockRejectedValue(new Error('Unauthorized: Missing permission for this feature'))
  const { POST } = await load()

  const response = await POST(post({ menuItemId: DISH, isAvailable: false }) as never)

  expect(response.status).toBe(403)
})

it('rejects a malformed body', async () => {
  const { POST } = await load()

  expect((await POST(post({ menuItemId: 'nope', isAvailable: 'yes' }) as never)).status).toBe(400)
})

export {}
