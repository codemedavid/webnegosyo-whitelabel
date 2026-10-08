import { buildSetupInvite, canSendSetupLink, invitePaidCustomerSchema } from '@/lib/onboarding/invite'

const URL = 'https://www.webnegosyo.com/onboarding/abc'

describe('canSendSetupLink — the link goes out only after payment', () => {
  test('paid and live leads can get a link', () => {
    expect(canSendSetupLink('paid')).toBe(true)
    expect(canSendSetupLink('live')).toBe(true)
  })

  test('unpaid, cancelled or unknown leads cannot', () => {
    expect(canSendSetupLink('initiated')).toBe(false)
    expect(canSendSetupLink('setup_in_progress')).toBe(false)
    expect(canSendSetupLink('cancelled')).toBe(false)
    expect(canSendSetupLink(null)).toBe(false)
  })
})

describe('buildSetupInvite', () => {
  test('greets the owner by first name and carries the link and store name', () => {
    // Act
    const invite = buildSetupInvite({ ownerName: 'Juan dela Cruz', businessName: "Juan's Kitchen", url: URL })

    // Assert
    expect(invite.message).toMatch(/^Hi Juan!/)
    expect(invite.message).toContain(URL)
    expect(invite.message).toContain("Juan's Kitchen")
    expect(invite.emailSubject).toContain("Juan's Kitchen")
  })

  test('builds a ready-to-send SMS to the buyer phone', () => {
    // Act
    const invite = buildSetupInvite({ ownerName: 'Ana', businessName: 'Kape', url: URL, phone: '0917 123-4567' })

    // Assert
    expect(invite.smsHref).toBe(`sms:09171234567?&body=${encodeURIComponent(invite.message)}`)
  })

  test('builds a mailto with subject and body', () => {
    // Act
    const invite = buildSetupInvite({ ownerName: 'Ana', businessName: 'Kape', url: URL, email: 'ana@example.com' })

    // Assert
    expect(invite.emailHref).toBe(
      `mailto:ana@example.com?subject=${encodeURIComponent(invite.emailSubject)}&body=${encodeURIComponent(invite.message)}`,
    )
  })

  test('offers no SMS or email when the contact is missing or malformed', () => {
    // Act
    const invite = buildSetupInvite({ ownerName: '', businessName: 'Kape', url: URL, phone: 'n/a', email: 'not-an-email' })

    // Assert
    expect(invite.smsHref).toBeNull()
    expect(invite.emailHref).toBeNull()
    expect(invite.message).toMatch(/^Hi!/)
  })
})

describe('invitePaidCustomerSchema', () => {
  const valid = {
    name: 'Ana Reyes',
    email: 'ANA@Example.com ',
    phone: '0917 123 4567',
    business_name: 'Kape ni Ana',
    payment_term: 'monthly_subscription',
  }

  test('accepts a complete invite and normalizes the email', () => {
    // Act
    const parsed = invitePaidCustomerSchema.safeParse(valid)

    // Assert
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.email).toBe('ana@example.com')
  })

  test('refuses a missing business name or a bad email', () => {
    expect(invitePaidCustomerSchema.safeParse({ ...valid, business_name: '' }).success).toBe(false)
    expect(invitePaidCustomerSchema.safeParse({ ...valid, email: 'nope' }).success).toBe(false)
  })

  test('refuses an unknown payment term', () => {
    expect(invitePaidCustomerSchema.safeParse({ ...valid, payment_term: 'free' }).success).toBe(false)
  })
})
