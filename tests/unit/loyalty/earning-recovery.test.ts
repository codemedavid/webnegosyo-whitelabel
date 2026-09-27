import { recoverLoyaltyOrder, type EarningRecoveryDeps } from '@/lib/loyalty/earning-recovery'
import type { CustomerOrderFact } from '@/lib/customer-order-facts'
import type { LoyaltyProgram } from '@/lib/loyalty/types'

const fact = {
  tenantId: 'tenant', backend: 'convex', externalOrderId: 'order', customerId: 'customer',
  phoneE164: '+639171234567', source: 'online', status: 'delivered', paymentStatus: 'paid',
  branchId: null, netTotal: 100, orderedAt: '2026-09-20T00:00:00Z',
  completedAt: '2026-09-20T01:00:00Z', updatedAt: '2026-09-20T01:00:00Z', items: [],
} as unknown as CustomerOrderFact
const program = {
  id: 'program', tenantId: 'tenant', name: 'Coffee', scope: 'business', status: 'active', outletId: null,
  activatesAt: '2026-09-01T00:00:00Z', endsAt: null,
  version: { id: 'version', version: 1, createdAt: '2026-09-01T00:00:00Z', rules: { earnMode: 'stamp', threshold: 10, minSpend: null, pointsPerPeso: null, reward: { type: 'fixed', amount: 100 }, rewardExpiryDays: null, isExclusive: true } },
} as LoyaltyProgram
function dependencies() {
  const applied = new Set<string>()
  const deps: EarningRecoveryDeps = {
    refreshSource: jest.fn().mockResolvedValue(undefined),
    loadFact: jest.fn().mockResolvedValue(fact),
    loadFlags: jest.fn().mockResolvedValue({ isEnabled: true, isShadow: false }),
    loadPrograms: jest.fn().mockResolvedValue([program]),
    earning: {
      loadActivePrograms: jest.fn().mockResolvedValue([program]), loadOrderEarns: jest.fn().mockResolvedValue([]),
      applyLedgerEntry: jest.fn(async entry => {
        if (applied.has(entry.externalOrderId!)) return { applied: false, reason: 'duplicate' }
        applied.add(entry.externalOrderId!)
        return { applied: true, balance: 1 }
      }),
    },
  }
  return deps
}
const ref = { tenantId: 'tenant', backend: 'convex' as const, externalOrderId: 'order' }
it('recovers automatic credit once without a customer opening the receipt', async () => {
  const deps = dependencies()
  expect(await recoverLoyaltyOrder(ref, deps)).toBe('credited')
  expect(await recoverLoyaltyOrder(ref, deps)).toBe('already_credited')
  expect(deps.refreshSource).toHaveBeenCalledTimes(2)
})
it('does not award stamps while the source order is still pending', async () => {
  const deps = dependencies()
  jest.mocked(deps.loadFact).mockResolvedValue({ ...fact, status: 'ready', completedAt: null })
  expect(await recoverLoyaltyOrder(ref, deps)).toBe('pending')
  expect(deps.earning.applyLedgerEntry).not.toHaveBeenCalled()
})
it('fails visibly when source refresh fails instead of trusting a stale projection', async () => {
  const deps = dependencies()
  jest.mocked(deps.refreshSource).mockRejectedValue(new Error('unreachable'))
  await expect(recoverLoyaltyOrder(ref, deps)).rejects.toThrow('unreachable')
  expect(deps.earning.applyLedgerEntry).not.toHaveBeenCalled()
})
it('does not retrofit an old visit to a newly activated program', async () => {
  const deps = dependencies()
  jest.mocked(deps.loadPrograms).mockResolvedValue([{ ...program, activatesAt: '2026-09-21T00:00:00Z' }])
  expect(await recoverLoyaltyOrder(ref, deps)).toBe('ineligible')
  expect(deps.earning.applyLedgerEntry).not.toHaveBeenCalled()
})
it('uses the rules effective at the order completion rather than current rules', async () => {
  const deps = dependencies()
  await recoverLoyaltyOrder(ref, deps)
  expect(deps.loadPrograms).toHaveBeenCalledWith('tenant', fact.completedAt)
})
it('reverses recorded credit after cancellation even if there is no current program', async () => {
  const deps = dependencies()
  jest.mocked(deps.loadFact).mockResolvedValue({ ...fact, status: 'cancelled' })
  jest.mocked(deps.earning.loadOrderEarns).mockResolvedValue([{ programId: 'program', versionId: 'version', customerKey: 'phone:+639171234567', delta: 1, isShadow: false }])
  expect(await recoverLoyaltyOrder(ref, deps)).toBe('reversed')
  expect(deps.earning.applyLedgerEntry).toHaveBeenCalledWith(expect.objectContaining({ kind: 'reverse', delta: -1 }))
})
