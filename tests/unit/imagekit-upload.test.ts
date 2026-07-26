/**
 * Browser-side ImageKit upload helper.
 *
 * Reproduces the Branding Studio background-image outage: every upload was
 * failing with an ImageKit 403 "Upload Limit Exceeded", but the merchant only
 * ever saw "Upload failed. Please try again." — an unactionable message that
 * sends them into an infinite retry loop. The helper must surface what the
 * upload service actually said.
 */

import { uploadImageToImageKit } from '@/lib/imagekit-upload'

const ORIGINAL_ENV = process.env

interface FakeXhrResponse {
  status: number
  responseText: string
  /** When true, fire `error` instead of `load` (network failure). */
  networkError?: boolean
}

class FakeXhr {
  static nextResponse: FakeXhrResponse = { status: 200, responseText: '{}' }
  static lastFields: Record<string, string> = {}

  upload = { addEventListener: jest.fn() }
  private listeners: Record<string, (() => void)[]> = {}
  status = 0
  responseText = ''

  addEventListener(type: string, handler: () => void) {
    this.listeners[type] = [...(this.listeners[type] ?? []), handler]
  }

  open() {}

  send(body: FormData) {
    FakeXhr.lastFields = Object.fromEntries(
      Array.from(body.entries()).map(([key, value]) => [key, String(value)]),
    )
    const response = FakeXhr.nextResponse
    this.status = response.status
    this.responseText = response.responseText
    const type = response.networkError ? 'error' : 'load'
    for (const handler of this.listeners[type] ?? []) handler()
  }
}

function mockAuthOk() {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ token: 't', expire: 1, signature: 's', publicKey: 'pk' }),
  }) as unknown as typeof fetch
}

function makeFile() {
  return new File(['x'], 'bg.jpg', { type: 'image/jpeg' })
}

beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY: 'pk',
    NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/demo',
  }
  ;(global as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXhr
  mockAuthOk()
})

afterEach(() => {
  process.env = ORIGINAL_ENV
})

describe('uploadImageToImageKit', () => {
  it('returns the hosted url, fileId and normalized filePath on success', async () => {
    FakeXhr.nextResponse = {
      status: 200,
      responseText: JSON.stringify({
        url: 'https://ik.imagekit.io/demo/page-backgrounds/bg.jpg',
        fileId: 'file_1',
        filePath: '/page-backgrounds/bg.jpg',
      }),
    }

    const result = await uploadImageToImageKit(makeFile(), {
      folder: 'page-backgrounds',
    })

    expect(result).toEqual({
      url: 'https://ik.imagekit.io/demo/page-backgrounds/bg.jpg',
      fileId: 'file_1',
      filePath: 'page-backgrounds/bg.jpg',
    })
  })

  it('surfaces the reason ImageKit rejected the upload', async () => {
    FakeXhr.nextResponse = {
      status: 403,
      responseText: JSON.stringify({ message: 'Upload Limit Exceeded' }),
    }

    await expect(
      uploadImageToImageKit(makeFile(), { folder: 'page-backgrounds' }),
    ).rejects.toThrow(/Upload Limit Exceeded/)
  })

  it('reports the status code when the rejection body is not readable', async () => {
    FakeXhr.nextResponse = { status: 500, responseText: '<html>oops</html>' }

    await expect(
      uploadImageToImageKit(makeFile(), { folder: 'page-backgrounds' }),
    ).rejects.toThrow(/500/)
  })

  it('surfaces the reason the upload could not be authorized', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => JSON.stringify({ error: 'Image upload is not configured.' }),
    }) as unknown as typeof fetch

    await expect(
      uploadImageToImageKit(makeFile(), { folder: 'page-backgrounds' }),
    ).rejects.toThrow(/Image upload is not configured\./)
  })

  it('still reports a connection failure when the request never completes', async () => {
    FakeXhr.nextResponse = { status: 0, responseText: '', networkError: true }

    await expect(
      uploadImageToImageKit(makeFile(), { folder: 'page-backgrounds' }),
    ).rejects.toThrow(/connection/i)
  })
})
