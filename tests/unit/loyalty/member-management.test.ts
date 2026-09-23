/** @jest-environment node */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  adjustMemberBalance,
  describeResolutionRefusal,
  parseBalanceAdjustment,
  parseRewardResolution,
  resolveMemberReward,
} from '@/lib/loyalty/member-management'

const TENANT = 'tenant-1'
const NOW = Date.parse('2026-09-22T00:00:00Z')

const VALID_ADJUSTMENT = {
  programId: 'prog-1',
  customerKey: 'phone:+639171234567',
  delta: 2,
  note: 'Cashier missed two stamps',
  requestId: 'adj-01HQ9Z8X7Y6W5V4U',
}

describe('parseBalanceAdjustment', () => {
  it('accepts an auditable, replay-safe adjustment', () => {
    expect(parseBalanceAdjustment(VALID_ADJUSTMENT)).toEqual({ ok: true, value: VALID_ADJUSTMENT })
  })

  it.each([
    ['no reason', { ...VALID_ADJUSTMENT, note: '   ' }],
    ['a zero change', { ...VALID_ADJUSTMENT, delta: 0 }],
    ['a raw phone instead of an identity key', { ...VALID_ADJUSTMENT, customerKey: '09171234567' }],
    ['an absurd change', { ...VALID_ADJUSTMENT, delta: 1_000_000 }],
    ['no program', { ...VALID_ADJUSTMENT, programId: '' }],
    ['no request id', { ...VALID_ADJUSTMENT, requestId: '' }],
    ['a request id that could collide', { ...VALID_ADJUSTMENT, requestId: 'short' }],
  ])('refuses %s', (_label, raw) => {
    expect(parseBalanceAdjustment(raw).ok).toBe(false)
  })

  it('explains itself in language a merchant can act on', () => {
    const parsed = parseBalanceAdjustment({ ...VALID_ADJUSTMENT, note: '' })

    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.error).toBe('Say why you are changing this balance.')
  })
})

describe('parseRewardResolution', () => {
  it('accepts both settlements', () => {
    for (const action of ['consume', 'void'] as const) {
      expect(
        parseRewardResolution({ entitlementId: 'ent-1', action, note: 'Handed over at the counter' })
          .ok
      ).toBe(true)
    }
  })

  it.each([
    ['an unknown action', { entitlementId: 'ent-1', action: 'delete', note: 'x' }],
    ['no note', { entitlementId: 'ent-1', action: 'void', note: '' }],
    ['no reward', { entitlementId: '', action: 'void', note: 'x' }],
  ])('refuses %s', (_label, raw) => {
    expect(parseRewardResolution(raw).ok).toBe(false)
  })
})

/** A client whose rpc and program reads can be inspected. */
function database(
  rpcResult: unknown,
  program: Record<string, unknown> | null = {
    id: 'prog-1',
    name: 'Loyalty Card',
    current_version_id: 'ver-1',
  },
  version: Record<string, unknown> | null = {
    id: 'ver-1',
    version: 3,
    rules: {
      earnMode: 'stamp',
      threshold: 10,
      pointsPerPeso: null,
      minSpend: null,
      reward: { type: 'fixed', amount: 200 },
      rewardExpiryDays: 30,
      isExclusive: true,
    },
  }
) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
  const client = {
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: table === 'loyalty_programs' ? program : version,
          error: null,
        }),
      }
      return query
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args })
      return { data: rpcResult, error: null }
    },
  } as unknown as SupabaseClient
  return { client, calls }
}

describe('adjustMemberBalance', () => {
  it('sends the threshold and frozen terms so a hand-completed card mints its reward', async () => {
    // Arrange
    const { client, calls } = database({ applied: true, balance: 0, entitlementsIssued: 1 })

    // Act
    const result = await adjustMemberBalance(client, TENANT, VALID_ADJUSTMENT, 'actor-1', NOW)

    // Assert
    expect(result).toEqual({ applied: true, reason: null, balance: 0, rewardsIssued: 1 })
    expect(calls[0].args).toMatchObject({
      p_kind: 'correction',
      p_threshold: 10,
      p_request_id: VALID_ADJUSTMENT.requestId,
      p_note: VALID_ADJUSTMENT.note,
      p_actor: 'actor-1',
      p_reward_terms: {
        programId: 'prog-1',
        programName: 'Loyalty Card',
        versionNumber: 3,
        reward: { type: 'fixed', amount: 200 },
      },
    })
  })

  it('dates the reward expiry from the adjustment, not from some past order', async () => {
    const { client, calls } = database({ applied: true })

    await adjustMemberBalance(client, TENANT, VALID_ADJUSTMENT, null, NOW)

    expect(calls[0].args.p_reward_expires_at).toBe(
      new Date(NOW + 30 * 86_400_000).toISOString()
    )
  })

  it('reports a replay instead of applying it twice', async () => {
    const { client } = database({ applied: false, reason: 'duplicate' })

    const result = await adjustMemberBalance(client, TENANT, VALID_ADJUSTMENT, null, NOW)

    expect(result).toMatchObject({ applied: false, reason: 'duplicate' })
  })

  it('still applies the stamps when a programme has no readable rules, minting nothing', async () => {
    const { client, calls } = database({ applied: true, balance: 2 }, { id: 'prog-1', name: 'Old Card', current_version_id: null })

    const result = await adjustMemberBalance(client, TENANT, VALID_ADJUSTMENT, null, NOW)

    expect(calls[0].args.p_threshold).toBeNull()
    expect(calls[0].args.p_reward_terms).toBeNull()
    expect(result).toMatchObject({ applied: true, rewardsIssued: 0 })
  })

  it('refuses a program that belongs to another store', async () => {
    const { client, calls } = database({ applied: true }, null)

    const result = await adjustMemberBalance(client, TENANT, VALID_ADJUSTMENT, null, NOW)

    expect(result).toEqual({ error: 'That program is not part of this store.' })
    expect(calls).toHaveLength(0)
  })
})

describe('resolveMemberReward', () => {
  it('passes the settlement through with its reason', async () => {
    const { client, calls } = database({ applied: true, status: 'consumed' })

    const result = await resolveMemberReward(
      client,
      TENANT,
      { entitlementId: 'ent-1', action: 'consume', note: 'Handed over' },
      'actor-1'
    )

    expect(result).toEqual({ applied: true, status: 'consumed', reason: null })
    expect(calls[0]).toMatchObject({
      fn: 'resolve_loyalty_entitlement',
      args: { p_action: 'consume', p_note: 'Handed over', p_actor: 'actor-1' },
    })
  })

  it('reports a reward a register is holding rather than settling it', async () => {
    const { client } = database({ applied: false, reason: 'reserved' })

    const result = await resolveMemberReward(
      client,
      TENANT,
      { entitlementId: 'ent-1', action: 'void', note: 'Issued by mistake' },
      null
    )

    expect(result.applied).toBe(false)
    expect(describeResolutionRefusal(result.reason)).toContain('register is using this reward')
  })
})

describe('describeResolutionRefusal', () => {
  it('has a merchant-facing sentence for every refusal the database can return', () => {
    for (const reason of ['not_found', 'reserved', 'already_consumed', 'already_voided', 'not_settleable', null]) {
      expect(describeResolutionRefusal(reason).length).toBeGreaterThan(10)
    }
  })
})
