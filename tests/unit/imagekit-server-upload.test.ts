import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'

// Server-side ImageKit binary upload used by the MCP so image-generating clients
// (which produce raw files, not hosted URLs) can set a menu item's image.
// `next/jest` stubs the `server-only` import, so the module loads under jest.

const ENV = {
  NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY: 'public_test',
  IMAGEKIT_PRIVATE_KEY: 'private_test',
  NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/demo',
}

const originalEnv = { ...process.env }
const originalFetch = global.fetch

/* eslint-disable @typescript-eslint/no-var-requires */
function loadModule() {
  let mod: typeof import('@/lib/imagekit-server')
  jest.isolateModules(() => {
    mod = require('@/lib/imagekit-server')
  })
  // @ts-expect-error assigned inside isolateModules
  return mod
}
/* eslint-enable @typescript-eslint/no-var-requires */

beforeEach(() => {
  Object.assign(process.env, ENV)
})

afterEach(() => {
  process.env = { ...originalEnv }
  global.fetch = originalFetch
  jest.restoreAllMocks()
})

const OK_RESPONSE = {
  url: 'https://ik.imagekit.io/demo/menu-items/latte_abc.png',
  fileId: 'file_123',
  filePath: '/menu-items/latte_abc.png',
}

describe('uploadBase64ToImageKit', () => {
  it('POSTs to the ImageKit upload endpoint with Basic auth and returns url/fileId/filePath', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => OK_RESPONSE,
    })) as unknown as typeof fetch
    global.fetch = fetchMock

    const { uploadBase64ToImageKit } = loadModule()
    const result = await uploadBase64ToImageKit('aGVsbG8=', { folder: 'menu-items', fileName: 'latte.png' })

    expect(result).toEqual({
      url: OK_RESPONSE.url,
      fileId: OK_RESPONSE.fileId,
      // leading slash normalized away
      filePath: 'menu-items/latte_abc.png',
    })

    const [endpoint, init] = (fetchMock as unknown as jest.Mock).mock.calls[0] as [string, RequestInit]
    expect(endpoint).toBe('https://upload.imagekit.io/api/v1/files/upload')
    expect(init.method).toBe('POST')
    const expectedAuth = 'Basic ' + Buffer.from('private_test:').toString('base64')
    expect((init.headers as Record<string, string>).Authorization).toBe(expectedAuth)
  })

  it('strips a data-URI prefix before sending the base64 payload', async () => {
    let sentFile: string | undefined
    const fetchMock = jest.fn(async (_url: string, init: RequestInit) => {
      const form = init.body as FormData
      sentFile = form.get('file') as string
      return { ok: true, status: 200, json: async () => OK_RESPONSE }
    }) as unknown as typeof fetch
    global.fetch = fetchMock

    const { uploadBase64ToImageKit } = loadModule()
    await uploadBase64ToImageKit('data:image/png;base64,aGVsbG8=', { folder: 'menu-items', fileName: 'x.png' })

    expect(sentFile).toBe('aGVsbG8=')
  })

  it('throws when credentials are not configured', async () => {
    delete process.env.IMAGEKIT_PRIVATE_KEY
    const { uploadBase64ToImageKit } = loadModule()
    await expect(
      uploadBase64ToImageKit('aGVsbG8=', { folder: 'menu-items', fileName: 'x.png' }),
    ).rejects.toThrow(/not configured/i)
  })

  it('throws on a non-2xx upload response', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => 'bad request',
      json: async () => ({}),
    })) as unknown as typeof fetch
    global.fetch = fetchMock

    const { uploadBase64ToImageKit } = loadModule()
    await expect(
      uploadBase64ToImageKit('aGVsbG8=', { folder: 'menu-items', fileName: 'x.png' }),
    ).rejects.toThrow(/upload failed/i)
  })

  it('throws when the response is missing required fields', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ url: 'https://x/y.png' }),
    })) as unknown as typeof fetch
    global.fetch = fetchMock

    const { uploadBase64ToImageKit } = loadModule()
    await expect(
      uploadBase64ToImageKit('aGVsbG8=', { folder: 'menu-items', fileName: 'x.png' }),
    ).rejects.toThrow(/missing/i)
  })
})
