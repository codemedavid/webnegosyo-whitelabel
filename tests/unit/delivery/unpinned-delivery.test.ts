/** @jest-environment node */
import { isPinSkipped, unpinnedDeliveryProblem, UNPINNED_NEEDS_ADDRESS_MESSAGE, UNPINNED_NEEDS_CONTACT_MESSAGE } from '@/lib/delivery/unpinned-delivery'

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

describe('unpinnedDeliveryProblem', () => {
  it('needs an address', () => {
    expect(unpinnedDeliveryProblem({ Phone: '0917' })).toBe(UNPINNED_NEEDS_ADDRESS_MESSAGE)
  })

  it('needs a way to reach the customer', () => {
    expect(unpinnedDeliveryProblem({ delivery_address: 'Purok 3' })).toBe(UNPINNED_NEEDS_CONTACT_MESSAGE)
    expect(unpinnedDeliveryProblem({ delivery_address: 'Purok 3', Phone: ' ' })).toBe(UNPINNED_NEEDS_CONTACT_MESSAGE)
  })

  it.each([
    [{ delivery_address: 'Purok 3', Phone: '0917' }, undefined],
    [{ delivery_address: 'Purok 3', 'Contact Number': '0917' }, undefined],
    [{ delivery_address: 'Purok 3', messenger_psid: 'x' }, undefined],
    [{ delivery_address: 'Purok 3' }, '0917'],
  ])('accepts %j', (answers, contact) => {
    expect(unpinnedDeliveryProblem(answers, contact)).toBeNull()
  })
})
