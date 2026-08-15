import { shouldMirrorLoyverseImage, isLoyverseImageUrl } from '@/lib/loyverse/image-mirror'

describe('isLoyverseImageUrl', () => {
  it('recognises Loyverse-hosted image URLs', () => {
    expect(isLoyverseImageUrl('https://api.loyverse.com/image/8dcc6146')).toBe(true)
    expect(isLoyverseImageUrl('https://ik.imagekit.io/x/menu-items/a.png')).toBe(false)
    expect(isLoyverseImageUrl('')).toBe(false)
    expect(isLoyverseImageUrl('not a url')).toBe(false)
  })
})

describe('shouldMirrorLoyverseImage', () => {
  const loyverseImage = 'https://api.loyverse.com/image/abc123'

  it('mirrors when the local item has no image yet', () => {
    expect(shouldMirrorLoyverseImage('', loyverseImage)).toBe(true)
    expect(shouldMirrorLoyverseImage(null, loyverseImage)).toBe(true)
  })

  it('mirrors when the local image is itself a Loyverse hotlink', () => {
    expect(
      shouldMirrorLoyverseImage('https://api.loyverse.com/image/old456', loyverseImage)
    ).toBe(true)
  })

  it('never overwrites a merchant-hosted image (ImageKit or anything else)', () => {
    expect(
      shouldMirrorLoyverseImage('https://ik.imagekit.io/x/menu-items/nice.jpg', loyverseImage)
    ).toBe(false)
  })

  it('does nothing when Loyverse has no image', () => {
    expect(shouldMirrorLoyverseImage('', null)).toBe(false)
    expect(shouldMirrorLoyverseImage('https://api.loyverse.com/image/x', '')).toBe(false)
  })
})
