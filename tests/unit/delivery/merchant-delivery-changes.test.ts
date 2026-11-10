import { merchantDeliveryChanges, type MerchantDeliveryDraft } from '@/lib/delivery/order-delivery-edit'

const opened: MerchantDeliveryDraft = {
  address: 'Quezon Ave, Lucena City',
  pin: { lat: 13.9373, lng: 121.617 },
  unit: 'Blk 4 Lot 12',
  landmark: 'Tapat ng sari-sari store',
  riderNote: 'Call when outside',
  storeNote: '',
}

describe('merchantDeliveryChanges', () => {
  test('sends only the store note when only the store note changed', () => {
    // Arrange
    const draft = { ...opened, storeNote: ' Extra napkins ' }

    // Act
    const patch = merchantDeliveryChanges(opened, draft)

    // Assert
    expect(patch).toEqual({ storeNote: 'Extra napkins' })
  })

  test('leaves a pin the customer moved alone when the merchant did not touch the pin', () => {
    // A card opened before the customer used the pin link still holds the old pin;
    // saving a note from it must not send that old pin (or the old words) back.
    const draft = { ...opened, storeNote: 'Gate is blue' }

    const patch = merchantDeliveryChanges(opened, draft)

    expect(patch).not.toHaveProperty('pin')
    expect(patch).not.toHaveProperty('address')
    expect(patch).not.toHaveProperty('landmark')
  })

  test('sends a moved pin and a cleared detail', () => {
    const draft = { ...opened, pin: { lat: 13.94, lng: 121.62 }, landmark: '  ' }

    const patch = merchantDeliveryChanges(opened, draft)

    expect(patch).toEqual({ pin: { lat: 13.94, lng: 121.62 }, landmark: '' })
  })

  test('returns an empty patch when nothing changed (whitespace only)', () => {
    const draft = { ...opened, unit: ' Blk 4 Lot 12 ' }

    expect(merchantDeliveryChanges(opened, draft)).toEqual({})
  })

  test('never sends a blank address (the schema refuses one)', () => {
    const draft = { ...opened, address: '   ' }

    expect(merchantDeliveryChanges(opened, draft)).toEqual({})
  })
})
