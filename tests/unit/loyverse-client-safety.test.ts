/**
 * Request-safety rules of the Loyverse client: bounded waits, and never
 * re-sending a non-idempotent POST that may already have been processed.
 */
import { loyverseRequest, loyverseListAll } from '@/lib/loyverse/client'

const noSleep = async () => {}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
  } as unknown as Response
}

describe('loyverseRequest — retry policy', () => {
  it('does not retry a POST that failed with a 5xx — the receipt may already exist', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(502, null))

    await expect(
      loyverseRequest('tok', { path: '/receipts', method: 'POST', body: {}, fetchImpl, sleep: noSleep })
    ).rejects.toMatchObject({ status: 502 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('retries a POST that was rate limited — a 429 was never processed', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, null))
      .mockResolvedValueOnce(jsonResponse(200, { receipt_number: 'R1' }))

    const result = await loyverseRequest('tok', { path: '/receipts', method: 'POST', body: {}, fetchImpl, sleep: noSleep })

    expect(result).toEqual({ receipt_number: 'R1' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('does not retry a POST after a network failure', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError('socket hang up'))

    await expect(
      loyverseRequest('tok', { path: '/receipts', method: 'POST', body: {}, fetchImpl, sleep: noSleep })
    ).rejects.toThrow('socket hang up')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('retries a GET after a network failure', async () => {
    const fetchImpl = jest
      .fn()
      .mockRejectedValueOnce(new TypeError('socket hang up'))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'm1' }))

    await expect(loyverseRequest('tok', { path: '/merchant', fetchImpl, sleep: noSleep })).resolves.toEqual({ id: 'm1' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('waits at least the server-requested Retry-After, capped', async () => {
    const sleep = jest.fn(async () => {})
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, null, { 'retry-after': '5' }))
      .mockResolvedValueOnce(jsonResponse(429, null, { 'retry-after': '600' }))
      .mockResolvedValueOnce(jsonResponse(200, {}))

    await loyverseRequest('tok', { path: '/merchant', fetchImpl, sleep })

    expect(sleep).toHaveBeenNthCalledWith(1, 5000)
    expect(sleep).toHaveBeenNthCalledWith(2, 10_000)
  })
})

describe('loyverseRequest — bounded waits and empty bodies', () => {
  it('aborts a request that outlives its timeout', async () => {
    const fetchImpl = jest.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        })
    )

    await expect(
      loyverseRequest('tok', { path: '/merchant', fetchImpl, sleep: noSleep, timeoutMs: 10, maxAttempts: 1 })
    ).rejects.toMatchObject({ code: 'TIMEOUT' })
  })

  it('retries a GET that timed out, but never a POST', async () => {
    const hang = jest.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        })
    )

    await expect(
      loyverseRequest('tok', { path: '/merchant', fetchImpl: hang, sleep: noSleep, timeoutMs: 10, maxAttempts: 2 })
    ).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(hang).toHaveBeenCalledTimes(2)

    hang.mockClear()
    await expect(
      loyverseRequest('tok', { path: '/receipts', method: 'POST', body: {}, fetchImpl: hang, sleep: noSleep, timeoutMs: 10, maxAttempts: 2 })
    ).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(hang).toHaveBeenCalledTimes(1)
  })

  it('returns undefined for a 204 No Content (DELETE)', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => {
        throw new Error('no body')
      },
    } as unknown as Response)

    await expect(
      loyverseRequest('tok', { path: '/webhooks/wh1', method: 'DELETE', fetchImpl, sleep: noSleep })
    ).resolves.toBeUndefined()
  })
})

describe('loyverseListAll — pagination guard', () => {
  it('stops when Loyverse repeats a cursor instead of looping forever', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, { items: [{ id: 'a' }], cursor: 'same' }))

    const items = await loyverseListAll('tok', '/items', 'items', { fetchImpl, sleep: noSleep })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(items).toHaveLength(2)
  })
})
