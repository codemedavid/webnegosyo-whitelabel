/**
 * Browser-side ImageKit upload helper.
 *
 * Reproduces the Branding Studio background-image outage: every upload was
 * failing with an ImageKit 403 "Upload Limit Exceeded", but the merchant only
 * ever saw "Upload failed. Please try again." — an unactionable message that
 * sends them into an infinite retry loop. The helper must surface what the
 * upload service actually said.
 */

import { uploadImageToImageKit, uploadPaymentProofImage } from '@/lib/imagekit-upload'

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
  static lastUrl = ''
  static lastMethod = ''
  static lastHeaders: Record<string, string> = {}
  static lastBody: unknown = null

  setRequestHeader(name: string, value: string) {
    FakeXhr.lastHeaders = { ...FakeXhr.lastHeaders, [name]: value }
  }

  upload = { addEventListener: jest.fn() }
  private listeners: Record<string, (() => void)[]> = {}
  status = 0
  responseText = ''

  addEventListener(type: string, handler: () => void) {
    this.listeners[type] = [...(this.listeners[type] ?? []), handler]
  }

  open(method: string, url: string) {
    FakeXhr.lastMethod = method
    FakeXhr.lastUrl = url
    FakeXhr.lastHeaders = {}
  }

  send(body: FormData | File) {
    FakeXhr.lastBody = body
    FakeXhr.lastFields =
      body instanceof FormData
        ? Object.fromEntries(Array.from(body.entries()).map(([key, value]) => [key, String(value)]))
        : {}
    const response = FakeXhr.nextResponse
    this.status = response.status
    this.responseText = response.responseText
    const type = response.networkError ? 'error' : 'load'
    for (const handler of this.listeners[type] ?? []) handler()
  }
}

const SIGNED_FIELDS = {
  fileName: 'bg.jpg',
  folder: 'page-backgrounds',
  useUniqueFileName: 'true',
  overwriteFile: 'false',
}

function mockAuthOk() {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      token: 'signed.jwt.token',
      publicKey: 'pk',
      fields: SIGNED_FIELDS,
      uploadUrl: 'https://upload.imagekit.io/api/v2/files/upload',
    }),
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

  it('asks the server to sign folder + file name, then sends exactly the signed fields (v2)', async () => {
    FakeXhr.nextResponse = {
      status: 200,
      responseText: JSON.stringify({ url: 'u', fileId: 'f', filePath: '/page-backgrounds/bg.jpg' }),
    }

    await uploadImageToImageKit(makeFile(), { folder: 'page-backgrounds' })

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('/api/uploads/sign')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      folder: 'page-backgrounds',
      fileName: 'bg.jpg',
      contentType: 'image/jpeg',
      size: 1,
    })
    expect(FakeXhr.lastUrl).toBe('https://upload.imagekit.io/api/v2/files/upload')
    const sentKeys = Object.keys(FakeXhr.lastFields).filter((key) => key !== 'file')
    expect(Object.fromEntries(sentKeys.map((key) => [key, FakeXhr.lastFields[key]]))).toEqual({
      ...SIGNED_FIELDS,
      token: 'signed.jwt.token',
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

describe('uploadImageToImageKit when the server signs an R2 upload', () => {
  const R2_SIGNED = {
    provider: 'r2',
    uploadUrl: 'https://acc.r2.cloudflarestorage.com/webnegosyo-media/page-backgrounds/bg-1.jpg?X-Amz-Signature=s',
    method: 'PUT',
    headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable', 'if-none-match': '*' },
    url: 'https://media.webnegosyo.com/page-backgrounds/bg-1.jpg',
    fileId: 'r2:page-backgrounds/bg-1.jpg',
    filePath: 'page-backgrounds/bg-1.jpg',
  }

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => R2_SIGNED }) as unknown as typeof fetch
  })

  it('PUTs the raw file with exactly the signed headers and returns the media URL', async () => {
    FakeXhr.nextResponse = { status: 200, responseText: '' }
    const file = makeFile()

    const result = await uploadImageToImageKit(file, { folder: 'page-backgrounds' })

    expect(FakeXhr.lastMethod).toBe('PUT')
    expect(FakeXhr.lastUrl).toBe(R2_SIGNED.uploadUrl)
    expect(FakeXhr.lastHeaders).toEqual(R2_SIGNED.headers)
    expect(FakeXhr.lastBody).toBe(file)
    expect(result).toEqual({
      url: 'https://media.webnegosyo.com/page-backgrounds/bg-1.jpg',
      fileId: 'r2:page-backgrounds/bg-1.jpg',
      filePath: 'page-backgrounds/bg-1.jpg',
    })
  })

  it('rejects with the status when R2 refuses the upload', async () => {
    FakeXhr.nextResponse = { status: 403, responseText: '<Error><Code>SignatureDoesNotMatch</Code></Error>' }
    jest.spyOn(console, 'error').mockImplementation(() => {})

    await expect(uploadImageToImageKit(makeFile(), { folder: 'page-backgrounds' })).rejects.toThrow('Upload failed (403)')
  })
})

describe('uploadPaymentProofImage', () => {
  it('uploads through the server route — no ImageKit credentials in the browser', async () => {
    FakeXhr.nextResponse = {
      status: 200,
      responseText: JSON.stringify({
        url: 'https://ik.imagekit.io/demo/payment-proofs/proof_x.jpg',
        fileId: 'f1',
        filePath: 'payment-proofs/proof_x.jpg',
      }),
    }

    const result = await uploadPaymentProofImage(makeFile())

    expect(result).toEqual({
      url: 'https://ik.imagekit.io/demo/payment-proofs/proof_x.jpg',
      fileId: 'f1',
      filePath: 'payment-proofs/proof_x.jpg',
    })
    expect(FakeXhr.lastUrl).toBe('/api/payment-proof/upload')
    expect(FakeXhr.lastFields.purpose).toBe('order')
    expect(FakeXhr.lastFields.token).toBeUndefined()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('tags a platform sign-up proof with its purpose', async () => {
    FakeXhr.nextResponse = {
      status: 200,
      responseText: JSON.stringify({ url: 'u', fileId: 'f', filePath: 'checkout-proofs/x.jpg' }),
    }

    await uploadPaymentProofImage(makeFile(), { purpose: 'platform-signup' })

    expect(FakeXhr.lastFields.purpose).toBe('platform-signup')
  })

  it("surfaces the server's reason for refusing", async () => {
    FakeXhr.nextResponse = {
      status: 415,
      responseText: JSON.stringify({ error: 'Please upload a PNG, JPG, or WEBP image.' }),
    }

    await expect(uploadPaymentProofImage(makeFile())).rejects.toThrow(/PNG, JPG, or WEBP/)
  })
})
