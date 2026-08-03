import {
  SMS_CONSENT_KEY,
  hasSmsConsent,
  withSmsConsent,
} from '@/lib/sms-consent'

describe('withSmsConsent', () => {
  it('records an explicit opt-in as a real boolean', () => {
    // The read paths (customers-service, customer-external-orders) both compare
    // with `=== true`. A string "true" would be silently ignored, and the guest
    // would never become reachable despite having ticked the box.
    const result = withSmsConsent({ customer_name: 'Maria' }, true, '2026-08-20T02:00:00.000Z')

    expect(result[SMS_CONSENT_KEY]).toBe(true)
  })

  it('stamps when consent was given, which is what makes it defensible', () => {
    const result = withSmsConsent({}, true, '2026-08-20T02:00:00.000Z')

    expect(result.sms_consent_at).toBe('2026-08-20T02:00:00.000Z')
  })

  it('records a declined opt-in as false, not as absent', () => {
    // Absent and false read the same to the aggregate, but only one of them
    // proves the guest was asked.
    const result = withSmsConsent({}, false, '2026-08-20T02:00:00.000Z')

    expect(result[SMS_CONSENT_KEY]).toBe(false)
    expect(result.sms_consent_at).toBeNull()
  })

  it('keeps every other field untouched', () => {
    const result = withSmsConsent(
      { customer_name: 'Maria', customer_phone: '+639171234567' },
      true,
      '2026-08-20T02:00:00.000Z'
    )

    expect(result.customer_name).toBe('Maria')
    expect(result.customer_phone).toBe('+639171234567')
  })

  it('does not mutate the object it was given', () => {
    const input = { customer_name: 'Maria' }

    withSmsConsent(input, true, '2026-08-20T02:00:00.000Z')

    expect(input).toEqual({ customer_name: 'Maria' })
  })
})

describe('hasSmsConsent', () => {
  it('is true only for an explicit boolean true', () => {
    expect(hasSmsConsent({ sms_consent: true })).toBe(true)
  })

  it('is false for the string "true", which is how a form field would arrive', () => {
    // This is the specific bug the boolean write above prevents; pinning it
    // here documents why withSmsConsent cannot just spread a form value.
    expect(hasSmsConsent({ sms_consent: 'true' })).toBe(false)
  })

  it('is false when the guest declined', () => {
    expect(hasSmsConsent({ sms_consent: false })).toBe(false)
  })

  it('is false when the field was never captured', () => {
    expect(hasSmsConsent({})).toBe(false)
  })

  it('is false for a null or malformed blob rather than throwing', () => {
    expect(hasSmsConsent(null)).toBe(false)
    expect(hasSmsConsent(undefined)).toBe(false)
    expect(hasSmsConsent('nonsense')).toBe(false)
    expect(hasSmsConsent([1, 2, 3])).toBe(false)
  })
})
