import { describe, it, expect } from '@jest/globals'
import { hasStockPhotos, pickLaunchPhotos, type PhotoSlot } from '@/lib/onboarding/launch-photos'
import { PHOTOS } from '@/lib/hero-builder/section-presets'

const THREE: PhotoSlot[] = [{ kind: 'dish', width: 800 }, { kind: 'room', width: 800 }, { kind: 'dish', width: 800 }]

describe('pickLaunchPhotos', () => {
  it('fills each slot with a different stock photo of the right kind', () => {
    const photos = pickLaunchPhotos('restaurant', ['Main Course'], THREE)
    expect(photos).toHaveLength(3)
    expect(new Set(photos.map((photo) => photo.url)).size).toBe(3)
    expect(photos[0].url).toContain(PHOTOS.feast)
    expect(photos[1].url).toContain(PHOTOS.restaurantWarm)
    expect(photos[0].url).toContain('w=800')
    for (const photo of photos) expect(photo.alt.length).toBeGreaterThan(0)
  })

  it('leads with a dish photo the menu has a whole category of', () => {
    expect(pickLaunchPhotos('restaurant', ['Burgers', 'Drinks'], [{ kind: 'dish', width: 1600 }])[0].url).toContain(PHOTOS.burger)
    expect(pickLaunchPhotos('restaurant', ['Ramen Bowls'], [{ kind: 'dish', width: 1600 }])[0].url).toContain(PHOTOS.ramen)
  })

  it('a grill with pancit and a salted-egg salad side gets no ramen or salad photo (Karamotan Grill)', () => {
    const urls = pickLaunchPhotos('restaurant', ['Main Course', 'Appetizers', 'Pasta', 'Seafoods', 'Rice Platter'], THREE).map((photo) => photo.url).join(' ')
    expect(urls).not.toContain(PHOTOS.ramen)
    expect(urls).not.toContain(PHOTOS.salad)
  })

  it('never puts a café or bakery picture on a restaurant without those dishes', () => {
    const urls = pickLaunchPhotos('restaurant', ['Silog'], THREE).map((photo) => photo.url).join(' ')
    for (const key of ['coffeeCup', 'coffeeBar', 'croissants', 'bread', 'burger', 'salad', 'pizza'] as const) expect(urls).not.toContain(PHOTOS[key])
  })

  it('borrows from the other kind when a pool runs short', () => {
    const photos = pickLaunchPhotos('cafe', [], [{ kind: 'room', width: 800 }, { kind: 'room', width: 800 }])
    expect(photos[0].url).toContain(PHOTOS.coffeeBar)
    expect(photos[1].url).not.toContain(PHOTOS.coffeeBar)
  })

  it('milk tea and "other" stores have no stock photos', () => {
    expect(hasStockPhotos('milk_tea')).toBe(false)
    expect(hasStockPhotos('other')).toBe(false)
    expect(pickLaunchPhotos('milk_tea', [], THREE)).toEqual([])
  })
})
