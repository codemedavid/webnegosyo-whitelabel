/** @jest-environment node */
import { appDeliveryQuoteSchema } from '@/lib/app-contract'
import { decodeAppQuoteToken } from '@/lib/app-api/delivery/quote-token'
import {
  BRANCH_NO_DELIVERY_MESSAGE,
  NO_DELIVERY_MESSAGE,
  QUOTE_REFUSED_CODE,
  quoteAppDelivery,
  type DeliveryQuoteDeps,
  type DeliveryQuoteTenant,
} from '@/lib/app-api/delivery/quote'

const TENANT_ID = '00000000-0000-4000-8000-000000000001'
const STORE_PIN = { restaurant_latitude: 14.6, restaurant_longitude: 121.0 }
const NEARBY = { outletId: null, address: '12 Mabini St, Quezon City', lat: 14.62, lng: 121.01 }

const distanceStore: DeliveryQuoteTenant = {
  id: TENANT_ID,
  ...STORE_PIN,
  lalamove_enabled: false,
  distance_delivery_enabled: true,
  delivery_price_per_km: 10,
  delivery_min_fee: 50,
  delivery_radius_km: 10,
  free_delivery_min_order: '500',
}

function deps(overrides: Partial<DeliveryQuoteDeps> = {}, tenant: DeliveryQuoteTenant | null = distanceStore): DeliveryQuoteDeps {
  return {
    readTenant: jest.fn(async () => tenant),
    readOutlets: jest.fn(async () => []),
    readOrderTypeKinds: jest.fn(async () => ['pickup', 'delivery']),
    quoteLalamove: jest.fn(async () => {
      throw new Error('Lalamove should not be called')
    }),
    measureKm: jest.fn(async () => 6),
    ...overrides,
  }
}

describe('quoteAppDelivery — distance stores', () => {
  it('prices by road distance with the checkout formula and returns the raw fee + free-delivery minimum', async () => {
    const injected = deps()
    const outcome = await quoteAppDelivery(TENANT_ID, NEARBY, injected)
    expect(outcome).toEqual({
      ok: true,
      quote: { fee: 60, freeDeliveryMinimum: 500, etaMinutes: null, quoteToken: null, expiresAt: null, distanceKm: 6 },
    })
    if (outcome.ok) expect(appDeliveryQuoteSchema.parse(outcome.quote)).toEqual(outcome.quote)
    expect(injected.measureKm).toHaveBeenCalledWith({ lat: 14.6, lng: 121.0 }, { lat: 14.62, lng: 121.01 })
  })

  it('refuses an address outside the radius with the store’s own wording', async () => {
    const outcome = await quoteAppDelivery(TENANT_ID, NEARBY, deps({ measureKm: jest.fn(async () => 14) }))
    expect(outcome).toEqual({
      ok: false,
      code: QUOTE_REFUSED_CODE,
      message: 'Sorry, this address is outside our delivery area (10 km by road).',
    })
  })

  it('never spends a road lookup on a pin already beyond the radius by straight line', async () => {
    const injected = deps()
    const outcome = await quoteAppDelivery(TENANT_ID, { ...NEARBY, lat: 15.5 }, injected)
    expect(outcome.ok).toBe(false)
    expect(injected.measureKm).not.toHaveBeenCalled()
  })

  it('says the store is not set up when it has no pin', async () => {
    const outcome = await quoteAppDelivery(TENANT_ID, NEARBY, deps({}, { ...distanceStore, restaurant_latitude: null }))
    expect(outcome).toMatchObject({ ok: false, code: 'unavailable' })
  })

  it('bills no fee when the store has no delivery pricing, as the checkout does', async () => {
    const outcome = await quoteAppDelivery(TENANT_ID, NEARBY, deps({}, { ...distanceStore, distance_delivery_enabled: false, free_delivery_min_order: null }))
    expect(outcome).toEqual({
      ok: true,
      quote: { fee: 0, freeDeliveryMinimum: null, etaMinutes: null, quoteToken: null, expiresAt: null, distanceKm: null },
    })
  })

  it('refuses when delivery is not an online order type', async () => {
    const outcome = await quoteAppDelivery(TENANT_ID, NEARBY, deps({ readOrderTypeKinds: jest.fn(async () => ['pickup']) }))
    expect(outcome).toEqual({ ok: false, code: QUOTE_REFUSED_CODE, message: NO_DELIVERY_MESSAGE })
  })
})

describe('quoteAppDelivery — branches', () => {
  const multi = { ...distanceStore, multi_branch_enabled: true }
  const outlets = [
    { id: 'b1', name: 'Cubao', is_active: true, supports_delivery: true },
    { id: 'b2', name: 'Makati', is_active: true, supports_delivery: false },
  ]

  it('refuses a branch that is not the store’s', async () => {
    const outcome = await quoteAppDelivery(TENANT_ID, { ...NEARBY, outletId: 'someone-elses' }, deps({ readOutlets: jest.fn(async () => outlets) }, multi))
    expect(outcome).toMatchObject({ ok: false, code: QUOTE_REFUSED_CODE, message: expect.stringMatching(/Choose a branch/) })
  })

  it('refuses a missing branch once the store has branches', async () => {
    const outcome = await quoteAppDelivery(TENANT_ID, NEARBY, deps({ readOutlets: jest.fn(async () => outlets) }, multi))
    expect(outcome).toMatchObject({ ok: false, code: QUOTE_REFUSED_CODE })
  })

  it('refuses a branch that does not deliver, and quotes one that does', async () => {
    const injected = deps({ readOutlets: jest.fn(async () => outlets) }, multi)
    await expect(quoteAppDelivery(TENANT_ID, { ...NEARBY, outletId: 'b2' }, injected)).resolves.toEqual({
      ok: false,
      code: QUOTE_REFUSED_CODE,
      message: BRANCH_NO_DELIVERY_MESSAGE,
    })
    await expect(quoteAppDelivery(TENANT_ID, { ...NEARBY, outletId: 'b1' }, injected)).resolves.toMatchObject({ ok: true })
  })

  it('ignores the branch on a single-location store (as the checkout does)', async () => {
    const injected = deps()
    await expect(quoteAppDelivery(TENANT_ID, { ...NEARBY, outletId: 'anything' }, injected)).resolves.toMatchObject({ ok: true })
    expect(injected.readOutlets).not.toHaveBeenCalled()
  })
})

describe('quoteAppDelivery — Lalamove stores', () => {
  const lalamoveStore = { ...distanceStore, lalamove_enabled: true }
  const signed = {
    ok: true as const,
    quotationId: 'Q-9',
    fee: 132,
    currency: 'PHP',
    providerExpiresAt: Date.parse('2026-11-04T08:05:00Z'),
    signatureExpiresAt: Date.parse('2026-11-04T08:04:00Z'),
    quoteSignature: 'body.mac',
  }

  it('returns the signed fee as an opaque token that decodes to the quotation + signature', async () => {
    const quoteLalamove = jest.fn(async () => signed)
    const injected = deps({ quoteLalamove }, lalamoveStore)
    const outcome = await quoteAppDelivery(TENANT_ID, NEARBY, injected)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.quote).toMatchObject({ fee: 132, freeDeliveryMinimum: 500, distanceKm: null, expiresAt: '2026-11-04T08:04:00.000Z' })
    expect(decodeAppQuoteToken(outcome.quote.quoteToken)).toEqual({ quotationId: 'Q-9', signature: 'body.mac' })
    expect(appDeliveryQuoteSchema.safeParse(outcome.quote).success).toBe(true)
    expect(quoteLalamove).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ source: 'store', outletId: null, point: { lat: 14.6, lng: 121 } }),
      { address: NEARBY.address, lat: NEARBY.lat, lng: NEARBY.lng },
    )
    expect(injected.measureKm).not.toHaveBeenCalled()
  })

  it('answers unavailable when Lalamove fails or signing is off, and passes on the store’s busy limit', async () => {
    const failing = deps({ quoteLalamove: jest.fn(async () => { throw new Error('ERR_OUT_OF_SERVICE_AREA') }) }, lalamoveStore)
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(quoteAppDelivery(TENANT_ID, NEARBY, failing)).resolves.toMatchObject({ ok: false, code: 'unavailable' })
    errorSpy.mockRestore()

    const unsigned = deps({ quoteLalamove: jest.fn(async () => ({ ok: false as const, reason: 'unsigned' as const, error: 'x' })) }, lalamoveStore)
    await expect(quoteAppDelivery(TENANT_ID, NEARBY, unsigned)).resolves.toMatchObject({ ok: false, code: 'unavailable' })

    const busy = deps({ quoteLalamove: jest.fn(async () => ({ ok: false as const, reason: 'rate-limited' as const, retryAfterSec: 20 })) }, lalamoveStore)
    await expect(quoteAppDelivery(TENANT_ID, NEARBY, busy)).resolves.toMatchObject({ ok: false, code: 'rate_limited', retryAfterSec: 20 })
  })
})
