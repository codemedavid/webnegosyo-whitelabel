import { describe, it, expect } from '@jest/globals'
import {
  MEDIA_HOST,
  extractMediaKey,
  isR2MediaUrl,
  transformR2Url,
} from '@/lib/storage/media-url'
import { generateImageSrcSet, isOptimizableImageUrl, transformImageUrl } from '@/lib/imagekit-utils'

const BASE = `https://${MEDIA_HOST}`
const URL_ = `${BASE}/menu-items/burger.jpg`

describe('isR2MediaUrl', () => {
  it('recognises https URLs on the media host', () => {
    expect(isR2MediaUrl(URL_)).toBe(true)
    expect(isR2MediaUrl(`${BASE}/cdn-cgi/image/width=200/menu-items/burger.jpg`)).toBe(true)
  })

  it.each([
    ['null', null],
    ['empty', ''],
    ['ImageKit', 'https://ik.imagekit.io/hd3mbcia1/menu-items/burger.jpg'],
    ['plain http', `http://${MEDIA_HOST}/a.jpg`],
    ['a lookalike host', `https://${MEDIA_HOST}.evil.example/a.jpg`],
    ['a host in the userinfo', `https://${MEDIA_HOST}@evil.example/a.jpg`],
    ['the host only in the path', `https://evil.example/${MEDIA_HOST}/a.jpg`],
    ['not a URL', 'not a url'],
    ['a transformation of a remote origin', `https://${MEDIA_HOST}/cdn-cgi/image/width=100/https://evil.example/x.png`],
    ['a protocol-relative remote origin', `https://${MEDIA_HOST}/cdn-cgi/image/width=100//evil.example/x.png`],
  ])('rejects %s', (_label, value) => {
    expect(isR2MediaUrl(value)).toBe(false)
  })
})

describe('extractMediaKey', () => {
  it('returns the object key without query or transformation prefix', () => {
    expect(extractMediaKey(URL_)).toBe('menu-items/burger.jpg')
    expect(extractMediaKey(`${URL_}?v=2`)).toBe('menu-items/burger.jpg')
    expect(extractMediaKey(`${BASE}/cdn-cgi/image/width=200,format=auto/menu-items/burger.jpg`)).toBe(
      'menu-items/burger.jpg',
    )
  })

  it('returns null for other hosts or an empty key', () => {
    expect(extractMediaKey('https://ik.imagekit.io/x/a.jpg')).toBeNull()
    expect(extractMediaKey(`${BASE}/`)).toBeNull()
  })
})

describe('transformR2Url', () => {
  it('builds a Cloudflare transformation URL on the media host', () => {
    expect(transformR2Url(URL_, { width: 400 })).toBe(
      `${BASE}/cdn-cgi/image/width=400,format=auto,onerror=redirect/menu-items/burger.jpg`,
    )
  })

  it('maps crop, gravity, quality, format and dpr to Cloudflare options', () => {
    expect(
      transformR2Url(URL_, {
        width: 64.4,
        height: 64,
        crop: 'fill',
        gravity: 'north',
        quality: 70,
        format: 'jpg',
        dpr: 2,
      }),
    ).toBe(
      `${BASE}/cdn-cgi/image/width=64,height=64,fit=cover,gravity=top,quality=70,format=jpeg,dpr=2,onerror=redirect/menu-items/burger.jpg`,
    )
  })

  it.each([
    ['fit', 'scale-down'],
    ['limit', 'scale-down'],
    ['pad', 'pad'],
    ['scale', 'squeeze'],
    ['thumb', 'cover'],
  ] as const)('maps crop %s to fit=%s', (crop, fit) => {
    expect(transformR2Url(URL_, { width: 100, crop })).toContain(`fit=${fit}`)
  })

  it('center-crops when both dimensions are given without a crop', () => {
    expect(transformR2Url(URL_, { width: 100, height: 50 })).toContain('fit=cover')
  })

  it('replaces an existing transformation rather than nesting one', () => {
    const once = transformR2Url(URL_, { width: 1600 })
    expect(transformR2Url(once, { width: 200 })).toBe(
      `${BASE}/cdn-cgi/image/width=200,format=auto,onerror=redirect/menu-items/burger.jpg`,
    )
  })

  it('returns the original URL when no option asks for a change', () => {
    expect(transformR2Url(URL_, {})).toBe(URL_)
    expect(transformR2Url(URL_, { quality: 'auto', dpr: 'auto' })).toBe(URL_)
  })

  it('leaves other hosts unchanged and maps empty input to null', () => {
    const other = 'https://images.unsplash.com/a.jpg'
    expect(transformR2Url(other, { width: 100 })).toBe(other)
    expect(transformR2Url(null, { width: 100 })).toBeNull()
  })
})

describe('shared image helpers dispatch R2 media URLs', () => {
  it('transformImageUrl resizes media URLs through Cloudflare', () => {
    expect(transformImageUrl(URL_, { width: 300 })).toBe(transformR2Url(URL_, { width: 300 }))
  })

  it('treats media URLs as optimizable and builds a srcset for them', () => {
    expect(isOptimizableImageUrl(URL_)).toBe(true)
    expect(generateImageSrcSet(URL_, [320, 640])).toBe(
      `${BASE}/cdn-cgi/image/width=320,format=auto,onerror=redirect/menu-items/burger.jpg 320w, ` +
        `${BASE}/cdn-cgi/image/width=640,format=auto,onerror=redirect/menu-items/burger.jpg 640w`,
    )
  })
})
