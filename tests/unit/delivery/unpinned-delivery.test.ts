/** @jest-environment node */
import { isPinSkipped } from '@/lib/delivery/unpinned-delivery'

describe('isPinSkipped', () => {
  it('is true only with the mark and no pin', () => {
    expect(isPinSkipped({ delivery_pin_skipped: 'true' })).toBe(true)
    expect(isPinSkipped({})).toBe(false)
    expect(isPinSkipped(null)).toBe(false)
  })

  it('ignores the mark on a pinned order, so it cannot dodge a fee', () => {
    expect(isPinSkipped({ delivery_pin_skipped: 'true', delivery_lat: '14.5', delivery_lng: '121.0' })).toBe(false)
  })
})
