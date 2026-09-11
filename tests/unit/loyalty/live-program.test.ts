import { selectLiveProgram } from '@/lib/loyalty/live-program'
import type { LoyaltyProgram } from '@/lib/loyalty/types'

const RULES = {
  earnMode: 'stamp' as const,
  threshold: 8,
  pointsPerPeso: null,
  minSpend: null,
  reward: { type: 'fixed' as const, amount: 100 },
  rewardExpiryDays: null,
  isExclusive: true,
}

function program(overrides: Partial<LoyaltyProgram> = {}): LoyaltyProgram {
  return {
    id: 'program-1',
    tenantId: 'tenant-1',
    name: 'Coffee Club',
    scope: 'business',
    outletId: null,
    status: 'active',
    activatesAt: '2026-01-01T00:00:00Z',
    endsAt: null,
    version: { id: 'version-1', version: 1, rules: RULES, createdAt: '2026-01-01T00:00:00Z' },
    ...overrides,
  }
}

const NOW = Date.parse('2026-06-01T00:00:00Z')

it('picks a business-wide program that is live right now', () => {
  expect(selectLiveProgram([program()], { nowMs: NOW })?.id).toBe('program-1')
})

it('refuses a program that was never scheduled to activate', () => {
  expect(selectLiveProgram([program({ activatesAt: null })], { nowMs: NOW })).toBeNull()
})

it('refuses a program whose activation is still in the future', () => {
  expect(selectLiveProgram([program({ activatesAt: '2026-12-01T00:00:00Z' })], { nowMs: NOW })).toBeNull()
})

it('refuses a program that has already ended', () => {
  expect(selectLiveProgram([program({ endsAt: '2026-02-01T00:00:00Z' })], { nowMs: NOW })).toBeNull()
})

it('refuses a program that is not active', () => {
  expect(selectLiveProgram([program({ status: 'paused' })], { nowMs: NOW })).toBeNull()
})

it('offers a branch program only at its own branch', () => {
  const branch = program({ id: 'branch-1', scope: 'branch', outletId: 'outlet-a' })
  expect(selectLiveProgram([branch], { nowMs: NOW, outletId: 'outlet-a' })?.id).toBe('branch-1')
  expect(selectLiveProgram([branch], { nowMs: NOW, outletId: 'outlet-b' })).toBeNull()
  expect(selectLiveProgram([branch], { nowMs: NOW })).toBeNull()
})

it('prefers the business-wide program when a branch program also earns', () => {
  const branch = program({ id: 'branch-1', scope: 'branch', outletId: 'outlet-a' })
  const business = program({ id: 'business-1' })
  expect(selectLiveProgram([branch, business], { nowMs: NOW, outletId: 'outlet-a' })?.id).toBe('business-1')
})
