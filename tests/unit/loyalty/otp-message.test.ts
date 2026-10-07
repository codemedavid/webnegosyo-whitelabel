import { buildLoyaltyOtpMessage, loyaltyOtpTemplate, OTP_PLACEHOLDER } from '@/lib/loyalty/otp-message'

describe('loyalty OTP message', () => {
  test('leads with the code so no carrier filter sees a "TEST" prefix', () => {
    const message = buildLoyaltyOtpMessage('Test Kitchen', '012345')
    expect(message.startsWith('012345 ')).toBe(true)
    expect(message).toContain('Test Kitchen')
    expect(message).toContain('5 minutes')
  })

  test('fits one GSM-7 segment for a typical store name', () => {
    expect(buildLoyaltyOtpMessage('Webnegosyo Coffee', '123456').length).toBeLessThanOrEqual(160)
  })

  test('truncates long names and strips characters that could forge a placeholder or break lines', () => {
    const message = buildLoyaltyOtpMessage(`A{otp}B\n${'x'.repeat(80)}`, '123456')
    expect(message).not.toContain('{')
    expect(message).not.toContain('\n')
    expect(message.length).toBeLessThanOrEqual(160)
  })

  test('falls back to a generic sentence when the name is blank or missing', () => {
    expect(buildLoyaltyOtpMessage('   ', '123456')).toBe(
      '123456 is your reward code. It expires in 5 minutes. Never share it with anyone.',
    )
    expect(buildLoyaltyOtpMessage(null, '123456')).toBe(buildLoyaltyOtpMessage('', '123456'))
  })

  test('the template carries exactly one placeholder where the code goes', () => {
    const template = loyaltyOtpTemplate('Cafe')
    expect(template.split(OTP_PLACEHOLDER)).toHaveLength(2)
    expect(template.replace(OTP_PLACEHOLDER, '654321')).toBe(buildLoyaltyOtpMessage('Cafe', '654321'))
  })

  test('refuses anything but a 6-digit code', () => {
    expect(() => buildLoyaltyOtpMessage('Cafe', '12345')).toThrow()
    expect(() => buildLoyaltyOtpMessage('Cafe', 'abcdef')).toThrow()
  })
})
