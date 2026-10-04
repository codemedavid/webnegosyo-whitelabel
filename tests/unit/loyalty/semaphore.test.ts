/** @jest-environment node */
import { sendSemaphoreOtp, verifySemaphoreKey, isSemaphoreApiKey, isSemaphoreSenderName } from '@/lib/loyalty/semaphore'

const KEY = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'

function reply(status: number, body: unknown) {
  return Promise.resolve(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }))
}

describe('sendSemaphoreOtp', () => {
  test('posts the OTP route with our code, the template and the local number format', async () => {
    const fetchImpl = jest.fn(() => reply(200, [{ message_id: 9, status: 'Pending' }]))
    const result = await sendSemaphoreOtp(
      { apiKey: KEY, senderName: 'CAFE' },
      { phone: '+639171234567', code: '012345', template: '{otp} is your Cafe reward code.' },
      { fetchImpl },
    )
    expect(result).toEqual({ ok: true })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.semaphore.co/api/v4/otp')
    expect(init.method).toBe('POST')
    const body = new URLSearchParams(init.body as string)
    expect(body.get('apikey')).toBe(KEY)
    expect(body.get('number')).toBe('639171234567')
    expect(body.get('code')).toBe('012345')
    expect(body.get('message')).toBe('{otp} is your Cafe reward code.')
    expect(body.get('sendername')).toBe('CAFE')
  })

  test('omits the sender name when the store has none, so Semaphore uses the account default', async () => {
    const fetchImpl = jest.fn(() => reply(200, [{ message_id: 1, status: 'Queued' }]))
    await sendSemaphoreOtp({ apiKey: KEY, senderName: null }, { phone: '+639171234567', code: '123456', template: '{otp}' }, { fetchImpl })
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(new URLSearchParams(init.body as string).has('sendername')).toBe(false)
  })

  test.each([
    ['validation errors come back as an object, not a message list', 200, { apikey: ['The selected apikey is invalid.'] }],
    ['an HTTP error', 401, { message: 'Unauthorized' }],
    ['an empty list', 200, []],
    ['a message Semaphore already marked failed', 200, [{ message_id: 3, status: 'Failed' }]],
    ['a body that is not JSON', 200, '<html>'],
  ])('reports rejected for %s', async (_label, status, body) => {
    const fetchImpl = jest.fn(() => reply(status, body))
    const result = await sendSemaphoreOtp({ apiKey: KEY, senderName: null }, { phone: '+639171234567', code: '123456', template: '{otp}' }, { fetchImpl })
    expect(result).toEqual({ ok: false, reason: 'rejected' })
  })

  test('reports unreachable when the network fails or the deadline passes', async () => {
    const offline = jest.fn(() => Promise.reject(new Error('offline')))
    expect(await sendSemaphoreOtp({ apiKey: KEY, senderName: null }, { phone: '+639171234567', code: '123456', template: '{otp}' }, { fetchImpl: offline }))
      .toEqual({ ok: false, reason: 'unreachable' })
    const hang = jest.fn((_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    }))
    expect(await sendSemaphoreOtp({ apiKey: KEY, senderName: null }, { phone: '+639171234567', code: '123456', template: '{otp}' }, { fetchImpl: hang, timeoutMs: 10 }))
      .toEqual({ ok: false, reason: 'unreachable' })
  })

  test('never calls out with a malformed phone, code or template', async () => {
    const fetchImpl = jest.fn(() => reply(200, [{ message_id: 1 }]))
    for (const input of [
      { phone: '09171234567', code: '123456', template: '{otp}' },
      { phone: '+639171234567', code: '12345', template: '{otp}' },
      { phone: '+639171234567', code: '123456', template: 'no placeholder' },
    ]) {
      expect(await sendSemaphoreOtp({ apiKey: KEY, senderName: null }, input, { fetchImpl })).toEqual({ ok: false, reason: 'rejected' })
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('verifySemaphoreKey', () => {
  test('accepts a key the account endpoint recognises', async () => {
    const fetchImpl = jest.fn(() => reply(200, { account_id: 7, account_name: 'Cafe', credit_balance: 120 }))
    expect(await verifySemaphoreKey(KEY, { fetchImpl })).toEqual({ ok: true })
    const [url] = fetchImpl.mock.calls[0] as unknown as [string]
    expect(url).toBe(`https://api.semaphore.co/api/v4/account?apikey=${KEY}`)
  })

  test('separates a wrong key from an outage', async () => {
    expect(await verifySemaphoreKey(KEY, { fetchImpl: jest.fn(() => reply(401, { message: 'no' })) }))
      .toEqual({ ok: false, reason: 'invalid_key' })
    expect(await verifySemaphoreKey(KEY, { fetchImpl: jest.fn(() => reply(200, { apikey: ['invalid'] })) }))
      .toEqual({ ok: false, reason: 'invalid_key' })
    expect(await verifySemaphoreKey(KEY, { fetchImpl: jest.fn(() => reply(503, 'down')) }))
      .toEqual({ ok: false, reason: 'unreachable' })
    expect(await verifySemaphoreKey(KEY, { fetchImpl: jest.fn(() => Promise.reject(new Error('x'))) }))
      .toEqual({ ok: false, reason: 'unreachable' })
  })
})

test('key and sender name shapes', () => {
  expect(isSemaphoreApiKey(KEY)).toBe(true)
  expect(isSemaphoreApiKey('short')).toBe(false)
  expect(isSemaphoreApiKey(`${KEY}&number=1`)).toBe(false)
  expect(isSemaphoreSenderName('SEMAPHORE')).toBe(true)
  expect(isSemaphoreSenderName('Cafe 1')).toBe(true)
  expect(isSemaphoreSenderName('TwelveChars1')).toBe(false)
  expect(isSemaphoreSenderName('')).toBe(false)
  expect(isSemaphoreSenderName('Café')).toBe(false)
})
