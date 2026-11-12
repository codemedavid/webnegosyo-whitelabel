import {
  CODE_LENGTH,
  formatCountdown,
  isCompleteCode,
  isPrototypeCodeAccepted,
  maskPhone,
  nationalDigits,
  resendSecondsLeft,
  sanitizeCode,
} from './code-input'

describe('sanitizeCode', () => {
  it.each([
    ['123456', '123456'],
    ['12 34 56', '123456'],
    ['Your code is 482913.', '482913'],
    ['1234567890', '123456'],
    ['abc', ''],
  ])('keeps the first six digits of %p', (input, expected) => {
    expect(sanitizeCode(input)).toBe(expected)
  })
})

describe('isCompleteCode', () => {
  it('needs exactly six digits', () => {
    expect(CODE_LENGTH).toBe(6)
    expect(isCompleteCode('12345')).toBe(false)
    expect(isCompleteCode('123456')).toBe(true)
    expect(isCompleteCode('12345a')).toBe(false)
  })
})

describe('isPrototypeCodeAccepted', () => {
  it('accepts any complete code except 000000, which stands in for a wrong code', () => {
    expect(isPrototypeCodeAccepted('482913')).toBe(true)
    expect(isPrototypeCodeAccepted('000000')).toBe(false)
    expect(isPrototypeCodeAccepted('4829')).toBe(false)
  })
})

describe('resendSecondsLeft', () => {
  it('counts down from the cooldown and never goes below zero', () => {
    expect(resendSecondsLeft(1_000, 1_000, 30)).toBe(30)
    expect(resendSecondsLeft(1_000, 1_500, 30)).toBe(30)
    expect(resendSecondsLeft(1_000, 2_000, 30)).toBe(29)
    expect(resendSecondsLeft(1_000, 31_000, 30)).toBe(0)
    expect(resendSecondsLeft(1_000, 99_000, 30)).toBe(0)
  })
})

describe('formatCountdown', () => {
  it.each([
    [30, '0:30'],
    [5, '0:05'],
    [65, '1:05'],
    [0, '0:00'],
  ])('%p seconds reads %p', (seconds, expected) => {
    expect(formatCountdown(seconds)).toBe(expected)
  })
})

describe('nationalDigits', () => {
  it.each([
    ['9171234567', '9171234567'],
    ['09171234567', '9171234567'],
    ['+63 917 123 4567', '9171234567'],
    ['639171234567', '9171234567'],
    ['917-123', '917123'],
    ['91712345678999', '9171234567'],
  ])('keeps the ten national digits of %p', (input, expected) => {
    expect(nationalDigits(input)).toBe(expected)
  })
})

describe('maskPhone', () => {
  it('hides the middle digits', () => {
    expect(maskPhone('+639171234567')).toBe('+63 917 ••• 4567')
  })
})
