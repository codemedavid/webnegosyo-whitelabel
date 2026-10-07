import {
  applyDeliveryAddressChange,
  phPhoneDigitCount,
  phPhoneDisplayDigits,
  toPhPhoneValue,
} from '@/lib/checkout/customer-field-input'

describe('applyDeliveryAddressChange', () => {
  const previous = Object.freeze({ customer_name: 'Juan', delivery_address: 'Old', delivery_lat: '1', delivery_lng: '2' })

  it('stores a geocoded pick with its coordinates', () => {
    expect(applyDeliveryAddressChange(previous, 'delivery_address', 'Manila', { lat: 14.5, lng: 121 })).toEqual({
      customer_name: 'Juan',
      delivery_address: 'Manila',
      delivery_lat: '14.5',
      delivery_lng: '121',
    })
  })

  it('drops stale coordinates on a free-text edit so the fee path forces a re-pick', () => {
    const next = applyDeliveryAddressChange(previous, 'delivery_address', 'Manil', undefined)

    expect(next).toEqual({ customer_name: 'Juan', delivery_address: 'Manil' })
    expect(next).not.toHaveProperty('delivery_lat')
    expect(next).not.toHaveProperty('delivery_lng')
  })

  it('writes to whichever field the merchant named, never mutating the previous map', () => {
    const next = applyDeliveryAddressChange(previous, 'address', 'Cebu', null)

    expect(next.address).toBe('Cebu')
    expect(previous).toEqual({ customer_name: 'Juan', delivery_address: 'Old', delivery_lat: '1', delivery_lng: '2' })
  })
})

describe('PH phone input', () => {
  it.each([
    ['+639171234567', '9171234567'],
    ['+9171234567', '9171234567'],
    ['09171234567', '9171234567'],
    ['917-123', '917123'],
    ['', ''],
  ])('shows %p as the local digits %p', (stored, shown) => {
    expect(phPhoneDisplayDigits(stored)).toBe(shown)
  })

  it.each([
    ['9171234567', '+639171234567'],
    ['09171234567', '+639171234567'],
    ['917 123 45678', '+639171234567'],
    ['abc', ''],
    ['0', ''],
  ])('stores typed %p as %p', (typed, stored) => {
    expect(toPhPhoneValue(typed)).toBe(stored)
  })

  it.each([
    ['+639171234567', 10],
    ['09171', 4],
    ['', 0],
  ])('counts %p as %p of 10 digits', (stored, count) => {
    expect(phPhoneDigitCount(stored)).toBe(count)
  })
})
