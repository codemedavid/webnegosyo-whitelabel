/** @jest-environment node */
import {
  applyDeliveryPatch,
  customerDeliveryPatchSchema,
  DELIVERY_EDIT_BOOKED_MESSAGE,
  DELIVERY_EDIT_FINISHED_MESSAGE,
  deliveryEditRefusal,
  merchantDeliveryPatchSchema,
} from '@/lib/delivery/order-delivery-edit'
import { findDeliveryDetails } from '@/lib/delivery/delivery-details'

const NOW = new Date('2026-11-06T00:00:00Z')

function apply(current: Record<string, unknown>, patch: Parameters<typeof applyDeliveryPatch>[0]['patch'], extra: Partial<Parameters<typeof applyDeliveryPatch>[0]> = {}) {
  return applyDeliveryPatch({ current, patch, editor: 'merchant', now: NOW, ...extra })
}

describe('deliveryEditRefusal', () => {
  it('allows an open order with no rider', () => {
    expect(deliveryEditRefusal({ status: 'pending', lalamoveOrderId: null, lalamoveStatus: null })).toBeNull()
  })

  it.each(['delivered', 'cancelled', 'completed'])('refuses a %s order', (status) => {
    expect(deliveryEditRefusal({ status, lalamoveOrderId: null, lalamoveStatus: null })).toBe(DELIVERY_EDIT_FINISHED_MESSAGE)
  })

  it('refuses while a rider is booked or being booked', () => {
    expect(deliveryEditRefusal({ status: 'pending', lalamoveOrderId: '123', lalamoveStatus: 'ON_GOING' })).toBe(DELIVERY_EDIT_BOOKED_MESSAGE)
    expect(deliveryEditRefusal({ status: 'pending', lalamoveOrderId: null, lalamoveStatus: 'BOOKING' })).toBe(DELIVERY_EDIT_BOOKED_MESSAGE)
  })

  it('allows it again once the booking died', () => {
    expect(deliveryEditRefusal({ status: 'pending', lalamoveOrderId: '123', lalamoveStatus: 'CANCELED' })).toBeNull()
  })
})

describe('applyDeliveryPatch', () => {
  it("clears a detail the store's own question held, so the rider stops reading it", () => {
    // The edit form shows "Nearest Landmark" as the landmark; clearing the box must clear what the rider reads.
    const { answers } = apply(
      { 'Nearest Landmark': 'Near Petron', 'Note to Rider': 'Gate is green', 'Floor / Unit': '3F', Notes: 'No onions' },
      { landmark: '', riderNote: '', unit: '' },
    )
    expect(findDeliveryDetails(answers)).toEqual({ unit: '', landmark: '', riderNote: '' })
    expect(answers).toEqual({ Notes: 'No onions' })
  })

  it("keeps the store's own question when only another detail is cleared or a detail is changed", () => {
    const { answers } = apply({ 'Nearest Landmark': 'Near Petron', 'Floor / Unit': '3F' }, { landmark: 'Near Shell', unit: '' })
    expect(answers).toEqual({ 'Nearest Landmark': 'Near Petron', delivery_landmark: 'Near Shell' })
    expect(findDeliveryDetails(answers).landmark).toBe('Near Shell')
  })

  it('sets and clears details without touching anything else', () => {
    const { answers, isDestinationChanged } = apply({ delivery_unit: 'Old', Phone: '0917' }, { unit: '', landmark: 'Blue gate', storeNote: 'Fragile' })
    expect(answers).toEqual({ Phone: '0917', delivery_landmark: 'Blue gate', delivery_store_note: 'Fragile' })
    expect(isDestinationChanged).toBe(false)
  })

  it('moves the pin, records who did it and how far it is, and ends "can\'t find my place"', () => {
    const { answers, isDestinationChanged } = apply(
      { delivery_address: 'Camella', delivery_pin_skipped: 'true' },
      { pin: { lat: 14.5, lng: 121 } },
      { editor: 'customer', origin: { lat: 14.5, lng: 121.1 } },
    )
    expect(answers).toMatchObject({
      delivery_lat: '14.5',
      delivery_lng: '121',
      delivery_pin_address: 'Camella',
      delivery_pin_confirmed: 'true',
      delivery_pin_updated_by: 'customer',
      delivery_pin_updated_at: NOW.toISOString(),
      delivery_pin_km: '10.8',
    })
    expect(answers).not.toHaveProperty('delivery_pin_skipped')
    expect(isDestinationChanged).toBe(true)
  })

  it('treats the same pin and address as no new destination', () => {
    const current = { delivery_address: 'Camella', delivery_lat: '14.5', delivery_lng: '121' }
    const { isDestinationChanged, answers } = apply(current, { address: 'Camella', pin: { lat: 14.5, lng: 121 } })
    expect(isDestinationChanged).toBe(false)
    expect(answers).toEqual(current)
  })

  it('counts a new address as a new destination', () => {
    expect(apply({ delivery_address: 'Old' }, { address: 'New' }).isDestinationChanged).toBe(true)
  })

  it('drops the old pin when the address changes and no pin was sent, so no rider goes to the old spot', () => {
    const { answers, isDestinationChanged } = apply(
      { delivery_address: 'Old', delivery_lat: '14.5', delivery_lng: '121', delivery_pin_address: 'Old', delivery_pin_confirmed: 'true', delivery_pin_km: '3', Phone: '0917' },
      { address: 'New street' },
    )
    expect(answers).toEqual({ delivery_address: 'New street', Phone: '0917' })
    expect(isDestinationChanged).toBe(true)
  })

  it('keeps the pin when the address grows and the pin is sent with it', () => {
    const { answers } = apply({ delivery_address: 'Old', delivery_lat: '14.5', delivery_lng: '121' }, { address: 'Old, Unit 5B', pin: { lat: 14.5, lng: 121 } })
    expect(answers).toEqual({ delivery_address: 'Old, Unit 5B', delivery_lat: '14.5', delivery_lng: '121' })
  })

  it('does not mutate what it was given', () => {
    const current = Object.freeze({ delivery_unit: 'Old' })
    expect(() => apply(current, { unit: 'New', pin: { lat: 1, lng: 2 } })).not.toThrow()
    expect(current).toEqual({ delivery_unit: 'Old' })
  })
})

describe('patch schemas', () => {
  it('keeps the store note away from customers', () => {
    expect(customerDeliveryPatchSchema.safeParse({ pin: { lat: 1, lng: 2 }, storeNote: 'hi' }).success).toBe(false)
    expect(merchantDeliveryPatchSchema.safeParse({ storeNote: 'hi' }).success).toBe(true)
  })

  it('requires a pin from a customer, and refuses a broken one or unknown keys', () => {
    expect(customerDeliveryPatchSchema.safeParse({ address: 'x' }).success).toBe(false)
    expect(customerDeliveryPatchSchema.safeParse({ pin: { lat: 91, lng: 2 } }).success).toBe(false)
    expect(merchantDeliveryPatchSchema.safeParse({ delivery_fee: 0 }).success).toBe(false)
  })

  it('caps every text', () => {
    expect(merchantDeliveryPatchSchema.safeParse({ landmark: 'x'.repeat(201) }).success).toBe(false)
    expect(merchantDeliveryPatchSchema.safeParse({ storeNote: 'x'.repeat(301) }).success).toBe(false)
    expect(merchantDeliveryPatchSchema.safeParse({ address: 'x'.repeat(501) }).success).toBe(false)
  })
})
