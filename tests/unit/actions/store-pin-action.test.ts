/** @jest-environment node */
jest.mock('server-only', () => ({}))
jest.mock('@/lib/admin-service', () => ({
  verifyTenantAdmin: jest.fn(async () => ({ user: { id: 'user-1' }, userRole: { role: 'admin' } })),
  verifySuperadmin: jest.fn(async () => ({ user: { id: 'root-0' }, userRole: { role: 'superadmin' } })),
}))
jest.mock('@/lib/maps/apple/mapkit-token', () => ({ readMapKitConfig: jest.fn() }))
jest.mock('@/lib/maps/apple/maps-server-api', () => ({ createAppleMapsClient: jest.fn() }))
jest.mock('@/lib/distributed-rate-limit', () => ({
  checkRateLimit: jest.fn(async () => ({ allowed: true, remaining: 10, retryAfterSec: 0 })),
}))

const TENANT = '3f1c2b9e-1111-4a4a-9999-123456789abc'
const PIN = { lat: 14.6255, lng: 121.0672 }

async function load() {
  const adminService = await import('@/lib/admin-service')
  const token = await import('@/lib/maps/apple/mapkit-token')
  const api = await import('@/lib/maps/apple/maps-server-api')
  const limiter = await import('@/lib/distributed-rate-limit')
  const { checkStorePinAddressAction } = await import('@/app/actions/store-pin')
  return { adminService, token, api, checkRateLimit: jest.mocked(limiter.checkRateLimit), checkStorePinAddressAction }
}

function geocodeTo(api: Awaited<ReturnType<typeof load>>['api'], result: unknown) {
  const geocode = jest.fn(async () => {
    if (result instanceof Error) throw result
    return result
  })
  jest.mocked(api.createAppleMapsClient).mockReturnValue({ geocode } as never)
  return geocode
}

beforeEach(() => jest.clearAllMocks())

describe('checkStorePinAddressAction', () => {
  it('reports how far the pin is from a street-level match for the typed address', async () => {
    const { token, api, adminService, checkStorePinAddressAction } = await load()
    jest.mocked(token.readMapKitConfig).mockReturnValue({ teamId: 't', keyId: 'k', privateKey: 'p' })
    const geocode = geocodeTo(api, [{ coordinates: { lat: 10.31, lng: 123.89 }, isStreetLevel: true }])

    const result = await checkStorePinAddressAction(TENANT, '186B J.P. Rizal, Project 4', PIN.lat, PIN.lng)

    expect(adminService.verifyTenantAdmin).toHaveBeenCalledWith(TENANT)
    expect(geocode).toHaveBeenCalledWith('186B J.P. Rizal, Project 4')
    expect(result.mismatchKm).toBeGreaterThan(500)
  })

  it('needs a superadmin when there is no store yet', async () => {
    const { token, adminService, checkStorePinAddressAction } = await load()
    jest.mocked(token.readMapKitConfig).mockReturnValue(null)

    await checkStorePinAddressAction(null, 'Anywhere', PIN.lat, PIN.lng)

    expect(adminService.verifySuperadmin).toHaveBeenCalled()
    expect(adminService.verifyTenantAdmin).not.toHaveBeenCalled()
  })

  it('never blocks: no Apple key, a failing Apple call or bad input all answer "no mismatch"', async () => {
    const { token, api, checkStorePinAddressAction } = await load()
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    jest.mocked(token.readMapKitConfig).mockReturnValue(null)
    expect(await checkStorePinAddressAction(TENANT, 'Lucena', PIN.lat, PIN.lng)).toEqual({ mismatchKm: null })

    jest.mocked(token.readMapKitConfig).mockReturnValue({ teamId: 't', keyId: 'k', privateKey: 'p' })
    geocodeTo(api, new Error('apple down'))
    expect(await checkStorePinAddressAction(TENANT, 'Lucena', PIN.lat, PIN.lng)).toEqual({ mismatchKm: null })
    expect(await checkStorePinAddressAction(TENANT, '   ', PIN.lat, PIN.lng)).toEqual({ mismatchKm: null })
  })

  // Each check is one geocode against the map quota every store shares.
  describe('how often one person may check', () => {
    const signedIn = { user: { id: 'user-7' }, userRole: { role: 'admin' } }
    const config = { teamId: 't', keyId: 'k', privateKey: 'p' }
    const farAway = [{ coordinates: { lat: 10.31, lng: 123.89 }, isStreetLevel: true }]

    it('counts each geocode per person, by the minute and by the day', async () => {
      const { adminService, token, api, checkRateLimit, checkStorePinAddressAction } = await load()
      jest.mocked(adminService.verifyTenantAdmin).mockResolvedValue(signedIn as never)
      jest.mocked(token.readMapKitConfig).mockReturnValue(config)
      geocodeTo(api, farAway)

      await checkStorePinAddressAction(TENANT, 'Lucena', PIN.lat, PIN.lng)

      expect(checkRateLimit.mock.calls).toEqual([
        ['store-pin-check:user-7', { limit: 20, windowSec: 60, onRedisFailure: 'instance' }],
        ['store-pin-check-day:user-7', { limit: 300, windowSec: 86_400, onRedisFailure: 'instance' }],
      ])
    })

    it('counts a superadmin placing a new store the same way', async () => {
      const { adminService, token, api, checkRateLimit, checkStorePinAddressAction } = await load()
      jest.mocked(adminService.verifySuperadmin).mockResolvedValue({ user: { id: 'root-1' }, userRole: { role: 'superadmin' } } as never)
      jest.mocked(token.readMapKitConfig).mockReturnValue(config)
      geocodeTo(api, farAway)

      await checkStorePinAddressAction(null, 'Lucena', PIN.lat, PIN.lng)

      expect(checkRateLimit.mock.calls[0][0]).toBe('store-pin-check:root-1')
    })

    it.each([[0], [1]])('over the limit answers "no mismatch" without asking the map service (limit %#)', async (refusedCall) => {
      const { adminService, token, api, checkRateLimit, checkStorePinAddressAction } = await load()
      jest.mocked(adminService.verifyTenantAdmin).mockResolvedValue(signedIn as never)
      jest.mocked(token.readMapKitConfig).mockReturnValue(config)
      const geocode = geocodeTo(api, farAway)
      for (let call = 0; call < refusedCall; call += 1) {
        checkRateLimit.mockResolvedValueOnce({ allowed: true, remaining: 1, retryAfterSec: 0 })
      }
      checkRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSec: 30 })

      const result = await checkStorePinAddressAction(TENANT, 'Lucena', PIN.lat, PIN.lng)

      expect(result).toEqual({ mismatchKm: null })
      expect(geocode).not.toHaveBeenCalled()
    })

    it('counts nothing when there is nothing to ask the map service', async () => {
      const { adminService, token, checkRateLimit, checkStorePinAddressAction } = await load()
      jest.mocked(adminService.verifyTenantAdmin).mockResolvedValue(signedIn as never)

      jest.mocked(token.readMapKitConfig).mockReturnValue(null)
      await checkStorePinAddressAction(TENANT, 'Lucena', PIN.lat, PIN.lng)
      jest.mocked(token.readMapKitConfig).mockReturnValue(config)
      await checkStorePinAddressAction(TENANT, '   ', PIN.lat, PIN.lng)

      expect(checkRateLimit).not.toHaveBeenCalled()
    })
  })

  it('refuses a caller who is not an admin of the store', async () => {
    const { adminService, checkStorePinAddressAction } = await load()
    jest.mocked(adminService.verifyTenantAdmin).mockRejectedValueOnce(new Error('Unauthorized'))

    await expect(checkStorePinAddressAction(TENANT, 'x', PIN.lat, PIN.lng)).rejects.toThrow('Unauthorized')
  })
})
export {}
