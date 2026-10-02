import { formatPhoneForDisplay, toPhilippineE164 } from './phone'

describe('toPhilippineE164', () => {
  it.each([
    ['09171234567', '+639171234567'],
    ['9171234567', '+639171234567'],
    ['+639171234567', '+639171234567'],
    ['639171234567', '+639171234567'],
    ['0917 123 4567', '+639171234567'],
    ['(0917) 123-4567', '+639171234567'],
  ])('normalises %s', (input, expected) => {
    expect(toPhilippineE164(input)).toBe(expected)
  })

  it.each(['', '0917123456', '08171234567', '+1 415 555 0100', 'hello'])('rejects %s', (input) => {
    expect(toPhilippineE164(input)).toBeNull()
  })
})

describe('formatPhoneForDisplay', () => {
  it('groups a stored number the local way', () => {
    expect(formatPhoneForDisplay('+639171234567')).toBe('+63 917 123 4567')
  })
})
