/**
 * Payment-detail line parsing.
 *
 * A merchant types free text like "GCash: 0917 123 4567". The checkout shows
 * it as a label + value row so the customer can copy the NUMBER, not the
 * whole line. Anything that does not look like a "Label: value" pair stays a
 * plain line — a URL must never be split on its scheme colon.
 */
import { describe, it, expect } from '@jest/globals'
import { parsePaymentDetailLines, getPaymentMethodHint } from '@/lib/payment-details-lines'

describe('parsePaymentDetailLines', () => {
  it('splits "Label: value" lines into a label and a copyable value', () => {
    // Arrange
    const details = 'GCash: 0917 123 4567\nAccount Name: Juan Dela Cruz'

    // Act
    const rows = parsePaymentDetailLines(details)

    // Assert
    expect(rows).toEqual([
      { label: 'GCash', value: '0917 123 4567' },
      { label: 'Account Name', value: 'Juan Dela Cruz' },
    ])
  })

  it('keeps a line without a colon as a plain value', () => {
    expect(parsePaymentDetailLines('Send exact amount only')).toEqual([
      { label: null, value: 'Send exact amount only' },
    ])
  })

  it('drops blank lines and trims whitespace', () => {
    expect(parsePaymentDetailLines('  Maya: 0918 000 1111  \n\n   \nRef: ABC ')).toEqual([
      { label: 'Maya', value: '0918 000 1111' },
      { label: 'Ref', value: 'ABC' },
    ])
  })

  it('never splits a URL on its scheme colon', () => {
    expect(parsePaymentDetailLines('https://pay.example.com/juan')).toEqual([
      { label: null, value: 'https://pay.example.com/juan' },
    ])
  })

  it('keeps a long sentence with a colon as a plain value', () => {
    const sentence = 'Please include your full name and order number in the notes: thank you'
    expect(parsePaymentDetailLines(sentence)).toEqual([{ label: null, value: sentence }])
  })

  it('keeps a line whose colon has nothing after it as a plain value', () => {
    expect(parsePaymentDetailLines('Note:')).toEqual([{ label: null, value: 'Note:' }])
  })

  it('returns an empty list for empty or missing details', () => {
    expect(parsePaymentDetailLines('')).toEqual([])
    expect(parsePaymentDetailLines(undefined)).toEqual([])
    expect(parsePaymentDetailLines(null)).toEqual([])
  })
})

describe('getPaymentMethodHint', () => {
  it('names the QR when the method has one', () => {
    expect(getPaymentMethodHint({ qr_code_url: 'https://x/qr.png', details: 'GCash: 0917' })).toBe(
      'Scan QR to pay',
    )
  })

  it('uses the first detail line when there is no QR', () => {
    expect(getPaymentMethodHint({ details: 'GCash: 0917 123 4567\nName: Juan' })).toBe('GCash: 0917 123 4567')
  })

  it('says the order is placed directly when the method skips the payment step', () => {
    expect(getPaymentMethodHint({ skip_payment_details: true })).toBe('No payment details needed')
  })

  it('returns null when nothing is known about the method', () => {
    expect(getPaymentMethodHint({})).toBeNull()
  })
})
