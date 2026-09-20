import { describe, it, expect } from '@jest/globals'
import { assertSingleImageSource, hasImageSource, pickImageSource } from '@/lib/image-source'

describe('image source', () => {
  it('requires exactly one of bytes or link', () => {
    expect(() => assertSingleImageSource({})).toThrow(/exactly one/i)
    expect(() => assertSingleImageSource({ imageBase64: 'a', sourceUrl: 'https://x/a.png' })).toThrow(/exactly one/i)
    expect(() => assertSingleImageSource({ imageBase64: 'a' })).not.toThrow()
    expect(() => assertSingleImageSource({ sourceUrl: 'https://x/a.png' })).not.toThrow()
  })

  it('picks only the source fields from a wider payload', () => {
    expect(pickImageSource({ imageBase64: 'a', fileName: 'x.png', sourceUrl: '' } as never)).toEqual({ imageBase64: 'a', fileName: 'x.png' })
    expect(hasImageSource({ fileName: 'x.png' })).toBe(false)
    expect(hasImageSource({ sourceUrl: 'https://x' })).toBe(true)
  })
})
