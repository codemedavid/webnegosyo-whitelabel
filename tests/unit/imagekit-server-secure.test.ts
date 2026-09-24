/**
 * @jest-environment node
 *
 * Server-side ImageKit primitives behind the upload/delete security fixes:
 *  - a v2 upload token whose signature binds folder / fileName / overwrite
 *  - a server upload that can never overwrite an existing file
 *  - a payment-proof delete that checks the file's REAL path, by id
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'

const ENV = {
  NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY: 'public_test',
  IMAGEKIT_PRIVATE_KEY: 'private_test',
  NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/demo',
}

const originalEnv = { ...process.env }
const originalFetch = global.fetch

/* eslint-disable @typescript-eslint/no-require-imports */
function loadModule(): typeof import('@/lib/imagekit-server') {
  let mod: typeof import('@/lib/imagekit-server') | undefined
  jest.isolateModules(() => {
    mod = require('@/lib/imagekit-server')
  })
  return mod as typeof import('@/lib/imagekit-server')
}
/* eslint-enable @typescript-eslint/no-require-imports */

function decodeJwtPayload(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
}

type FetchArgs = [string, RequestInit | undefined]

beforeEach(() => {
  Object.assign(process.env, ENV)
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  process.env = { ...originalEnv }
  global.fetch = originalFetch
  jest.restoreAllMocks()
})

describe('createSignedUploadToken', () => {
  it('binds folder, fileName, unique naming and no-overwrite into the signed payload', () => {
    const { createSignedUploadToken } = loadModule()

    const result = createSignedUploadToken({ folder: 'menu-items', fileName: 'latte.jpg' })

    expect(result).not.toBeNull()
    expect(result!.fields).toEqual({
      fileName: 'latte.jpg',
      folder: 'menu-items',
      useUniqueFileName: 'true',
      overwriteFile: 'false',
    })
    expect(decodeJwtPayload(result!.token)).toMatchObject(result!.fields)
    expect(result!.publicKey).toBe('public_test')
    expect(result!.uploadUrl).toBe('https://upload.imagekit.io/api/v2/files/upload')
  })

  it('returns null when credentials are missing', () => {
    delete process.env.IMAGEKIT_PRIVATE_KEY
    const { createSignedUploadToken } = loadModule()

    expect(createSignedUploadToken({ folder: 'menu-items', fileName: 'x.jpg' })).toBeNull()
  })
})

describe('uploadBufferToImageKit', () => {
  it('uploads with the private key and forbids overwriting an existing file', async () => {
    const fetchMock = jest.fn<(...args: FetchArgs) => Promise<unknown>>(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        url: 'https://ik.imagekit.io/demo/payment-proofs/proof_x.jpg',
        fileId: 'f1',
        filePath: '/payment-proofs/proof_x.jpg',
      }),
    }))
    global.fetch = fetchMock as unknown as typeof fetch
    const { uploadBufferToImageKit } = loadModule()

    const result = await uploadBufferToImageKit(new Uint8Array([0xff, 0xd8, 0xff]), {
      folder: 'payment-proofs',
      fileName: 'proof.jpg',
      mimeType: 'image/jpeg',
    })

    expect(result).toEqual({
      url: 'https://ik.imagekit.io/demo/payment-proofs/proof_x.jpg',
      fileId: 'f1',
      filePath: 'payment-proofs/proof_x.jpg',
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://upload.imagekit.io/api/v1/files/upload')
    expect((init!.headers as Record<string, string>).Authorization).toMatch(/^Basic /)
    const form = init!.body as FormData
    expect(form.get('folder')).toBe('payment-proofs')
    expect(form.get('useUniqueFileName')).toBe('true')
    expect(form.get('overwriteFile')).toBe('false')
  })
})

describe('deletePaymentProofAsset', () => {
  function mockImageKit(details: { status: number; body?: unknown }, deleteStatus = 204) {
    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return { ok: deleteStatus < 300, status: deleteStatus, json: async () => ({}) }
      return { ok: details.status < 300, status: details.status, json: async () => details.body }
    })
    global.fetch = fetchMock as unknown as typeof fetch
    return fetchMock
  }

  const recent = () => new Date(Date.now() - 5 * 60_000).toISOString()

  it('deletes a recent file whose REAL path is inside payment-proofs', async () => {
    const fetchMock = mockImageKit({ status: 200, body: { fileId: 'f1', filePath: '/payment-proofs/a.jpg', createdAt: recent() } })
    const { deletePaymentProofAsset } = loadModule()

    await expect(deletePaymentProofAsset('f1')).resolves.toBe('deleted')

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.imagekit.io/v1/files/f1/details')
    expect(fetchMock.mock.calls[1][1]?.method).toBe('DELETE')
  })

  it('refuses a fileId that belongs to a file outside payment-proofs (e.g. a tenant logo)', async () => {
    const fetchMock = mockImageKit({ status: 200, body: { fileId: 'logo', filePath: '/tenants/logo.png', createdAt: recent() } })
    const { deletePaymentProofAsset } = loadModule()

    await expect(deletePaymentProofAsset('logo')).resolves.toBe('forbidden')
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
  })

  it('refuses a proof older than the replace window when a max age is given', async () => {
    const old = new Date(Date.now() - 3 * 24 * 3600_000).toISOString()
    const fetchMock = mockImageKit({ status: 200, body: { fileId: 'f1', filePath: '/payment-proofs/a.jpg', createdAt: old } })
    const { deletePaymentProofAsset } = loadModule()

    await expect(deletePaymentProofAsset('f1', { maxAgeMs: 2 * 3600_000 })).resolves.toBe('forbidden')
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
  })

  it('treats an unknown file as already gone', async () => {
    mockImageKit({ status: 404, body: { message: 'The requested file does not exist.' } })
    const { deletePaymentProofAsset } = loadModule()

    await expect(deletePaymentProofAsset('missing')).resolves.toBe('not_found')
  })

  it('reports failure (and deletes nothing) when the lookup errors', async () => {
    const fetchMock = mockImageKit({ status: 500 })
    const { deletePaymentProofAsset } = loadModule()

    await expect(deletePaymentProofAsset('f1')).resolves.toBe('failed')
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
  })

  it('refuses a malformed fileId without calling ImageKit', async () => {
    const fetchMock = mockImageKit({ status: 200 })
    const { deletePaymentProofAsset } = loadModule()

    await expect(deletePaymentProofAsset('../../files')).resolves.toBe('forbidden')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
