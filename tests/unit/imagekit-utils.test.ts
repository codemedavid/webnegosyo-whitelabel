import {
  isImageKitUrl,
  transformImageKitUrl,
  extractImageKitFilePath,
  generateImageSrcSet,
  transformImageUrl,
  isOptimizableImageUrl,
  imagekitPresets,
} from '@/lib/imagekit-utils'

const ENDPOINT = 'https://ik.imagekit.io/hd3mbcia1'
const IK_URL = `${ENDPOINT}/menu-items/burger.jpg`
const CL_URL = 'https://res.cloudinary.com/demo/image/upload/v1/menu-items/burger.jpg'

describe('isImageKitUrl', () => {
  test('returns true for ik.imagekit.io URLs', () => {
    expect(isImageKitUrl(IK_URL)).toBe(true)
  })

  test('returns false for Cloudinary URLs', () => {
    expect(isImageKitUrl(CL_URL)).toBe(false)
  })

  test('returns false for null/undefined/empty', () => {
    expect(isImageKitUrl(null)).toBe(false)
    expect(isImageKitUrl(undefined)).toBe(false)
    expect(isImageKitUrl('')).toBe(false)
  })
})

describe('transformImageKitUrl', () => {
  test('appends width/height as tr query param', () => {
    const out = transformImageKitUrl(IK_URL, { width: 400, height: 300 })
    expect(out).toContain('tr=')
    expect(out).toContain('w-400')
    expect(out).toContain('h-300')
  })

  test('maps fill crop to maintain_ratio and limit to at_max', () => {
    expect(transformImageKitUrl(IK_URL, { width: 100, height: 100, crop: 'fill' })).toContain('c-maintain_ratio')
    expect(transformImageKitUrl(IK_URL, { width: 100, crop: 'limit' })).toContain('c-at_max')
  })

  test('numeric quality becomes q-NN, auto quality is omitted', () => {
    expect(transformImageKitUrl(IK_URL, { width: 100, quality: 80 })).toContain('q-80')
    expect(transformImageKitUrl(IK_URL, { width: 100, quality: 'auto' })).not.toContain('q-')
  })

  test('returns original URL when no options given', () => {
    expect(transformImageKitUrl(IK_URL, {})).toBe(IK_URL)
  })

  test('returns input unchanged for non-ImageKit URLs', () => {
    expect(transformImageKitUrl(CL_URL, { width: 100 })).toBe(CL_URL)
  })

  test('returns null for null/undefined', () => {
    expect(transformImageKitUrl(null, { width: 100 })).toBeNull()
    expect(transformImageKitUrl(undefined)).toBeNull()
  })

  test('merges with an existing query string', () => {
    const out = transformImageKitUrl(`${IK_URL}?v=2`, { width: 100 })
    expect(out).toContain('v=2')
    expect(out).toContain('tr=w-100')
  })
})

describe('extractImageKitFilePath', () => {
  test('returns the path under the endpoint, without leading slash', () => {
    expect(extractImageKitFilePath(`${ENDPOINT}/payment-proofs/abc.jpg`)).toBe('payment-proofs/abc.jpg')
  })

  test('strips a tr query string', () => {
    expect(extractImageKitFilePath(`${ENDPOINT}/payment-proofs/abc.jpg?tr=w-100`)).toBe('payment-proofs/abc.jpg')
  })

  test('strips a path-style tr segment', () => {
    expect(extractImageKitFilePath(`${ENDPOINT}/tr:w-100/payment-proofs/abc.jpg`)).toBe('payment-proofs/abc.jpg')
  })

  test('returns null for non-ImageKit URLs', () => {
    expect(extractImageKitFilePath(CL_URL)).toBeNull()
    expect(extractImageKitFilePath(null)).toBeNull()
  })
})

describe('generateImageSrcSet', () => {
  test('builds a srcset across widths for ImageKit URLs', () => {
    const out = generateImageSrcSet(IK_URL, [320, 640])
    expect(out).toContain('320w')
    expect(out).toContain('640w')
    expect(out).toContain('w-320')
  })

  test('returns empty string for non-optimizable URLs', () => {
    expect(generateImageSrcSet('https://example.com/x.jpg')).toBe('')
  })
})

describe('transformImageUrl (unified dispatch)', () => {
  test('transforms ImageKit URLs via tr query', () => {
    expect(transformImageUrl(IK_URL, { width: 200 })).toContain('tr=w-200')
  })

  test('transforms legacy Cloudinary URLs via /upload/ params', () => {
    const out = transformImageUrl(CL_URL, { width: 200 })
    expect(out).toContain('w_200')
  })

  test('passes through unknown hosts unchanged', () => {
    const other = 'https://example.com/x.jpg'
    expect(transformImageUrl(other, { width: 200 })).toBe(other)
  })
})

describe('isOptimizableImageUrl', () => {
  test('true for ImageKit and Cloudinary, false otherwise', () => {
    expect(isOptimizableImageUrl(IK_URL)).toBe(true)
    expect(isOptimizableImageUrl(CL_URL)).toBe(true)
    expect(isOptimizableImageUrl('https://example.com/x.jpg')).toBe(false)
  })
})

describe('imagekitPresets', () => {
  test('thumbnail applies a square transform', () => {
    const out = imagekitPresets.thumbnail(IK_URL)
    expect(out).toContain('w-64')
    expect(out).toContain('h-64')
  })

  test('card applies a width transform', () => {
    expect(imagekitPresets.card(IK_URL)).toContain('w-400')
  })
})
