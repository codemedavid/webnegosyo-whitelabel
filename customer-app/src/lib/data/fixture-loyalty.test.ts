import { VALID_LOYALTY } from '@/fixtures/contract-fixtures'
import { appRewardClaimSchema } from '@/lib/contract'
import { PROTOTYPE_CLAIM_LIFETIME_MS, prototypeRewardClaim } from './fixture-source'

jest.mock('expo-application', () => ({ applicationId: 'com.webnegosyo.kapedemo' }))

describe('prototypeRewardClaim (demo "Use now")', () => {
  it('returns a contract-valid code good for about two minutes', async () => {
    const now = Date.parse('2026-11-12T02:00:00Z')
    const claim = await prototypeRewardClaim(VALID_LOYALTY.rewards[0].id, now)
    expect(appRewardClaimSchema.safeParse(claim).success).toBe(true)
    expect(Date.parse(claim.expiresAt) - now).toBe(PROTOTYPE_CLAIM_LIFETIME_MS)
  })

  it('mints a different code each time', async () => {
    const [first, second] = await Promise.all([
      prototypeRewardClaim(VALID_LOYALTY.rewards[0].id),
      prototypeRewardClaim(VALID_LOYALTY.rewards[0].id),
    ])
    expect(first.token).not.toBe(second.token)
  })

  it('refuses a reward that isn’t on the demo card', async () => {
    await expect(prototypeRewardClaim('someone-else')).rejects.toMatchObject({ code: 'refused' })
  })
})
