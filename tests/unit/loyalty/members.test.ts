/** @jest-environment node */
import {
  buildLoyaltyMember,
  classifyMemberStatus,
  contactFromCustomerKey,
  describeMemberStatus,
  rankLoyaltyMembers,
  summarizeLoyaltyMembers,
  summarizeProgramProgress,
  type LoyaltyMemberProgramInput,
} from '@/lib/loyalty/members'

const NOW = Date.parse('2026-09-22T00:00:00Z')

function daysAgo(days: number): string {
  return new Date(NOW - days * 86_400_000).toISOString()
}

function program(
  overrides: Partial<LoyaltyMemberProgramInput> = {}
): LoyaltyMemberProgramInput {
  return {
    programId: 'prog-1',
    programName: 'Loyalty Card',
    programStatus: 'active',
    earnMode: 'stamp',
    threshold: 10,
    rewardLabel: '₱200 off',
    balance: 3,
    lifetimeEarned: 3,
    rewardsIssued: 0,
    rewardsAvailable: 0,
    lastActivityAt: daysAgo(2),
    ...overrides,
  }
}

describe('summarizeProgramProgress', () => {
  it('reports how many more visits the next reward needs', () => {
    // Arrange
    const input = program({ balance: 7, threshold: 10 })

    // Act
    const progress = summarizeProgramProgress(input, NOW)

    // Assert
    expect(progress.remaining).toBe(3)
    expect(progress.percent).toBe(70)
  })

  it('rounds a part-earned point balance up to a whole remaining amount', () => {
    // A points program can sit at 96.4 of 100. "3.6 more" is not something a
    // cashier can say, and rounding DOWN would promise a reward one point early.
    const progress = summarizeProgramProgress(
      program({ earnMode: 'points', balance: 96.4, threshold: 100 }),
      NOW
    )

    expect(progress.remaining).toBe(4)
  })

  it('never reports negative remaining when a balance sits above the threshold', () => {
    const progress = summarizeProgramProgress(program({ balance: 12, threshold: 10 }), NOW)

    expect(progress.remaining).toBe(0)
    expect(progress.percent).toBe(100)
  })

  it('reports remaining as unknown when the program has no usable threshold', () => {
    // An ended program still holds stamps but its rules may be unreadable.
    // Inventing a threshold would print a progress bar out of nothing.
    const progress = summarizeProgramProgress(program({ threshold: 0 }), NOW)

    expect(progress.remaining).toBeNull()
    expect(progress.percent).toBeNull()
  })
})

describe('classifyMemberStatus', () => {
  it('puts a customer holding an unused reward at the front', () => {
    const status = classifyMemberStatus(
      summarizeProgramProgress(program({ balance: 1, rewardsAvailable: 1 }), NOW)
    )

    expect(status).toBe('reward_ready')
  })

  it('calls a customer within a quarter of the threshold almost there', () => {
    // Threshold 10 → the last 3 visits are the nudge-worthy band.
    expect(
      classifyMemberStatus(summarizeProgramProgress(program({ balance: 8 }), NOW))
    ).toBe('almost_there')
    expect(
      classifyMemberStatus(summarizeProgramProgress(program({ balance: 6 }), NOW))
    ).toBe('earning')
  })

  it('treats one stamp away as almost there even on a short card', () => {
    // Threshold 3 → a quarter rounds to 1, so the band is never empty.
    expect(
      classifyMemberStatus(
        summarizeProgramProgress(program({ threshold: 3, balance: 2, lifetimeEarned: 2 }), NOW)
      )
    ).toBe('almost_there')
  })

  it('calls a first-visit customer new rather than merely earning', () => {
    expect(
      classifyMemberStatus(
        summarizeProgramProgress(program({ balance: 1, lifetimeEarned: 1 }), NOW)
      )
    ).toBe('new')
  })

  it('never lets dormancy hide a claimable reward or a near miss', () => {
    // Dormancy is a separate flag precisely so it cannot bury the two states a
    // merchant would act on.
    const stale = summarizeProgramProgress(
      program({ balance: 9, lastActivityAt: daysAgo(200) }),
      NOW
    )

    expect(stale.isDormant).toBe(true)
    expect(classifyMemberStatus(stale)).toBe('almost_there')
  })

  it('marks a mid-card customer who stopped coming as dormant', () => {
    const stale = summarizeProgramProgress(
      program({ balance: 4, lifetimeEarned: 4, lastActivityAt: daysAgo(90) }),
      NOW
    )

    expect(classifyMemberStatus(stale)).toBe('dormant')
  })

  it('reads an unknown last activity as active, not dormant', () => {
    const progress = summarizeProgramProgress(program({ lastActivityAt: null }), NOW)

    expect(progress.isDormant).toBe(false)
  })
})

describe('buildLoyaltyMember', () => {
  it('leads with the program the customer is closest to claiming', () => {
    // Arrange: two cards, one nearly full.
    const member = buildLoyaltyMember(
      {
        customerKey: 'phone:+639171234567',
        customerId: 'cust-1',
        name: 'Ana Cruz',
        programs: [
          program({ programId: 'far', programName: 'Coffee Card', balance: 2 }),
          program({ programId: 'near', programName: 'Meal Card', balance: 9 }),
        ],
      },
      NOW
    )

    // Assert
    expect(member.headline?.programId).toBe('near')
    expect(member.status).toBe('almost_there')
    expect(member.phone).toBe('+639171234567')
  })

  it('sums rewards held across every program', () => {
    const member = buildLoyaltyMember(
      {
        customerKey: 'phone:+639171234567',
        customerId: null,
        name: null,
        programs: [
          program({ programId: 'a', rewardsAvailable: 1 }),
          program({ programId: 'b', rewardsAvailable: 2 }),
        ],
      },
      NOW
    )

    expect(member.rewardsAvailable).toBe(3)
    expect(member.status).toBe('reward_ready')
  })

  it('reports the most recent activity across programs', () => {
    const member = buildLoyaltyMember(
      {
        customerKey: 'phone:+639171234567',
        customerId: null,
        name: null,
        programs: [
          program({ programId: 'a', lastActivityAt: daysAgo(30) }),
          program({ programId: 'b', lastActivityAt: daysAgo(3) }),
        ],
      },
      NOW
    )

    expect(member.lastActivityAt).toBe(daysAgo(3))
    expect(member.isDormant).toBe(false)
  })

  it('survives a member with no program rows at all', () => {
    const member = buildLoyaltyMember(
      { customerKey: 'phone:+639171234567', customerId: null, name: null, programs: [] },
      NOW
    )

    expect(member.headline).toBeNull()
    expect(member.status).toBe('new')
    expect(member.rewardsAvailable).toBe(0)
  })
})

describe('rankLoyaltyMembers', () => {
  function member(key: string, overrides: Partial<LoyaltyMemberProgramInput>) {
    return buildLoyaltyMember(
      { customerKey: `phone:+6391712345${key}`, customerId: null, name: null, programs: [program(overrides)] },
      NOW
    )
  }

  it('orders claimable rewards first, then by who is closest', () => {
    // Arrange
    const members = [
      member('01', { balance: 2 }),
      member('02', { balance: 9 }),
      member('03', { balance: 0, rewardsAvailable: 1 }),
      member('04', { balance: 6 }),
    ]

    // Act
    const ranked = rankLoyaltyMembers(members)

    // Assert
    expect(ranked.map((m) => m.customerKey.slice(-2))).toEqual(['03', '02', '04', '01'])
  })

  it('sinks members whose progress cannot be computed below those that can', () => {
    const ranked = rankLoyaltyMembers([
      member('01', { threshold: 0 }),
      member('02', { balance: 1 }),
    ])

    expect(ranked[0].customerKey.slice(-2)).toBe('02')
  })

  it('does not mutate the array it is given', () => {
    const members = [member('01', { balance: 1 }), member('02', { balance: 9 })]
    const before = members.map((m) => m.customerKey)

    rankLoyaltyMembers(members)

    expect(members.map((m) => m.customerKey)).toEqual(before)
  })
})

describe('summarizeLoyaltyMembers', () => {
  it('counts the states a merchant acts on', () => {
    const members = [
      buildLoyaltyMember({ customerKey: 'phone:+639171234501', customerId: null, name: null, programs: [program({ rewardsAvailable: 1 })] }, NOW),
      buildLoyaltyMember({ customerKey: 'phone:+639171234502', customerId: null, name: null, programs: [program({ balance: 9 })] }, NOW),
      buildLoyaltyMember({ customerKey: 'phone:+639171234503', customerId: null, name: null, programs: [program({ balance: 5, lifetimeEarned: 5, lastActivityAt: daysAgo(120) })] }, NOW),
    ]

    const totals = summarizeLoyaltyMembers(members)

    expect(totals).toEqual({
      total: 3,
      rewardReady: 1,
      almostThere: 1,
      earning: 0,
      new: 0,
      dormant: 1,
      rewardsAvailable: 1,
    })
  })
})

describe('contactFromCustomerKey', () => {
  it('reads a phone key', () => {
    expect(contactFromCustomerKey('phone:+639171234567')).toEqual({
      phone: '+639171234567',
      email: null,
    })
  })

  it('reads an email key', () => {
    expect(contactFromCustomerKey('email:ana@example.com')).toEqual({
      phone: null,
      email: 'ana@example.com',
    })
  })

  it('reads anything else as no contact at all rather than guessing', () => {
    expect(contactFromCustomerKey('anonymous')).toEqual({ phone: null, email: null })
  })
})

describe('describeMemberStatus', () => {
  it('gives every status a merchant-facing label', () => {
    const statuses = ['reward_ready', 'almost_there', 'earning', 'new', 'dormant'] as const

    for (const status of statuses) {
      expect(describeMemberStatus(status).label.length).toBeGreaterThan(0)
    }
  })
})
