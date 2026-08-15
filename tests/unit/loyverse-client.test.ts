import {
  loyverseRequest,
  loyverseListAll,
  testLoyverseConnection,
  LoyverseApiError,
  LOYVERSE_API_BASE,
} from '@/lib/loyverse/client'

const noSleep = async () => {}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('loyverseRequest', () => {
  it('sends the bearer token and hits the v1.0 base URL', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, { ok: true }))

    await loyverseRequest('tok_1', { path: '/merchant', fetchImpl, sleep: noSleep })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(String(url)).toBe(`${LOYVERSE_API_BASE}/merchant`)
    expect(init.headers.Authorization).toBe('Bearer tok_1')
  })

  it('serializes query params, dropping undefined values', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, {}))

    await loyverseRequest('tok', {
      path: '/items',
      query: { limit: 250, cursor: undefined, show_deleted: false },
      fetchImpl,
      sleep: noSleep,
    })

    const url = new URL(String(fetchImpl.mock.calls[0][0]))
    expect(url.searchParams.get('limit')).toBe('250')
    expect(url.searchParams.get('show_deleted')).toBe('false')
    expect(url.searchParams.has('cursor')).toBe(false)
  })

  it('retries on 429 and succeeds on a later attempt', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { errors: [{ code: 'RATE_LIMITED' }] }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'm1' }))

    const result = await loyverseRequest<{ id: string }>('tok', {
      path: '/merchant',
      fetchImpl,
      sleep: noSleep,
    })

    expect(result).toEqual({ id: 'm1' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('gives up after max attempts and throws a retryable LoyverseApiError', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse(429, { errors: [{ code: 'RATE_LIMITED' }] }))

    await expect(
      loyverseRequest('tok', { path: '/merchant', fetchImpl, sleep: noSleep, maxAttempts: 3 })
    ).rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED', retryable: true })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('does not retry client errors and surfaces the Loyverse error code', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse(401, { errors: [{ code: 'UNAUTHORIZED', details: 'Bad token' }] })
    )

    const promise = loyverseRequest('tok', { path: '/merchant', fetchImpl, sleep: noSleep })
    await expect(promise).rejects.toBeInstanceOf(LoyverseApiError)
    await expect(
      loyverseRequest('tok', { path: '/merchant', fetchImpl, sleep: noSleep })
    ).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED', retryable: false })
    expect(fetchImpl).toHaveBeenCalledTimes(2) // one per call — no retries
  })

  it('flags 402 (merchant subscription lapsed) as non-retryable PAYMENT_REQUIRED', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse(402, { errors: [{ code: 'PAYMENT_REQUIRED' }] })
    )

    await expect(
      loyverseRequest('tok', { path: '/items', fetchImpl, sleep: noSleep })
    ).rejects.toMatchObject({ status: 402, code: 'PAYMENT_REQUIRED', retryable: false })
  })

  it('POSTs a JSON body', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, { receipt_number: '1-1001' }))

    await loyverseRequest('tok', {
      path: '/receipts',
      method: 'POST',
      body: { store_id: 's1' },
      fetchImpl,
      sleep: noSleep,
    })

    const [, init] = fetchImpl.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ store_id: 's1' })
  })
})

describe('loyverseListAll', () => {
  it('follows the cursor until the last page and concatenates the keyed arrays', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { items: [{ id: 'a' }], cursor: 'next1' }))
      .mockResolvedValueOnce(jsonResponse(200, { items: [{ id: 'b' }, { id: 'c' }] }))

    const all = await loyverseListAll<{ id: string }>('tok', '/items', 'items', {
      fetchImpl,
      sleep: noSleep,
    })

    expect(all.map((i) => i.id)).toEqual(['a', 'b', 'c'])
    const secondUrl = new URL(String(fetchImpl.mock.calls[1][0]))
    expect(secondUrl.searchParams.get('cursor')).toBe('next1')
  })

  it('returns an empty array when the key is absent', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, {}))
    const all = await loyverseListAll('tok', '/items', 'items', { fetchImpl, sleep: noSleep })
    expect(all).toEqual([])
  })
})

describe('testLoyverseConnection', () => {
  it('returns merchant, stores and payment types on success', async () => {
    const fetchImpl = jest.fn((input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname
      if (path.endsWith('/merchant')) {
        return Promise.resolve(jsonResponse(200, { id: 'm1', business_name: 'Cafe X' }))
      }
      if (path.endsWith('/stores')) {
        return Promise.resolve(jsonResponse(200, { stores: [{ id: 's1', name: 'Main' }] }))
      }
      if (path.endsWith('/payment_types')) {
        return Promise.resolve(
          jsonResponse(200, { payment_types: [{ id: 'p1', name: 'Cash', type: 'CASH' }] })
        )
      }
      return Promise.resolve(jsonResponse(404, { errors: [{ code: 'NOT_FOUND' }] }))
    })

    const result = await testLoyverseConnection('tok', { fetchImpl, sleep: noSleep })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.merchant.business_name).toBe('Cafe X')
      expect(result.stores).toHaveLength(1)
      expect(result.paymentTypes[0].name).toBe('Cash')
    }
  })

  it('returns a friendly failure instead of throwing on a bad token', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse(401, { errors: [{ code: 'UNAUTHORIZED' }] }))

    const result = await testLoyverseConnection('bad', { fetchImpl, sleep: noSleep })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/token|unauthorized/i)
    }
  })
})
