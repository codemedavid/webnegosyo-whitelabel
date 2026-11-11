/**
 * @jest-environment node
 */
/**
 * POST /api/inventory/dish-availability — the merchant app's stock-aware
 * switch. The store comes from the dish, never from the caller.
 *
 * Who is asking is settled BEFORE anything is read with the service role, and
 * an unknown dish, another store's dish and a caller without `menu` all get the
 * SAME 403 — the route must not tell a stranger which dish ids exist.
 */

const mockSetDishAvailability = jest.fn()
const mockRevalidate = jest.fn()
const mockGetRequestCaller = jest.fn()
const mockCheckRateLimit = jest.fn()
const mockAdminEq = jest.fn()
const mockAdminSelect = jest.fn()
const calls: string[] = []
let dishRow: unknown = null

jest.mock('@/lib/inventory/dish-availability-service', () => ({
  setDishAvailability: (...a: unknown[]) => mockSetDishAvailability(...a),
}))
jest.mock('@/lib/storefront/revalidate', () => ({ revalidateStorefrontMenu: (...a: unknown[]) => mockRevalidate(...a) }))
jest.mock('@/lib/supabase/bearer-session', () => ({ withRequestBearer: (_r: unknown, handler: () => unknown) => handler() }))
jest.mock('@/lib/auth/request-caller', () => ({
  getRequestCaller: () => {
    calls.push('caller')
    return mockGetRequestCaller()
  },
}))
jest.mock('@/lib/distributed-rate-limit', () => ({
  checkRateLimit: (...a: unknown[]) => {
    calls.push('rate')
    return mockCheckRateLimit(...a)
  },
}))
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    calls.push('admin')
    const chain: Record<string, unknown> = {}
    chain.from = () => chain
    chain.select = (columns: string) => {
      mockAdminSelect(columns)
      return chain
    }
    chain.eq = (column: string, value: unknown) => {
      mockAdminEq(column, value)
      return chain
    }
    chain.maybeSingle = () => Promise.resolve({ data: dishRow, error: null })
    return chain
  },
}))

const DISH = '11111111-1111-4111-8111-111111111111'
const TENANT = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'
const USER = { id: 'user-7' }
const MENU_STAFF = { role: 'admin', tenant_id: TENANT, is_owner: false, permissions: ['menu'] }

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
  jest.clearAllMocks()
  calls.length = 0
  dishRow = { tenant_id: TENANT, tenants: { slug: 'lolys-cafe' } }
  mockGetRequestCaller.mockResolvedValue({ user: USER, appUser: MENU_STAFF, roleError: null })
  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 50, retryAfterSec: 30 })
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

it('names the menu_items → tenants foreign key when it reads the store slug', async () => {
  // tenants.hero_featured_product_id also points at menu_items, so a bare
  // `tenants(slug)` embed is ambiguous: PostgREST answers PGRST201 and every
  // toggle in the app failed with "Couldn't update availability" (2026-11-09).
  mockSetDishAvailability.mockResolvedValue({ status: 'saved', isAvailable: false, snoozedUntil: null })
  const { POST } = await load()

  const response = await POST(post({ menuItemId: DISH, isAvailable: false }) as never)

  expect(response.status).toBe(200)
  const [columns] = mockAdminSelect.mock.calls[0] as [string]
  expect(columns).toContain('tenants!menu_items_tenant_id_fkey(slug)')
})

describe('the caller is settled before any service-role read', () => {
  it('authenticates and rate-limits before the admin client is even built', async () => {
    mockSetDishAvailability.mockResolvedValue({ status: 'saved', isAvailable: false, snoozedUntil: null })
    const { POST } = await load()

    await POST(post({ menuItemId: DISH, isAvailable: false }) as never)

    expect(calls.slice(0, 3)).toEqual(['caller', 'rate', 'admin'])
  })

  it('answers 401 with no session, reading nothing', async () => {
    mockGetRequestCaller.mockResolvedValue({ user: null, appUser: null, roleError: null })
    const { POST } = await load()

    const response = await POST(post({ menuItemId: DISH, isAvailable: true }) as never)

    expect(response.status).toBe(401)
    expect(calls).not.toContain('admin')
    expect(mockSetDishAvailability).not.toHaveBeenCalled()
  })

  it('answers 403 for a signed-in visitor with no store account, reading nothing', async () => {
    mockGetRequestCaller.mockResolvedValue({ user: USER, appUser: null, roleError: null })
    const { POST } = await load()

    expect((await POST(post({ menuItemId: DISH, isAvailable: true }) as never)).status).toBe(403)
    expect(calls).not.toContain('admin')
  })

  it('answers 403 for staff without the menu permission, reading nothing', async () => {
    mockGetRequestCaller.mockResolvedValue({ user: USER, appUser: { ...MENU_STAFF, permissions: ['pos'] }, roleError: null })
    const { POST } = await load()

    expect((await POST(post({ menuItemId: DISH, isAvailable: true }) as never)).status).toBe(403)
    expect(calls).not.toContain('admin')
  })

  it("answers 403 for a body naming another store, reading nothing", async () => {
    const { POST } = await load()

    const response = await POST(post({ menuItemId: DISH, isAvailable: true, tenantId: OTHER }) as never)

    expect(response.status).toBe(403)
    expect(calls).not.toContain('admin')
    expect(mockSetDishAvailability).not.toHaveBeenCalled()
  })

  it('lets a superadmin (no store of their own, no tenantId sent) act on the dish’s store', async () => {
    mockGetRequestCaller.mockResolvedValue({ user: USER, appUser: { role: 'superadmin', tenant_id: null }, roleError: null })
    mockSetDishAvailability.mockResolvedValue({ status: 'saved', isAvailable: false, snoozedUntil: null })
    const { POST } = await load()

    const response = await POST(post({ menuItemId: DISH, isAvailable: false }) as never)

    expect(response.status).toBe(200)
    expect(mockSetDishAvailability).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT }))
  })

  it('refuses a signed-in account that is neither a store member nor platform staff, reading nothing', async () => {
    mockGetRequestCaller.mockResolvedValue({ user: USER, appUser: { role: 'customer', tenant_id: null }, roleError: null })
    const { POST } = await load()

    expect((await POST(post({ menuItemId: DISH, isAvailable: false }) as never)).status).toBe(403)
    expect(calls).not.toContain('admin')
  })

  it('reads the dish only inside the caller’s own store', async () => {
    mockSetDishAvailability.mockResolvedValue({ status: 'saved', isAvailable: false, snoozedUntil: null })
    const { POST } = await load()

    await POST(post({ menuItemId: DISH, isAvailable: false }) as never)

    expect(mockAdminEq).toHaveBeenCalledWith('id', DISH)
    expect(mockAdminEq).toHaveBeenCalledWith('tenant_id', TENANT)
  })
})

describe('no existence oracle', () => {
  it('answers an unknown dish (or another store’s) exactly like a refusal', async () => {
    const { POST } = await load()
    dishRow = null
    const unknown = await POST(post({ menuItemId: DISH, isAvailable: true }) as never)

    dishRow = { tenant_id: TENANT, tenants: { slug: 'lolys-cafe' } }
    mockGetRequestCaller.mockResolvedValue({ user: USER, appUser: { ...MENU_STAFF, permissions: ['pos'] }, roleError: null })
    const refused = await POST(post({ menuItemId: DISH, isAvailable: true }) as never)

    expect(unknown.status).toBe(403)
    expect(await unknown.json()).toEqual(await refused.json())
    expect(mockSetDishAvailability).not.toHaveBeenCalled()
  })

  it('answers the service’s own permission refusal with the same 403', async () => {
    mockSetDishAvailability.mockRejectedValue(new Error('Unauthorized: Missing permission for this feature'))
    const { POST } = await load()
    const viaService = await POST(post({ menuItemId: DISH, isAvailable: false }) as never)
    dishRow = null
    const unknown = await POST(post({ menuItemId: DISH, isAvailable: false }) as never)

    expect(viaService.status).toBe(403)
    expect(await viaService.json()).toEqual(await unknown.json())
  })
})

describe('per-person rate limit', () => {
  it('keys the limit on the signed-in person, holding across instances', async () => {
    mockSetDishAvailability.mockResolvedValue({ status: 'saved', isAvailable: false, snoozedUntil: null })
    const { POST } = await load()

    await POST(post({ menuItemId: DISH, isAvailable: false }) as never)

    const [key, options] = mockCheckRateLimit.mock.calls[0] as [string, { onRedisFailure?: string }]
    expect(key).toBe(`dish-availability:${USER.id}`)
    expect(options.onRedisFailure).toBe('instance')
  })

  it('answers 429 past the allowance without reading or writing', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 9 })
    const { POST } = await load()

    const response = await POST(post({ menuItemId: DISH, isAvailable: true }) as never)

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('9')
    expect(calls).not.toContain('admin')
    expect(mockSetDishAvailability).not.toHaveBeenCalled()
  })
})

it('rejects a malformed body', async () => {
  const { POST } = await load()

  expect((await POST(post({ menuItemId: 'nope', isAvailable: 'yes' }) as never)).status).toBe(400)
})

export {}
