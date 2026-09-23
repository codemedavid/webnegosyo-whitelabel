/**
 * Rate limiting for server actions, which have no Request object: the client
 * IP comes from `next/headers`.
 */

jest.mock('next/headers', () => ({
  headers: jest.fn(),
}))

jest.mock('@/lib/distributed-rate-limit', () => ({
  checkRateLimit: jest.fn(),
}))

function headerBag(values: Record<string, string>) {
  return { get: (name: string) => values[name.toLowerCase()] ?? null }
}

async function load() {
  const nextHeaders = await import('next/headers')
  const limiter = await import('@/lib/distributed-rate-limit')
  const actions = await import('@/lib/action-rate-limit')
  return {
    headers: jest.mocked(nextHeaders.headers),
    checkRateLimit: jest.mocked(limiter.checkRateLimit),
    ...actions,
  }
}

describe('action rate limiting', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  it('reads the client IP from x-forwarded-for (first hop)', async () => {
    const { headers, getActionClientIp } = await load()
    headers.mockResolvedValue(headerBag({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }) as never)

    await expect(getActionClientIp()).resolves.toBe('203.0.113.7')
  })

  it('falls back to x-real-ip', async () => {
    const { headers, getActionClientIp } = await load()
    headers.mockResolvedValue(headerBag({ 'x-real-ip': '198.51.100.2' }) as never)

    await expect(getActionClientIp()).resolves.toBe('198.51.100.2')
  })

  it('returns null when headers() is unavailable (outside a request)', async () => {
    const { headers, getActionClientIp } = await load()
    headers.mockRejectedValue(new Error('outside request scope'))

    await expect(getActionClientIp()).resolves.toBeNull()
  })

  it('checkOrderRateLimit keys on tenant AND client IP', async () => {
    const { headers, checkRateLimit, checkOrderRateLimit } = await load()
    headers.mockResolvedValue(headerBag({ 'x-real-ip': '198.51.100.2' }) as never)
    checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 12 })

    const result = await checkOrderRateLimit('tenant-1')

    expect(result).toEqual({ allowed: false, retryAfterSec: 12 })
    const [key, options] = checkRateLimit.mock.calls[0]
    expect(key).toBe('order:tenant-1:198.51.100.2')
    expect(options.limit).toBeGreaterThan(0)
  })

  it('checkOrderRateLimit allows when the client IP cannot be determined', async () => {
    const { headers, checkRateLimit, checkOrderRateLimit } = await load()
    headers.mockResolvedValue(headerBag({}) as never)

    const result = await checkOrderRateLimit('tenant-1')

    expect(result.allowed).toBe(true)
    expect(checkRateLimit).not.toHaveBeenCalled()
  })
})

// A module, not a script: without this, top-level helpers collide across test files under tsc.
export {};
