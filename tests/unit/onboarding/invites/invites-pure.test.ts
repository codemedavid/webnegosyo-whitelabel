import { createInviteCode, hashInviteCode, isWellFormedInviteCode } from '@/lib/onboarding/invites/code'
import { inviteStatus, inviteExpiryFrom, INVITE_EXPIRY_DAYS, DEFAULT_INVITE_EXPIRY_DAYS } from '@/lib/onboarding/invites/status'
import { createInviteSchema, joinFormSchema } from '@/lib/onboarding/invites/schema'
import { buildSignupLinkMessage } from '@/lib/onboarding/invites/share'
import { joinPageState, JOIN_RESUME_MAX_AGE_SEC } from '@/lib/onboarding/invites/resume'

const NOW = Date.parse('2026-10-09T12:00:00Z')
const iso = (ms: number) => new Date(ms).toISOString()
const DAY = 86_400_000

describe('invite codes', () => {
  test('a new code is well formed and only its hash is meant for storage', () => {
    // Act
    const { code, hash } = createInviteCode()

    // Assert
    expect(isWellFormedInviteCode(code)).toBe(true)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).toBe(hashInviteCode(code))
    expect(hash).not.toContain(code)
  })

  test('two codes never repeat', () => {
    expect(createInviteCode().code).not.toBe(createInviteCode().code)
  })

  test('junk is rejected before any database read', () => {
    expect(isWellFormedInviteCode('short')).toBe(false)
    expect(isWellFormedInviteCode('a'.repeat(43))).toBe(false)
    expect(isWellFormedInviteCode('a'.repeat(21) + '/')).toBe(false)
    expect(isWellFormedInviteCode(undefined)).toBe(false)
    expect(isWellFormedInviteCode('a'.repeat(22))).toBe(true)
  })
})

describe('inviteStatus', () => {
  const active = { claimedAt: null, revokedAt: null, expiresAt: iso(NOW + DAY) }

  test('an untouched, unexpired link is active', () => {
    expect(inviteStatus(active, NOW)).toBe('active')
  })

  test('a claimed link reads as used, even if it was turned off or expired later', () => {
    expect(inviteStatus({ ...active, claimedAt: iso(NOW - 1000), revokedAt: iso(NOW) }, NOW)).toBe('used')
    expect(inviteStatus({ ...active, claimedAt: iso(NOW - 2 * DAY), expiresAt: iso(NOW - DAY) }, NOW)).toBe('used')
  })

  test('a turned-off link reads as revoked before expired', () => {
    expect(inviteStatus({ ...active, revokedAt: iso(NOW - 1000), expiresAt: iso(NOW - 1) }, NOW)).toBe('revoked')
  })

  test('a link is expired from the expiry instant on', () => {
    expect(inviteStatus({ ...active, expiresAt: iso(NOW) }, NOW)).toBe('expired')
    expect(inviteStatus({ ...active, expiresAt: iso(NOW + 1) }, NOW)).toBe('active')
  })

  test('expiry is counted in whole days from now', () => {
    expect(INVITE_EXPIRY_DAYS).toContain(DEFAULT_INVITE_EXPIRY_DAYS)
    expect(inviteExpiryFrom(NOW, 7)).toBe(iso(NOW + 7 * DAY))
  })
})

describe('createInviteSchema', () => {
  const valid = { label: 'Juan – paid via GCash', payment_term: 'monthly_subscription', expires_in_days: 30 }

  test('accepts a label, a plan and a listed expiry; notes are optional', () => {
    expect(createInviteSchema.safeParse(valid).success).toBe(true)
    expect(createInviteSchema.safeParse({ ...valid, notes: 'ref 1234' }).success).toBe(true)
  })

  test('refuses an unknown plan, an unlisted expiry, a blank label or extra keys', () => {
    expect(createInviteSchema.safeParse({ ...valid, payment_term: 'free' }).success).toBe(false)
    expect(createInviteSchema.safeParse({ ...valid, expires_in_days: 365 }).success).toBe(false)
    expect(createInviteSchema.safeParse({ ...valid, label: ' ' }).success).toBe(false)
    expect(createInviteSchema.safeParse({ ...valid, max_uses: 5 }).success).toBe(false)
  })
})

describe('joinFormSchema', () => {
  const valid = { name: 'Juan dela Cruz', business_name: "Juan's Kitchen", email: ' Juan@Example.com ', phone: '0917 123 4567' }

  test('normalises the email it will use as the login', () => {
    const parsed = joinFormSchema.parse(valid)
    expect(parsed.email).toBe('juan@example.com')
  })

  test('the customer cannot pick their own plan or price', () => {
    expect(joinFormSchema.safeParse({ ...valid, payment_term: 'full_payment' }).success).toBe(false)
    expect(joinFormSchema.safeParse({ ...valid, status: 'paid' }).success).toBe(false)
  })

  test('refuses a bad email or missing fields', () => {
    expect(joinFormSchema.safeParse({ ...valid, email: 'nope' }).success).toBe(false)
    expect(joinFormSchema.safeParse({ ...valid, business_name: '' }).success).toBe(false)
  })
})

describe('buildSignupLinkMessage', () => {
  test('carries the link and says it works once', () => {
    const message = buildSignupLinkMessage('https://www.webnegosyo.com/onboarding/join/abc')
    expect(message).toContain('https://www.webnegosyo.com/onboarding/join/abc')
    expect(message).toMatch(/once/i)
  })
})

describe('join page state', () => {
  const invite = { claimedAt: null, revokedAt: null, expiresAt: iso(NOW + DAY), checkoutLeadId: null }
  const used = { ...invite, claimedAt: iso(NOW - 1000), checkoutLeadId: 'lead-1' }

  test('an active link shows the form', () => {
    expect(joinPageState(invite, null, NOW)).toEqual({ kind: 'form' })
  })

  test('the browser that used the link goes back to its own wizard', () => {
    expect(joinPageState(used, { token: 'tok', checkoutLeadId: 'lead-1' }, NOW)).toEqual({ kind: 'resume', token: 'tok' })
  })

  test("anyone else — or a cookie for another lead — sees the link as used", () => {
    expect(joinPageState(used, null, NOW)).toEqual({ kind: 'used' })
    expect(joinPageState(used, { token: 'tok', checkoutLeadId: 'lead-2' }, NOW)).toEqual({ kind: 'used' })
  })

  test('a used link whose lead was never linked back cannot be resumed', () => {
    expect(joinPageState({ ...used, checkoutLeadId: null }, { token: 'tok', checkoutLeadId: 'lead-1' }, NOW)).toEqual({ kind: 'used' })
  })

  test('turned-off and expired links say so', () => {
    expect(joinPageState({ ...invite, revokedAt: iso(NOW) }, null, NOW)).toEqual({ kind: 'revoked' })
    expect(joinPageState({ ...invite, expiresAt: iso(NOW - 1) }, null, NOW)).toEqual({ kind: 'expired' })
  })

  test('the resume cookie outlives the link itself', () => {
    expect(JOIN_RESUME_MAX_AGE_SEC).toBeGreaterThanOrEqual(90 * 86_400)
  })
})
