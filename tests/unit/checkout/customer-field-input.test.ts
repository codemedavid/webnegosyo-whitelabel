import {
  applyDeliveryAddressChange,
  phPhoneDigitCount,
  phPhoneDisplayDigits,
  toPhPhoneValue,
} from '@/lib/checkout/customer-field-input'

describe('applyDeliveryAddressChange', () => {
  const previous = Object.freeze({ customer_name: 'Juan', delivery_address: 'Old', delivery_lat: '1', delivery_lng: '2' })
  const picked = Object.freeze({
    customer_name: 'Juan',
    delivery_address: '12 Mabini St, Antipolo',
    delivery_lat: '14.58',
    delivery_lng: '121.17',
    delivery_pin_address: '12 Mabini St, Antipolo',
    delivery_pin_confirmed: 'true',
  })

  it('stores a pick with its coordinates and remembers the picked label', () => {
    expect(applyDeliveryAddressChange(previous, 'delivery_address', 'Manila', { lat: 14.5, lng: 121 })).toEqual({
      customer_name: 'Juan',
      delivery_address: 'Manila',
      delivery_lat: '14.5',
      delivery_lng: '121',
      delivery_pin_address: 'Manila',
    })
  })

  it('marks a pin the customer confirmed on the map', () => {
    expect(
      applyDeliveryAddressChange(previous, 'delivery_address', 'Manila', { lat: 14.5, lng: 121 }, { isConfirmed: true }),
    ).toMatchObject({ delivery_pin_confirmed: 'true' })
  })

  it('keeps the pin when the customer adds to the picked address', () => {
    expect(applyDeliveryAddressChange(picked, 'delivery_address', 'Unit 5B, 12 Mabini St,  antipolo (blue gate)', undefined)).toEqual({
      ...picked,
      delivery_address: 'Unit 5B, 12 Mabini St,  antipolo (blue gate)',
    })
  })

  it('drops the pin when the picked address is rewritten, so the fee path forces a re-pick', () => {
    const next = applyDeliveryAddressChange(picked, 'delivery_address', '12 Mabini', undefined)

    expect(next).toEqual({ customer_name: 'Juan', delivery_address: '12 Mabini' })
  })

  it('drops coordinates that were never tied to a picked label', () => {
    const next = applyDeliveryAddressChange(previous, 'delivery_address', 'Old place', undefined)

    expect(next).toEqual({ customer_name: 'Juan', delivery_address: 'Old place' })
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
