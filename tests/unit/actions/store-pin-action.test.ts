/** @jest-environment node */
jest.mock('server-only', () => ({}))
jest.mock('@/lib/admin-service', () => ({ verifyTenantAdmin: jest.fn(), verifySuperadmin: jest.fn() }))
jest.mock('@/lib/maps/apple/mapkit-token', () => ({ readMapKitConfig: jest.fn() }))
jest.mock('@/lib/maps/apple/maps-server-api', () => ({ createAppleMapsClient: jest.fn() }))

const TENANT = '3f1c2b9e-1111-4a4a-9999-123456789abc'
const PIN = { lat: 14.6255, lng: 121.0672 }

async function load() {
  const adminService = await import('@/lib/admin-service')
  const token = await import('@/lib/maps/apple/mapkit-token')
  const api = await import('@/lib/maps/apple/maps-server-api')
  const { checkStorePinAddressAction } = await import('@/app/actions/store-pin')
  return { adminService, token, api, checkStorePinAddressAction }
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

  it('refuses a caller who is not an admin of the store', async () => {
    const { adminService, checkStorePinAddressAction } = await load()
    jest.mocked(adminService.verifyTenantAdmin).mockRejectedValueOnce(new Error('Unauthorized'))

    await expect(checkStorePinAddressAction(TENANT, 'x', PIN.lat, PIN.lng)).rejects.toThrow('Unauthorized')
  })
})
export {}
