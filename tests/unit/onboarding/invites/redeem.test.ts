import { redeemInvite, type RedeemDeps } from '@/lib/onboarding/invites/redeem'

const FORM = { name: 'Juan dela Cruz', business_name: "Juan's Kitchen", email: 'juan@example.com', phone: '09171234567' }
const CLAIMED = { id: 'inv-1', label: 'Juan – GCash', paymentTerm: 'monthly_subscription' as const, notes: 'ref 1234' }

function deps(overrides: Partial<RedeemDeps> = {}): RedeemDeps {
  return {
    isEmailTaken: jest.fn(async () => false),
    claimInvite: jest.fn(async () => CLAIMED),
    releaseInvite: jest.fn(async () => undefined),
    createPaidLead: jest.fn(async () => ({ id: 'lead-1' })),
    attachLead: jest.fn(async () => undefined),
    startOnboarding: jest.fn(async () => 'tok-1'),
    ...overrides,
  }
}

describe('redeemInvite', () => {
  test('claims the link, saves a paid lead at the link plan and opens the wizard', async () => {
    // Arrange
    const d = deps()

    // Act
    const result = await redeemInvite('hash-1', FORM, d)

    // Assert
    expect(result).toEqual({ kind: 'started', token: 'tok-1', leadId: 'lead-1' })
    expect(d.claimInvite).toHaveBeenCalledWith('hash-1')
    expect(d.createPaidLead).toHaveBeenCalledWith({
      ...FORM,
      payment_term: 'monthly_subscription',
      notes: 'Sign-up link: Juan – GCash\nref 1234',
    })
    expect(d.attachLead).toHaveBeenCalledWith('inv-1', 'lead-1')
    expect(d.startOnboarding).toHaveBeenCalledWith('lead-1')
    expect(d.releaseInvite).not.toHaveBeenCalled()
  })

  test('an email that already has a login is refused and the link is given straight back', async () => {
    const d = deps({ isEmailTaken: jest.fn(async () => true) })

    const result = await redeemInvite('hash-1', FORM, d)

    expect(result.kind).toBe('email_taken')
    expect(d.releaseInvite).toHaveBeenCalledWith('inv-1')
    expect(d.createPaidLead).not.toHaveBeenCalled()
  })

  test('an invalid code never reaches the email check (no account enumeration with random codes)', async () => {
    const d = deps({ claimInvite: jest.fn(async () => null), isEmailTaken: jest.fn(async () => true) })

    const result = await redeemInvite('random-hash', FORM, d)

    expect(result.kind).toBe('unavailable')
    expect(d.isEmailTaken).not.toHaveBeenCalled()
  })

  test('a failing email check gives the link back and rethrows', async () => {
    const d = deps({ isEmailTaken: jest.fn(async () => { throw new Error('rpc down') }) })

    await expect(redeemInvite('hash-1', FORM, d)).rejects.toThrow('rpc down')
    expect(d.releaseInvite).toHaveBeenCalledWith('inv-1')
  })

  test('a link someone else already used (or expired / turned off) is refused', async () => {
    const d = deps({ claimInvite: jest.fn(async () => null) })

    const result = await redeemInvite('hash-1', FORM, d)

    expect(result.kind).toBe('unavailable')
    expect(d.createPaidLead).not.toHaveBeenCalled()
  })

  test('a lead that cannot be saved gives the use back, so the link still works', async () => {
    const d = deps({ createPaidLead: jest.fn(async () => null) })

    const result = await redeemInvite('hash-1', FORM, d)

    expect(result.kind).toBe('failed')
    expect(d.releaseInvite).toHaveBeenCalledWith('inv-1')
  })

  test('a thrown lead write also gives the use back', async () => {
    jest.spyOn(console, 'error').mockImplementationOnce(() => undefined)
    const d = deps({ createPaidLead: jest.fn(async () => { throw new Error('db down') }) })

    const result = await redeemInvite('hash-1', FORM, d)

    expect(result.kind).toBe('failed')
    expect(d.releaseInvite).toHaveBeenCalledWith('inv-1')
  })

  test('once the paid lead exists the link stays spent, even if the wizard link fails', async () => {
    const d = deps({ startOnboarding: jest.fn(async () => null) })

    const result = await redeemInvite('hash-1', FORM, d)

    expect(result).toEqual({ kind: 'saved_without_link', leadId: 'lead-1' })
    expect(d.releaseInvite).not.toHaveBeenCalled()
  })

  test('a failed lead link-back is logged, not fatal — the buyer still gets the wizard', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const d = deps({ attachLead: jest.fn(async () => { throw new Error('nope') }) })

    const result = await redeemInvite('hash-1', FORM, d)

    expect(result.kind).toBe('started')
    expect(d.releaseInvite).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  test('without notes the lead note names only the link', async () => {
    const d = deps({ claimInvite: jest.fn(async () => ({ ...CLAIMED, notes: null })) })

    await redeemInvite('hash-1', FORM, d)

    expect(d.createPaidLead).toHaveBeenCalledWith(expect.objectContaining({ notes: 'Sign-up link: Juan – GCash' }))
  })
})
