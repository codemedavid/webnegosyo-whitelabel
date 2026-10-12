import { describe, expect, it } from '@jest/globals'
import { TIN_PATTERN, formatBranchCodeInput, formatTinInput, splitTin } from '@/lib/tax-settings/tin'

describe('formatTinInput — the TIN as it is typed', () => {
  it.each([
    ['', ''],
    ['123', '123'],
    ['1234', '123-4'],
    ['123456789', '123-456-789'],
    ['12345678900000', '123-456-789-00000'],
  ])('groups %p as %p', (typed, shown) => {
    expect(formatTinInput(typed)).toBe(shown)
  })

  it('drops letters, spaces and extra digits', () => {
    expect(formatTinInput('TIN 123 456 789 00000 999')).toBe('123-456-789-00000')
  })

  it('accepts a pasted TIN with dashes unchanged', () => {
    expect(formatTinInput('123-456-789-000')).toBe('123-456-789-000')
  })

  it('always produces something the database constraint accepts once complete', () => {
    expect(TIN_PATTERN.test(formatTinInput('123456789'))).toBe(true)
    expect(TIN_PATTERN.test(formatTinInput('123456789000'))).toBe(true)
    expect(TIN_PATTERN.test(formatTinInput('12345678900000'))).toBe(true)
  })

  it('leaves an incomplete TIN for the validator to refuse', () => {
    expect(TIN_PATTERN.test(formatTinInput('12345678'))).toBe(false)
    expect(TIN_PATTERN.test(formatTinInput('1234567890'))).toBe(false)
  })
})

describe('formatBranchCodeInput', () => {
  it('keeps at most five digits', () => {
    expect(formatBranchCodeInput('00a0001')).toBe('00000')
  })
})

describe('splitTin', () => {
  it('separates a branch code typed after the nine digits', () => {
    expect(splitTin('123-456-789-00000')).toEqual({ base: '123-456-789', branch: '00000' })
  })

  it('returns no branch for a nine-digit TIN', () => {
    expect(splitTin('123456789')).toEqual({ base: '123-456-789', branch: '' })
  })

  it('returns empty parts for an empty field', () => {
    expect(splitTin('')).toEqual({ base: '', branch: '' })
  })
})
