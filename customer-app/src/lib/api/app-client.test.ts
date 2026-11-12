import { z } from 'zod'
import { AppApiError, createAppClient } from './app-client'

const schema = z.object({ hello: z.string() })

function response(status: number, body: unknown, headers: Record<string, string> = {}) {
  return { status, ok: status >= 200 && status < 300, headers: { get: (name: string) => headers[name.toLowerCase()] ?? null }, json: async () => body }
}

function client(fetchImpl: jest.Mock) {
  return createAppClient({ baseUrl: 'https://api.example.com/', applicationId: 'com.webnegosyo.kapedemo', fetch: fetchImpl })
}

describe('createAppClient', () => {
  it('sends the build identity and unwraps the success envelope through the schema', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(200, { success: true, data: { hello: 'world' }, error: null }))
    await expect(client(fetchImpl).get('/api/app/v1/config', schema)).resolves.toEqual({ hello: 'world' })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.example.com/api/app/v1/config')
    expect(init.headers['X-App-Id']).toBe('com.webnegosyo.kapedemo')
  })

  it('turns an error envelope into an AppApiError the screens can show', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(404, { success: false, data: null, error: { code: 'not_found', message: 'No store' } }))
    const error = await client(fetchImpl).get('/x', schema).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(AppApiError)
    expect(error).toMatchObject({ code: 'not_found', message: 'No store' })
  })

  it('keeps the questions a refusal names, and ignores a malformed list', async () => {
    const fieldErrors = [{ fieldName: 'pickup_date', message: 'Pickup date is required' }]
    const refusal = (errors: unknown) => jest.fn().mockResolvedValue(response(422, { success: false, data: null, error: { code: 'refused', message: 'No', fieldErrors: errors } }))
    await expect(client(refusal(fieldErrors)).send('POST', '/x', schema)).rejects.toMatchObject({ code: 'refused', fieldErrors })
    await expect(client(refusal([{ fieldName: 7 }])).send('POST', '/x', schema)).rejects.toMatchObject({ code: 'refused', fieldErrors: [] })
  })

  it('refuses a payload that fails the contract instead of rendering it', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(200, { success: true, data: { hello: 42 }, error: null }))
    await expect(client(fetchImpl).get('/x', schema)).rejects.toMatchObject({ code: 'internal' })
  })

  it('reports a network failure as unavailable', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError('Network request failed'))
    await expect(client(fetchImpl).get('/x', schema)).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('revalidates with the last ETag and reuses the cached body on 304', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response(200, { success: true, data: { hello: 'world' }, error: null }, { etag: '"v1"' }))
      .mockResolvedValueOnce(response(304, null, { etag: '"v1"' }))
    const api = client(fetchImpl)
    await api.get('/x', schema)
    await expect(api.get('/x', schema)).resolves.toEqual({ hello: 'world' })
    expect(fetchImpl.mock.calls[1][1].headers['If-None-Match']).toBe('"v1"')
  })
  it('sends a JSON body and the session as a bearer token', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(202, { success: true, data: { hello: 'sent' }, error: null }))
    await client(fetchImpl).send('POST', '/api/app/v1/auth/otp/request', schema, { body: { phone: '09171234567' }, token: 'cs1.abc' })
    const [, init] = fetchImpl.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer cs1.abc')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ phone: '09171234567' })
  })

  it('never caches a send, so a repeated POST is a new request', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(200, { success: true, data: { hello: 'x' }, error: null }, { etag: '"v1"' }))
    const api = client(fetchImpl)
    await api.send('PATCH', '/me', schema, { body: {} })
    await api.send('PATCH', '/me', schema, { body: {} })
    expect(fetchImpl.mock.calls[1][1].headers['If-None-Match']).toBeUndefined()
  })

  it('sends extra headers such as Idempotency-Key, but never lets them replace its own', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(200, { success: true, data: { hello: 'placed' }, error: null }))
    await client(fetchImpl).send('POST', '/api/app/v1/orders', schema, {
      body: {},
      token: 'cs1.abc',
      headers: { 'Idempotency-Key': 'app-1234abcd', 'X-App-Id': 'com.someone.else', Authorization: 'Bearer forged' },
    })
    const [, init] = fetchImpl.mock.calls[0]
    expect(init.headers['Idempotency-Key']).toBe('app-1234abcd')
    expect(init.headers['X-App-Id']).toBe('com.webnegosyo.kapedemo')
    expect(init.headers.Authorization).toBe('Bearer cs1.abc')
  })

  it('passes the server error code through, including refused and conflict', async () => {
    for (const code of ['refused', 'conflict', 'rate_limited'] as const) {
      const fetchImpl = jest.fn().mockResolvedValue(response(409, { success: false, data: null, error: { code, message: `Store says ${code}` } }))
      await expect(client(fetchImpl).send('POST', '/x', schema, { body: {} })).rejects.toMatchObject({ code, message: `Store says ${code}` })
    }
  })

  it('reads a 5xx without an envelope as internal', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ status: 502, ok: false, headers: { get: () => null }, json: async () => Promise.reject(new SyntaxError('html')) })
    await expect(client(fetchImpl).send('POST', '/x', schema, { body: {} })).rejects.toMatchObject({ code: 'internal' })
  })
})
