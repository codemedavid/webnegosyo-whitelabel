/**
 * @jest-environment node
 *
 * /api/uploads/sign signs ONE staff upload to wherever new uploads go:
 * an R2 presigned PUT when STORAGE_UPLOAD_PROVIDER=r2 (and R2 is configured),
 * otherwise the same ImageKit v2 token /api/imagekit/auth issues.
 */

import { NextRequest } from 'next/server'

jest.mock('server-only', () => ({}))
jest.mock('@/lib/imagekit-uploader-auth', () => ({ resolveImageKitUploader: jest.fn() }))
jest.mock('@/lib/imagekit-server', () => ({
  createSignedUploadToken: jest.fn(({ folder, fileName }: { folder: string; fileName: string }) => ({
    token: 'jwt',
    publicKey: 'pk',
    fields: { fileName, folder, useUniqueFileName: 'true', overwriteFile: 'false' },
    uploadUrl: 'https://upload.imagekit.io/api/v2/files/upload',
  })),
}))
jest.mock('@/lib/storage/r2-server', () => ({
  newObjectKey: jest.fn((folder: string, fileName: string) => `${folder}/${fileName}-id`),
  presignR2Put: jest.fn(async (key: string, contentType: string) => ({
    url: `https://media.webnegosyo.com/${key}`,
    fileId: `r2:${key}`,
    filePath: key,
    uploadUrl: `https://acc.r2.cloudflarestorage.com/webnegosyo-media/${key}?X-Amz-Signature=x`,
    method: 'PUT',
    headers: { 'content-type': contentType, 'if-none-match': '*' },
  })),
}))
jest.mock('@/lib/distributed-rate-limit', () => ({
  checkRateLimit: jest.fn(async () => ({ allowed: true, remaining: 10, retryAfterSec: 0 })),
}))

const ADMIN = { status: 'authorized', uploader: { userId: 'u1', role: 'admin', tenantId: 't1' } }
const R2_ENV = {
  STORAGE_UPLOAD_PROVIDER: 'r2',
  R2_ACCOUNT_ID: 'acc',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
}

async function load() {
  const auth = await import('@/lib/imagekit-uploader-auth')
  const r2 = await import('@/lib/storage/r2-server')
  const route = await import('@/app/api/uploads/sign/route')
  return { resolve: jest.mocked(auth.resolveImageKitUploader), presign: jest.mocked(r2.presignR2Put), route }
}

function post(body: unknown) {
  return new NextRequest('https://www.webnegosyo.com/api/uploads/sign', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': '203.0.113.5' },
    body: JSON.stringify(body),
  })
}

const PHOTO = { folder: 'menu-items/t1', fileName: 'latte.jpg', contentType: 'image/jpeg', size: 12345 }

describe('/api/uploads/sign', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...ORIGINAL_ENV }
    delete process.env.STORAGE_UPLOAD_PROVIDER
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
    jest.restoreAllMocks()
  })

  it('refuses anonymous and unauthorised callers', async () => {
    const { resolve, route } = await load()
    resolve.mockResolvedValueOnce({ status: 'anonymous' })
    expect((await route.POST(post(PHOTO))).status).toBe(401)
    resolve.mockResolvedValueOnce({ status: 'denied' })
    expect((await route.POST(post(PHOTO))).status).toBe(403)
  })

  it('refuses a folder that is not a plain relative path', async () => {
    const { resolve, route } = await load()
    resolve.mockResolvedValue(ADMIN as never)
    expect((await route.POST(post({ ...PHOTO, folder: '../tenants' }))).status).toBe(400)
  })

  it('answers an ImageKit token while the flag is off', async () => {
    const { resolve, presign, route } = await load()
    resolve.mockResolvedValue(ADMIN as never)

    const res = await route.POST(post(PHOTO))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.provider).toBe('imagekit')
    expect(body.fields).toMatchObject({ folder: 'menu-items/t1', overwriteFile: 'false' })
    expect(presign).not.toHaveBeenCalled()
  })

  it('stays on ImageKit when the flag is on but R2 credentials are missing', async () => {
    process.env.STORAGE_UPLOAD_PROVIDER = 'r2'
    const { resolve, route } = await load()
    resolve.mockResolvedValue(ADMIN as never)

    expect((await (await route.POST(post(PHOTO))).json()).provider).toBe('imagekit')
  })

  describe('with STORAGE_UPLOAD_PROVIDER=r2', () => {
    beforeEach(() => {
      Object.assign(process.env, R2_ENV)
    })

    it('answers a presigned PUT bound to the type and exact size', async () => {
      const { resolve, presign, route } = await load()
      resolve.mockResolvedValue(ADMIN as never)

      const res = await route.POST(post({ ...PHOTO, contentType: 'image/jpg' }))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body).toMatchObject({
        provider: 'r2',
        method: 'PUT',
        url: 'https://media.webnegosyo.com/menu-items/t1/latte.jpg-id',
        fileId: 'r2:menu-items/t1/latte.jpg-id',
      })
      expect(presign).toHaveBeenCalledWith('menu-items/t1/latte.jpg-id', 'image/jpeg', 12345)
    })

    it('falls back to the extension when the browser sent no type', async () => {
      const { resolve, presign, route } = await load()
      resolve.mockResolvedValue(ADMIN as never)

      const res = await route.POST(post({ ...PHOTO, fileName: 'menu.pdf', contentType: '' }))

      expect(res.status).toBe(200)
      expect(presign).toHaveBeenCalledWith('menu-items/t1/menu.pdf-id', 'application/pdf', 12345)
    })

    it.each([
      ['a typeless SVG', { fileName: 'logo.svg', contentType: '' }, 415],
      ['an SVG (active content)', { contentType: 'image/svg+xml' }, 415],
      ['HTML', { contentType: 'text/html' }, 415],
      ['a missing size', { size: undefined }, 400],
      ['a zero size', { size: 0 }, 400],
      ['a fractional size', { size: 1.5 }, 400],
      ['an image over the limit', { size: 26 * 1024 * 1024 }, 413],
    ])('refuses %s', async (_label, override, status) => {
      const { resolve, presign, route } = await load()
      resolve.mockResolvedValue(ADMIN as never)

      expect((await route.POST(post({ ...PHOTO, ...override }))).status).toBe(status)
      expect(presign).not.toHaveBeenCalled()
    })

    it('answers 503 rather than a broken URL when signing fails', async () => {
      const { resolve, presign, route } = await load()
      resolve.mockResolvedValue(ADMIN as never)
      presign.mockRejectedValueOnce(new Error('Image upload is not configured.'))

      expect((await route.POST(post(PHOTO))).status).toBe(503)
    })
  })
})
