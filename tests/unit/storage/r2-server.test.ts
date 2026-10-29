/**
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'

jest.mock('server-only', () => ({}))

const ENV = { R2_ACCOUNT_ID: 'acc', R2_ACCESS_KEY_ID: 'AKID', R2_SECRET_ACCESS_KEY: 'secret' }

type FetchArgs = [RequestInfo | URL, RequestInit | undefined]

describe('r2-server', () => {
  const ORIGINAL_ENV = process.env
  const originalFetch = global.fetch
  let calls: Request[]

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...ORIGINAL_ENV, ...ENV }
    calls = []
    global.fetch = jest.fn(async (...args: FetchArgs) => {
      calls.push(args[0] instanceof Request ? args[0] : new Request(args[0], args[1]))
      return new Response(null, { status: 200 })
    }) as unknown as typeof fetch
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  it('stores bytes with no-overwrite and an immutable cache policy, signed with SigV4', async () => {
    const { putR2Object } = await import('@/lib/storage/r2-server')

    const result = await putR2Object('menu-items/t1/a-1.jpg', new Uint8Array([1, 2, 3]), 'image/jpeg')

    expect(result).toEqual({
      url: 'https://media.webnegosyo.com/menu-items/t1/a-1.jpg',
      fileId: 'r2:menu-items/t1/a-1.jpg',
      filePath: 'menu-items/t1/a-1.jpg',
    })
    const req = calls[0]
    expect(req.method).toBe('PUT')
    expect(req.url).toBe('https://acc.r2.cloudflarestorage.com/webnegosyo-media/menu-items/t1/a-1.jpg')
    expect(req.headers.get('if-none-match')).toBe('*')
    expect(req.headers.get('cache-control')).toContain('immutable')
    expect(req.headers.get('authorization')).toMatch(/^AWS4-HMAC-SHA256 Credential=AKID\//)
  })

  it('throws instead of pretending when R2 refuses the write', async () => {
    global.fetch = jest.fn(async () => new Response('PreconditionFailed', { status: 412 })) as unknown as typeof fetch
    const { putR2Object } = await import('@/lib/storage/r2-server')

    await expect(putR2Object('a/b.jpg', new Uint8Array([1]), 'image/jpeg')).rejects.toThrow('(412)')
  })

  it('throws when R2 is not configured', async () => {
    delete process.env.R2_SECRET_ACCESS_KEY
    const { putR2Object } = await import('@/lib/storage/r2-server')

    await expect(putR2Object('a/b.jpg', new Uint8Array([1]), 'image/jpeg')).rejects.toThrow('not configured')
  })

  it('presigns a PUT that binds type, exact size, cache policy and no-overwrite', async () => {
    const { presignR2Put } = await import('@/lib/storage/r2-server')

    const signed = await presignR2Put('menu-items/t1/a-1.jpg', 'image/jpeg', 2048)
    const query = new URL(signed.uploadUrl).searchParams

    expect(query.get('X-Amz-SignedHeaders')).toBe('cache-control;content-length;content-type;host;if-none-match')
    expect(Number(query.get('X-Amz-Expires'))).toBeLessThanOrEqual(600)
    expect(signed.method).toBe('PUT')
    expect(signed.headers).toEqual({
      'content-type': 'image/jpeg',
      'cache-control': 'public, max-age=31536000, immutable',
      'if-none-match': '*',
    })
    expect(signed.url).toBe('https://media.webnegosyo.com/menu-items/t1/a-1.jpg')
    expect(calls).toHaveLength(0)
  })

  it('maps r2 file ids back to keys and refuses traversal', async () => {
    const { r2KeyFromFileId } = await import('@/lib/storage/r2-server')

    expect(r2KeyFromFileId('r2:payment-proofs/a-1.jpg')).toBe('payment-proofs/a-1.jpg')
    expect(r2KeyFromFileId('abc123')).toBeNull()
    expect(r2KeyFromFileId('r2:payment-proofs/../logos/x.png')).toBeNull()
    expect(r2KeyFromFileId('r2:/etc')).toBeNull()
    expect(r2KeyFromFileId('r2:')).toBeNull()
  })

  it('reads size and age, and treats a missing object as null', async () => {
    global.fetch = jest.fn(async () =>
      new Response(null, { status: 200, headers: { 'content-length': '10', 'last-modified': 'Thu, 29 Oct 2026 10:00:00 GMT' } }),
    ) as unknown as typeof fetch
    const { headR2Object } = await import('@/lib/storage/r2-server')
    expect(await headR2Object('a/b.jpg')).toEqual({ size: 10, lastModified: Date.parse('2026-10-29T10:00:00Z') })

    global.fetch = jest.fn(async () => new Response(null, { status: 404 })) as unknown as typeof fetch
    expect(await headR2Object('a/b.jpg')).toBeNull()
  })

  it('deletes (gone counts as done) and reports failure without throwing', async () => {
    const { deleteR2Object } = await import('@/lib/storage/r2-server')
    global.fetch = jest.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch
    expect(await deleteR2Object('payment-proofs/a.jpg')).toBe(true)
    global.fetch = jest.fn(async () => new Response(null, { status: 404 })) as unknown as typeof fetch
    expect(await deleteR2Object('payment-proofs/a.jpg')).toBe(true)
    global.fetch = jest.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch
    expect(await deleteR2Object('payment-proofs/a.jpg')).toBe(false)
  })
})
