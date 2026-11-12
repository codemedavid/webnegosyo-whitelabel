import { VALID_LOYALTY, VALID_ORDER_DETAIL, VALID_REWARD_CLAIM } from '@/fixtures/contract-fixtures'
import { createAppClient } from '@/lib/api/app-client'
import { setSessionRefusedHandler } from '@/lib/auth/session-guard'
import { useSession } from '@/lib/stores/session'
import { createLiveSource } from './live-source'

jest.mock('expo-application', () => ({ applicationId: 'com.webnegosyo.kapedemo' }))

const ok = (data: unknown) => ({ status: 200, ok: true, headers: { get: () => null }, json: async () => ({ success: true, data, error: null }) })
const fail = (status: number, code: string, message: string, headers: Record<string, string> = {}) => ({
  status,
  ok: false,
  headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  json: async () => ({ success: false, data: null, error: { code, message } }),
})

function source(fetchImpl: jest.Mock) {
  return createLiveSource(createAppClient({ baseUrl: 'https://store.example.com', applicationId: 'com.webnegosyo.kapedemo', fetch: fetchImpl }), 'https://store.example.com')
}

const draft = {
  orderTypeId: 'ot-pickup',
  outletId: null,
  lines: [{ itemId: 'item-latte', quantity: 1, selections: {} }],
  paymentMethodId: 'pm-cash',
  paymentReference: null,
  voucherCode: null,
  rewardId: null,
  delivery: null,
  notes: '',
}

describe('createLiveSource', () => {
  beforeEach(() => useSession.getState().setMember('cs1.session', { name: 'Ana', phoneE164: '+639171234567' }))
  afterEach(() => {
    setSessionRefusedHandler(null)
    useSession.getState().setGuest()
  })

  it('places an order as the signed-in customer with the attempt’s Idempotency-Key', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(ok(VALID_ORDER_DETAIL))
    await expect(source(fetchImpl).placeOrder(draft, 'app-0123456789abcdef')).resolves.toMatchObject({ id: VALID_ORDER_DETAIL.id })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://store.example.com/api/app/v1/orders')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer cs1.session')
    expect(init.headers['Idempotency-Key']).toBe('app-0123456789abcdef')
    expect(JSON.parse(init.body)).toEqual(draft)
  })

  it('keeps the store’s refusal code and words for the screen', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(fail(422, 'refused', 'We’re closed until 7 AM.'))
    await expect(source(fetchImpl).placeOrder(draft, 'app-0123456789abcdef')).rejects.toMatchObject({ code: 'refused', message: 'We’re closed until 7 AM.' })
  })

  it('pages the history with the cursor and reads one order by id', async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(ok({ orders: [], nextCursor: null })).mockResolvedValueOnce(ok(VALID_ORDER_DETAIL))
    const live = source(fetchImpl)
    await live.getOrders('c/2')
    await live.getOrder('order 1')
    expect(fetchImpl.mock.calls[0][0]).toBe('https://store.example.com/api/app/v1/me/orders?cursor=c%2F2')
    expect(fetchImpl.mock.calls[1][0]).toBe('https://store.example.com/api/app/v1/orders/order%201')
  })

  it('asks for the first page without a cursor', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(ok({ orders: [], nextCursor: null }))
    await source(fetchImpl).getOrders(null)
    expect(fetchImpl.mock.calls[0][0]).toBe('https://store.example.com/api/app/v1/me/orders')
  })

  it('reads an unknown voucher as "no such code", not a failure', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(fail(404, 'not_found', 'No such code'))
    await expect(source(fetchImpl).previewVoucher({ code: 'NOPE', orderTypeId: 'ot-pickup', outletId: null, lines: draft.lines })).resolves.toBeNull()
  })

  it('searches places with the query and branch, and quotes the picked pin', async () => {
    const place = { name: 'SM Aura', address: '26th St, Taguig', lat: 14.54, lng: 121.05 }
    const quote = { fee: 49, freeDeliveryMinimum: null, etaMinutes: 30, quoteToken: 'tok', expiresAt: '2026-11-04T10:05:00Z', distanceKm: 2.1 }
    const fetchImpl = jest.fn().mockResolvedValueOnce(ok({ places: [place] })).mockResolvedValueOnce(ok(quote))
    const live = source(fetchImpl)
    await expect(live.searchPlaces({ q: 'sm aura', outletId: 'o-1' })).resolves.toEqual([place])
    expect(fetchImpl.mock.calls[0][0]).toBe('https://store.example.com/api/app/v1/places?q=sm%20aura&outletId=o-1')
    await expect(live.quoteDelivery({ outletId: 'o-1', address: place.address, lat: place.lat, lng: place.lng })).resolves.toEqual(quote)
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ outletId: 'o-1', address: place.address, lat: place.lat, lng: place.lng })
  })

  it('reads the member’s card as the signed-in customer', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(ok(VALID_LOYALTY))
    const loyalty = await source(fetchImpl).getLoyalty()
    expect(loyalty.memberCode).toBe(VALID_LOYALTY.memberCode)
    expect(loyalty.claimsAvailable).toBe(true)
    expect(loyalty.programs[0].rewardSteps).toHaveLength(2)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://store.example.com/api/app/v1/me/loyalty')
    expect(init.method).toBe('GET')
    expect(init.headers.Authorization).toBe('Bearer cs1.session')
  })

  it('reads a store without loyalty as an empty card, and an older server as “no claims”', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(ok({ memberCode: null, programs: [], rewards: [], activity: [] }))
    await expect(source(fetchImpl).getLoyalty()).resolves.toEqual({
      memberCode: null,
      programs: [],
      rewards: [],
      activity: [],
      claimsAvailable: false,
    })
  })

  it('refuses a card that breaks the contract instead of drawing it', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(ok({ ...VALID_LOYALTY, memberCode: '0917-123-4567' }))
    await expect(source(fetchImpl).getLoyalty()).rejects.toMatchObject({ code: 'internal' })
  })

  it('claims a reward with its id and returns the QR token', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ...ok(VALID_REWARD_CLAIM), status: 201 })
    const rewardId = VALID_LOYALTY.rewards[0].id
    await expect(source(fetchImpl).claimReward(rewardId)).resolves.toEqual(VALID_REWARD_CLAIM)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://store.example.com/api/app/v1/me/loyalty/claims')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer cs1.session')
    expect(JSON.parse(init.body)).toEqual({ rewardId })
  })

  it.each([
    [422, 'refused', 'This reward can’t be used right now.'],
    [429, 'rate_limited', 'Too many tries. Please wait a few minutes.'],
  ])('keeps a %p %s claim answer and its words for the sheet', async (status, code, message) => {
    const fetchImpl = jest.fn().mockResolvedValue(fail(status, code, message, { 'retry-after': '600' }))
    await expect(source(fetchImpl).claimReward(VALID_LOYALTY.rewards[0].id)).rejects.toMatchObject({ code, message })
  })

  it('refuses a claim token that breaks the contract', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(ok({ token: 'WNLC1.not-a-claim', expiresAt: VALID_REWARD_CLAIM.expiresAt }))
    await expect(source(fetchImpl).claimReward(VALID_LOYALTY.rewards[0].id)).rejects.toMatchObject({ code: 'internal' })
  })

  it('never asks for the card or a claim when signed out', async () => {
    useSession.getState().setGuest()
    const fetchImpl = jest.fn()
    await expect(source(fetchImpl).getLoyalty()).rejects.toMatchObject({ code: 'unauthorized' })
    await expect(source(fetchImpl).claimReward(VALID_LOYALTY.rewards[0].id)).rejects.toMatchObject({ code: 'unauthorized' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('signs out when the store refuses the session', async () => {
    const handler = jest.fn().mockResolvedValue(undefined)
    setSessionRefusedHandler(handler)
    const fetchImpl = jest.fn().mockResolvedValue(fail(401, 'unauthorized', 'Please sign in again.'))
    await expect(source(fetchImpl).getOrders(null)).rejects.toMatchObject({ code: 'unauthorized' })
    expect(handler).toHaveBeenCalled()
  })
})
