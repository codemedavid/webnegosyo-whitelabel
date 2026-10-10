/** @jest-environment node */
/**
 * LIVE check of sign-up links against the real platform database: the
 * single-use claim under a race, give-back, turn-off, expiry, the taken-email
 * check, and one full redeem (paid lead + set-up wizard). Every row it writes
 * is deleted afterwards.
 *
 * Opt-in:
 *   ONBOARDING_INVITES_LIVE=1 npx jest tests/live/onboarding-invites-live.test.ts
 */
import fs from 'fs'
import path from 'path'

const isLive = process.env.ONBOARDING_INVITES_LIVE === '1'

if (isLive) {
  // The test environment loads .env.test (fake hosts); a live run must use the real ones.
  for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match) process.env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
}

const liveDescribe = isLive ? describe : describe.skip
const DAY = 86_400_000

liveDescribe('sign-up links (live platform DB)', () => {
  const inviteIds: string[] = []
  const leadIds: string[] = []

  async function load() {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const repo = await import('@/lib/onboarding/invites/repository')
    const { createInviteCode } = await import('@/lib/onboarding/invites/code')
    const admin = createAdminClient()
    const { data: creator } = await admin.from('app_users').select('user_id').eq('role', 'superadmin').limit(1).single()
    async function make(expiresInMs = DAY) {
      const { code, hash } = createInviteCode()
      const invite = await repo.insertInvite(admin, {
        codeHash: hash, label: 'LIVE TEST — delete me', paymentTerm: 'monthly_subscription', notes: null,
        expiresAt: new Date(Date.now() + expiresInMs).toISOString(), createdBy: (creator as { user_id: string }).user_id,
      })
      inviteIds.push(invite.id)
      return { code, hash, invite }
    }
    return { admin, repo, make }
  }

  afterAll(async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    if (leadIds.length) await admin.from('checkout_leads').delete().in('id', leadIds)
    if (inviteIds.length) await admin.from('onboarding_invites').delete().in('id', inviteIds)
  })

  test('two simultaneous claims: exactly one wins', async () => {
    const { admin, repo, make } = await load()
    const { hash } = await make()

    const results = await Promise.all([repo.claimInvite(admin, hash), repo.claimInvite(admin, hash), repo.claimInvite(admin, hash)])

    expect(results.filter(Boolean)).toHaveLength(1)
  })

  test('a given-back link can be claimed again', async () => {
    const { admin, repo, make } = await load()
    const { hash, invite } = await make()

    expect(await repo.claimInvite(admin, hash)).not.toBeNull()
    await repo.releaseInvite(admin, invite.id)
    expect(await repo.claimInvite(admin, hash)).not.toBeNull()
  })

  test('turned-off and expired links cannot be claimed; a used link cannot be turned off', async () => {
    const { admin, repo, make } = await load()
    const revoked = await make()
    const expired = await make(-1000)
    const used = await make()

    expect(await repo.revokeInvite(admin, revoked.invite.id)).toBe(true)
    expect(await repo.claimInvite(admin, revoked.hash)).toBeNull()
    expect(await repo.claimInvite(admin, expired.hash)).toBeNull()
    expect(await repo.claimInvite(admin, used.hash)).not.toBeNull()
    expect(await repo.revokeInvite(admin, used.invite.id)).toBe(false)
  })

  test('the taken-email check sees real logins, case-insensitively', async () => {
    const { admin, repo } = await load()
    const { data } = await admin.from('app_users').select('email').not('email', 'is', null).limit(1).single()
    const email = (data as { email: string }).email

    expect(await repo.isEmailTaken(admin, email.toUpperCase())).toBe(true)
    expect(await repo.isEmailTaken(admin, `nobody-${Date.now()}@example.invalid`)).toBe(false)
  })

  test('a full redeem makes a paid lead at the link plan and a working set-up wizard', async () => {
    const { admin, repo, make } = await load()
    const { redeemInvite } = await import('@/lib/onboarding/invites/redeem')
    const { createPaidCheckoutLead } = await import('@/lib/checkout-leads/checkout-leads-service')
    const { startStoreOnboarding } = await import('@/lib/onboarding/start')
    const { findOnboardingForToken } = await import('@/lib/onboarding/access')
    const { hash, invite } = await make()
    const form = { name: 'Live Test', business_name: 'Live Test Kitchen', email: `live-invite-${Date.now()}@example.invalid`, phone: '09170000000' }

    const result = await redeemInvite(hash, form, {
      isEmailTaken: (email) => repo.isEmailTaken(admin, email),
      claimInvite: (h) => repo.claimInvite(admin, h),
      releaseInvite: (id) => repo.releaseInvite(admin, id),
      createPaidLead: async (input) => (await createPaidCheckoutLead(input)).data,
      attachLead: (id, leadId) => repo.attachInviteLead(admin, id, leadId),
      startOnboarding: startStoreOnboarding,
    })
    if (result.kind === 'started' || result.kind === 'saved_without_link') leadIds.push(result.leadId)

    expect(result.kind).toBe('started')
    if (result.kind !== 'started') return
    const { data: lead } = await admin.from('checkout_leads').select('status, payment_term, amount, notes').eq('id', result.leadId).single()
    expect(lead).toMatchObject({ status: 'paid', payment_term: 'monthly_subscription', amount: 999, notes: 'Sign-up link: LIVE TEST — delete me' })
    expect((await findOnboardingForToken(admin, result.token))?.checkoutLeadId).toBe(result.leadId)
    const stored = await repo.findInviteByHash(admin, hash)
    expect(stored).toMatchObject({ id: invite.id, checkoutLeadId: result.leadId })
    expect(stored?.claimedAt).not.toBeNull()
    expect(await repo.claimInvite(admin, hash)).toBeNull()
    expect(await repo.revokeInvite(admin, invite.id)).toBe(false)
  })
})
