/**
 * @jest-environment node
 *
 * Anonymous payment-proof uploads now go through the server: the customer
 * never holds ImageKit credentials, the server chooses folder + file name,
 * checks the bytes are really an image, and never overwrites. Deletion checks
 * the file's REAL location by id instead of trusting a caller-supplied path.
 */

import { NextRequest } from 'next/server'

jest.mock('@/lib/imagekit-server', () => ({
  uploadBufferToImageKit: jest.fn(),
  deletePaymentProofAsset: jest.fn(),
}))
jest.mock('@/lib/distributed-rate-limit', () => ({
  checkRateLimit: jest.fn(async () => ({ allowed: true, remaining: 10, retryAfterSec: 0 })),
}))

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])
const UPLOADED = {
  url: 'https://ik.imagekit.io/demo/payment-proofs/proof_x.jpg',
  fileId: 'f1',
  filePath: 'payment-proofs/proof_x.jpg',
}

async function load() {
  const server = await import('@/lib/imagekit-server')
  const limiter = await import('@/lib/distributed-rate-limit')
  const upload = await import('@/app/api/payment-proof/upload/route')
  const del = await import('@/app/api/payment-proof/delete/route')
  return {
    uploadBuffer: jest.mocked(server.uploadBufferToImageKit),
    deleteProof: jest.mocked(server.deletePaymentProofAsset),
    checkRateLimit: jest.mocked(limiter.checkRateLimit),
    upload,
    del,
  }
}

function uploadRequest(file: Blob | null, fields: Record<string, string> = {}) {
  const form = new FormData()
  if (file) form.append('file', file, 'screenshot.jpg')
  for (const [key, value] of Object.entries(fields)) form.append(key, value)
  return new NextRequest('https://www.webnegosyo.com/api/payment-proof/upload', {
    method: 'POST',
    headers: { 'x-real-ip': '203.0.113.5' },
    body: form,
  })
}

function deleteRequest(body: unknown) {
  return new NextRequest('https://www.webnegosyo.com/api/payment-proof/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': '203.0.113.5' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/payment-proof/upload', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => jest.restoreAllMocks())

  it('uploads a real image into the payment-proofs folder under a server-chosen name', async () => {
    const { uploadBuffer, upload } = await load()
    uploadBuffer.mockResolvedValue(UPLOADED)

    const res = await upload.POST(uploadRequest(new Blob([JPEG], { type: 'image/jpeg' }), { folder: 'tenants' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(UPLOADED)
    const [bytes, options] = uploadBuffer.mock.calls[0]
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xff, 0xd8, 0xff])
    // The caller's folder field is ignored.
    expect(options.folder).toBe('payment-proofs')
    expect(options.mimeType).toBe('image/jpeg')
    expect(options.fileName).toMatch(/^proof-[0-9a-f-]{36}\.jpg$/)
  })

  it('stores a platform sign-up proof in the checkout-proofs folder', async () => {
    const { uploadBuffer, upload } = await load()
    uploadBuffer.mockResolvedValue(UPLOADED)

    await upload.POST(uploadRequest(new Blob([JPEG]), { purpose: 'platform-signup' }))

    expect(uploadBuffer.mock.calls[0][1].folder).toBe('checkout-proofs')
  })

  it('rejects content that is not an image, whatever its declared type', async () => {
    const { uploadBuffer, upload } = await load()
    const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], {
      type: 'image/png',
    })

    const res = await upload.POST(uploadRequest(svg))

    expect(res.status).toBe(415)
    expect(uploadBuffer).not.toHaveBeenCalled()
  })

  it('rejects a file over the size cap', async () => {
    const { uploadBuffer, upload } = await load()
    const big = new Uint8Array(5_000_001)
    big.set(JPEG)

    const res = await upload.POST(uploadRequest(new Blob([big])))

    expect(res.status).toBe(413)
    expect(uploadBuffer).not.toHaveBeenCalled()
  })

  it('rejects a request with no file', async () => {
    const { upload } = await load()

    const res = await upload.POST(uploadRequest(null))

    expect(res.status).toBe(400)
  })

  it('is rate limited per client IP', async () => {
    const { uploadBuffer, checkRateLimit, upload } = await load()
    checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 60 })

    const res = await upload.POST(uploadRequest(new Blob([JPEG])))

    expect(res.status).toBe(429)
    expect(uploadBuffer).not.toHaveBeenCalled()
    expect(checkRateLimit.mock.calls[0][0]).toContain('203.0.113.5')
  })

  it('answers 502 with a readable message when ImageKit refuses', async () => {
    const { uploadBuffer, upload } = await load()
    uploadBuffer.mockRejectedValue(new Error('ImageKit upload failed (403).'))

    const res = await upload.POST(uploadRequest(new Blob([JPEG])))

    expect(res.status).toBe(502)
    expect((await res.json()).error).toBeTruthy()
  })
})

describe('POST /api/payment-proof/delete', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  afterEach(() => jest.restoreAllMocks())

  it('verifies the file by id (not the claimed path) and bounds it to the replace window', async () => {
    const { deleteProof, del } = await load()
    deleteProof.mockResolvedValue('deleted')

    // The claimed filePath is inside the folder; the id could be anything.
    const res = await del.POST(deleteRequest({ fileId: 'logo-file-id', filePath: 'payment-proofs/a.jpg' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, deleted: true })
    expect(deleteProof).toHaveBeenCalledWith('logo-file-id', { maxAgeMs: expect.any(Number) })
  })

  it('refuses when the id belongs to a file outside the payment-proof folder', async () => {
    const { deleteProof, del } = await load()
    deleteProof.mockResolvedValue('forbidden')

    const res = await del.POST(deleteRequest({ fileId: 'logo-file-id', filePath: 'payment-proofs/a.jpg' }))

    expect(res.status).toBe(403)
  })

  it('no longer needs the caller-supplied filePath', async () => {
    const { deleteProof, del } = await load()
    deleteProof.mockResolvedValue('deleted')

    const res = await del.POST(deleteRequest({ fileId: 'f1' }))

    expect(res.status).toBe(200)
    expect(deleteProof).toHaveBeenCalled()
  })

  it('keeps accepting a legacy Cloudinary { publicId } body as a no-op', async () => {
    const { deleteProof, del } = await load()

    const res = await del.POST(deleteRequest({ publicId: 'payment-proofs/old' }))

    expect(await res.json()).toEqual({ success: true, deleted: false })
    expect(deleteProof).not.toHaveBeenCalled()
  })

  it('is rate limited per client IP', async () => {
    const { deleteProof, checkRateLimit, del } = await load()
    checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 60 })

    const res = await del.POST(deleteRequest({ fileId: 'f1' }))

    expect(res.status).toBe(429)
    expect(deleteProof).not.toHaveBeenCalled()
  })
})
