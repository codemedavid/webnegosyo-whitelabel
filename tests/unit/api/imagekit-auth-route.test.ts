/**
 * @jest-environment node
 *
 * /api/imagekit/auth issues upload credentials. It was unauthenticated and its
 * v1 signature covered only token+expire, so anyone could upload with
 * overwriteFile=true into any folder and replace any tenant's images.
 *
 *  - POST (current clients): admin/superadmin only, returns a v2 token that
 *    SIGNS folder + fileName + no-overwrite.
 *  - GET (legacy clients, e.g. merchant-app builds that predate the fix):
 *    still served to anonymous callers until IMAGEKIT_AUTH_REQUIRED=true.
 */

import { NextRequest } from 'next/server'

jest.mock('@/lib/imagekit-uploader-auth', () => ({ resolveImageKitUploader: jest.fn() }))
jest.mock('@/lib/imagekit-server', () => ({
  getUploadAuthParams: jest.fn(() => ({ token: 't', expire: 1, signature: 's', publicKey: 'pk' })),
  createSignedUploadToken: jest.fn(({ folder, fileName }: { folder: string; fileName: string }) => ({
    token: 'jwt',
    publicKey: 'pk',
    fields: { fileName, folder, useUniqueFileName: 'true', overwriteFile: 'false' },
    uploadUrl: 'https://upload.imagekit.io/api/v2/files/upload',
  })),
}))
jest.mock('@/lib/distributed-rate-limit', () => ({
  checkRateLimit: jest.fn(async () => ({ allowed: true, remaining: 10, retryAfterSec: 0 })),
}))

const ADMIN = { status: 'authorized', uploader: { userId: 'u1', role: 'admin', tenantId: 't1' } }

async function load() {
  const auth = await import('@/lib/imagekit-uploader-auth')
  const limiter = await import('@/lib/distributed-rate-limit')
  const route = await import('@/app/api/imagekit/auth/route')
  return {
    resolve: jest.mocked(auth.resolveImageKitUploader),
    checkRateLimit: jest.mocked(limiter.checkRateLimit),
    route,
  }
}

function get() {
  return new NextRequest('https://www.webnegosyo.com/api/imagekit/auth', {
    headers: { 'x-real-ip': '203.0.113.5' },
  })
}

function post(body: unknown) {
  return new NextRequest('https://www.webnegosyo.com/api/imagekit/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': '203.0.113.5' },
    body: JSON.stringify(body),
  })
}

describe('/api/imagekit/auth', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...ORIGINAL_ENV }
    delete process.env.IMAGEKIT_AUTH_REQUIRED
    jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
    jest.restoreAllMocks()
  })

  describe('POST (signed v2 token)', () => {
    it('refuses an anonymous caller', async () => {
      const { resolve, route } = await load()
      resolve.mockResolvedValue({ status: 'anonymous' })

      const res = await route.POST(post({ folder: 'menu-items', fileName: 'latte.jpg' }))

      expect(res.status).toBe(401)
    })

    it('refuses a signed-in non-admin', async () => {
      const { resolve, route } = await load()
      resolve.mockResolvedValue({ status: 'denied' })

      const res = await route.POST(post({ folder: 'menu-items', fileName: 'latte.jpg' }))

      expect(res.status).toBe(403)
    })

    it('issues a token that binds the sanitised folder and file name for an admin', async () => {
      const { resolve, route } = await load()
      resolve.mockResolvedValue(ADMIN as never)

      const res = await route.POST(post({ folder: '/platform/whats-new', fileName: 'cover photo.png' }))

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.token).toBe('jwt')
      expect(body.fields).toEqual({
        fileName: 'cover_photo.png',
        folder: 'platform/whats-new',
        useUniqueFileName: 'true',
        overwriteFile: 'false',
      })
      expect(res.headers.get('cache-control')).toMatch(/no-store/)
    })

    it('rejects a traversal folder even for an admin', async () => {
      const { resolve, route } = await load()
      resolve.mockResolvedValue(ADMIN as never)

      const res = await route.POST(post({ folder: '../tenants', fileName: 'x.png' }))

      expect(res.status).toBe(400)
    })

    it('is rate limited per client', async () => {
      const { resolve, checkRateLimit, route } = await load()
      resolve.mockResolvedValue(ADMIN as never)
      checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 30 })

      const res = await route.POST(post({ folder: 'menu-items', fileName: 'x.png' }))

      expect(res.status).toBe(429)
    })
  })

  describe('GET (legacy v1 params)', () => {
    it('still serves an anonymous legacy caller while IMAGEKIT_AUTH_REQUIRED is unset', async () => {
      const { resolve, route } = await load()
      resolve.mockResolvedValue({ status: 'anonymous' })

      const res = await route.GET(get())

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ token: 't', expire: 1, signature: 's', publicKey: 'pk' })
    })

    it('refuses an anonymous legacy caller once IMAGEKIT_AUTH_REQUIRED=true', async () => {
      process.env.IMAGEKIT_AUTH_REQUIRED = 'true'
      const { resolve, route } = await load()
      resolve.mockResolvedValue({ status: 'anonymous' })

      const res = await route.GET(get())

      expect(res.status).toBe(401)
    })

    it('serves an authenticated admin even with enforcement on', async () => {
      process.env.IMAGEKIT_AUTH_REQUIRED = 'true'
      const { resolve, route } = await load()
      resolve.mockResolvedValue(ADMIN as never)

      const res = await route.GET(get())

      expect(res.status).toBe(200)
    })

    it('refuses non-admin credentials once enforcement is on', async () => {
      process.env.IMAGEKIT_AUTH_REQUIRED = 'true'
      const { resolve, route } = await load()
      resolve.mockResolvedValue({ status: 'denied' })

      const res = await route.GET(get())

      expect(res.status).toBe(403)
    })

    it('is rate limited per client', async () => {
      const { resolve, checkRateLimit, route } = await load()
      resolve.mockResolvedValue({ status: 'anonymous' })
      checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 30 })

      const res = await route.GET(get())

      expect(res.status).toBe(429)
    })
  })
})
