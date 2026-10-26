/** @jest-environment node */
describe('app API envelopes', () => {
  const load = async () => import('@/lib/app-api/respond')

  it('wraps data in the success envelope', async () => {
    const { appOk } = await load()
    const response = appOk({ hello: 'world' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, data: { hello: 'world' }, error: null })
  })

  it('passes extra headers through', async () => {
    const { appOk } = await load()
    const response = appOk({}, { headers: { ETag: '"v3"' } })
    expect(response.headers.get('etag')).toBe('"v3"')
  })

  it.each([
    ['bad_request', 400],
    ['unauthorized', 401],
    ['forbidden', 403],
    ['not_found', 404],
    ['conflict', 409],
    ['rate_limited', 429],
    ['unavailable', 503],
    ['internal', 500],
  ] as const)('maps %s to HTTP %i and never caches it', async (code, status) => {
    const { appFail } = await load()
    const response = appFail(code, 'Something went wrong')
    expect(response.status).toBe(status)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ success: false, data: null, error: { code, message: 'Something went wrong' } })
  })

  it('tells a rate-limited caller when to retry', async () => {
    const { appFail } = await load()
    const response = appFail('rate_limited', 'Slow down', { retryAfterSec: 42 })
    expect(response.headers.get('retry-after')).toBe('42')
  })
})
