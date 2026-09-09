import {
  canTransitionProgram,
  parseBalanceCorrection,
  parseLoyaltyProgramInput,
  programStatusPatch,
} from '@/lib/loyalty/manage'

const RULES = { earnMode: 'stamp', threshold: 10, reward: { type: 'fixed', amount: 50 } }
const NOW = new Date('2026-09-05T08:00:00.000Z')

describe('parseLoyaltyProgramInput', () => {
  it('accepts a business-wide stamp program', () => {
    const parsed = parseLoyaltyProgramInput({ name: ' Coffee card ', rules: RULES })
    expect(parsed.ok && parsed.value).toMatchObject({ name: 'Coffee card', scope: 'business', outletId: null, earnMode: 'stamp' })
  })

  it('requires a branch for a branch-scoped program', () => {
    expect(parseLoyaltyProgramInput({ name: 'North card', scope: 'branch', rules: RULES }).ok).toBe(false)
    const parsed = parseLoyaltyProgramInput({ name: 'North card', scope: 'branch', outletId: 'north', rules: RULES })
    expect(parsed.ok && parsed.value.outletId).toBe('north')
  })

  it('drops a stray outlet on a business-wide program', () => {
    const parsed = parseLoyaltyProgramInput({ name: 'Card', scope: 'business', outletId: 'north', rules: RULES })
    expect(parsed.ok && parsed.value.outletId).toBeNull()
  })

  it.each([
    ['a blank name', { name: ' ', rules: RULES }],
    ['broken rules', { name: 'Card', rules: { ...RULES, threshold: 0 } }],
  ])('refuses %s', (_label, raw) => {
    expect(parseLoyaltyProgramInput(raw).ok).toBe(false)
  })
})

describe('program status transitions', () => {
  it.each([
    ['draft', 'active', true],
    ['active', 'paused', true],
    ['paused', 'active', true],
    ['active', 'ended', true],
    ['ended', 'active', false],
    ['draft', 'paused', false],
  ] as const)('%s → %s is %s', (from, to, allowed) => {
    expect(canTransitionProgram(from, to)).toBe(allowed)
  })

  it('stamps the activation instant on first activation only', () => {
    expect(programStatusPatch({ status: 'draft', activatesAt: null }, 'active', NOW)).toEqual({
      status: 'active',
      activates_at: NOW.toISOString(),
    })
    expect(programStatusPatch({ status: 'paused', activatesAt: '2026-09-01T00:00:00.000Z' }, 'active', NOW)).toEqual({
      status: 'active',
    })
  })

  it('stamps the end instant when ending, and refuses an illegal move', () => {
    expect(programStatusPatch({ status: 'active', activatesAt: '2026-09-01T00:00:00.000Z' }, 'ended', NOW)).toEqual({
      status: 'ended',
      ends_at: NOW.toISOString(),
    })
    expect(programStatusPatch({ status: 'ended', activatesAt: null }, 'active', NOW)).toBeNull()
  })
})

describe('parseBalanceCorrection', () => {
  const VALID = { programId: 'p', customerKey: 'phone:+639171234567', delta: -2, note: 'Cashier stamped twice' }

  it('accepts an auditable correction', () => {
    expect(parseBalanceCorrection(VALID)).toEqual({ ok: true, value: VALID })
  })

  it.each([
    ['no note', { ...VALID, note: '' }],
    ['a zero delta', { ...VALID, delta: 0 }],
    ['a raw phone instead of an identity key', { ...VALID, customerKey: '09171234567' }],
    ['an absurd delta', { ...VALID, delta: 1_000_000 }],
  ])('refuses %s', (_label, raw) => {
    expect(parseBalanceCorrection(raw).ok).toBe(false)
  })
})
