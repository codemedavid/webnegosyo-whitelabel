/**
 * @jest-environment node
 *
 * With STORAGE_UPLOAD_PROVIDER=r2 every server upload helper in
 * imagekit-server (menu photos, Loyverse mirror, MCP, payment proofs,
 * onboarding) stores into R2 with the same result shape; with the flag off,
 * nothing changes. R2 deletes are limited to payment proofs.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'

jest.mock('server-only', () => ({}))

const R2_ENV = {
  STORAGE_UPLOAD_PROVIDER: 'r2',
  R2_ACCOUNT_ID: 'acc',
  R2_ACCESS_KEY_ID: 'AKID',
  R2_SECRET_ACCESS_KEY: 'secret',
  NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY: 'pk',
  IMAGEKIT_PRIVATE_KEY: 'priv',
  NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/x',
}
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2])

describe('imagekit-server upload dispatch', () => {
  const ORIGINAL_ENV = process.env
  const originalFetch = global.fetch
  let requests: Request[]
  let respond: (req: Request) => Response

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...ORIGINAL_ENV, ...R2_ENV }
    requests = []
    respond = () => new Response(null, { status: 200 })
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(input, init)
      requests.push(req)
      return respond(req)
    }) as unknown as typeof fetch
    jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  it('stores a buffer upload in R2 under the folder with the sniffed type', async () => {
    const { uploadBufferToImageKit } = await import('@/lib/imagekit-server')

    const result = await uploadBufferToImageKit(PNG, { folder: 'payment-proofs', fileName: 'proof.png', mimeType: 'image/png' })

    expect(result.url).toMatch(/^https:\/\/media\.webnegosyo\.com\/payment-proofs\/proof-[0-9a-f]{16}\.png$/)
    expect(result.fileId).toBe(`r2:${result.filePath}`)
    expect(requests).toHaveLength(1)
    expect(requests[0].url).toContain('acc.r2.cloudflarestorage.com/webnegosyo-media/payment-proofs/')
    expect(requests[0].headers.get('content-type')).toBe('image/png')
  })

  it('stores a base64 / data-URI upload in R2', async () => {
    const { uploadBase64ToImageKit } = await import('@/lib/imagekit-server')
    const dataUri = `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`

    const result = await uploadBase64ToImageKit(dataUri, { folder: 'menu-items/t1', fileName: 'dish.png' })

    expect(result.filePath).toMatch(/^menu-items\/t1\/dish-[0-9a-f]{16}\.png$/)
    expect(requests[0].headers.get('content-length')).toBe(String(PNG.length))
  })

  it('refuses an empty upload and a declared image type the bytes contradict', async () => {
    const { uploadBufferToImageKit, uploadBase64ToImageKit } = await import('@/lib/imagekit-server')

    await expect(uploadBase64ToImageKit('', { folder: 'menu-items/t1', fileName: 'x.png' })).rejects.toThrow('empty')
    await expect(
      uploadBufferToImageKit(PNG, { folder: 'payment-proofs', fileName: 'p.jpg', mimeType: 'image/jpeg' }),
    ).rejects.toThrow('does not match')
    expect(requests).toHaveLength(0)
  })

  it('stores what the bytes are when no type was declared', async () => {
    const { uploadBase64ToImageKit } = await import('@/lib/imagekit-server')

    const result = await uploadBase64ToImageKit(Buffer.from(PNG).toString('base64'), { folder: 'menu-items/t1', fileName: 'dish.jpg' })

    expect(result.filePath.endsWith('.png')).toBe(true)
    expect(requests[0].headers.get('content-type')).toBe('image/png')
  })

  it('refuses a folder that would escape the bucket layout', async () => {
    const { uploadBufferToImageKit } = await import('@/lib/imagekit-server')

    await expect(
      uploadBufferToImageKit(PNG, { folder: '../logos', fileName: 'x.png', mimeType: 'image/png' }),
    ).rejects.toThrow('Invalid upload folder')
    expect(requests).toHaveLength(0)
  })

  it('keeps uploading to ImageKit while the flag is off', async () => {
    delete process.env.STORAGE_UPLOAD_PROVIDER
    respond = () =>
      Response.json({ url: 'https://ik.imagekit.io/x/payment-proofs/p.png', fileId: 'f1', filePath: '/payment-proofs/p.png' })
    const { uploadBufferToImageKit } = await import('@/lib/imagekit-server')

    const result = await uploadBufferToImageKit(PNG, { folder: 'payment-proofs', fileName: 'p.png', mimeType: 'image/png' })

    expect(result).toEqual({ url: 'https://ik.imagekit.io/x/payment-proofs/p.png', fileId: 'f1', filePath: 'payment-proofs/p.png' })
    expect(requests[0].url).toContain('upload.imagekit.io')
  })

  it('deletes an R2 payment proof but refuses any other R2 object', async () => {
    const { deleteImageKitAsset } = await import('@/lib/imagekit-server')

    expect(await deleteImageKitAsset('r2:tenant-logos/t1/logo-1.png')).toBe(false)
    expect(requests).toHaveLength(0)

    respond = () => new Response(null, { status: 204 })
    expect(await deleteImageKitAsset('r2:payment-proofs/p-1.png')).toBe(true)
    expect(requests[0].method).toBe('DELETE')
  })

  describe('deletePaymentProofAsset with an r2 id', () => {
    const WINDOW = 60 * 60 * 1000

    it('deletes a fresh proof', async () => {
      respond = (req) =>
        req.method === 'HEAD'
          ? new Response(null, { status: 200, headers: { 'last-modified': new Date().toUTCString() } })
          : new Response(null, { status: 204 })
      const { deletePaymentProofAsset } = await import('@/lib/imagekit-server')

      expect(await deletePaymentProofAsset('r2:payment-proofs/p-1.png', { maxAgeMs: WINDOW })).toBe('deleted')
    })

    it('refuses a proof older than the replace window', async () => {
      respond = () =>
        new Response(null, { status: 200, headers: { 'last-modified': new Date(Date.now() - 2 * WINDOW).toUTCString() } })
      const { deletePaymentProofAsset } = await import('@/lib/imagekit-server')

      expect(await deletePaymentProofAsset('r2:payment-proofs/p-1.png', { maxAgeMs: WINDOW })).toBe('forbidden')
      expect(requests.every((r) => r.method !== 'DELETE')).toBe(true)
    })

    it('refuses anything outside the payment-proof folder without a lookup', async () => {
      const { deletePaymentProofAsset } = await import('@/lib/imagekit-server')

      expect(await deletePaymentProofAsset('r2:menu-items/t1/a.png', { maxAgeMs: WINDOW })).toBe('forbidden')
      expect(requests).toHaveLength(0)
    })

    it('answers not_found for a missing object', async () => {
      respond = () => new Response(null, { status: 404 })
      const { deletePaymentProofAsset } = await import('@/lib/imagekit-server')

      expect(await deletePaymentProofAsset('r2:payment-proofs/p-1.png')).toBe('not_found')
    })
  })
})
