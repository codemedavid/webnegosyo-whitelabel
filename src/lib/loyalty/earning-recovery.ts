import { isQualifiedOrderFact, REVERSED_STATUSES, type CustomerOrderFact } from '@/lib/customer-order-facts'
import { earnLoyaltyForFact, type LoyaltyEarningDeps } from './apply'
import type { LoyaltyProgram } from './types'
import type { LoyaltyOrderRef, LoyaltyTenantFlags } from './store'

export interface EarningRecoveryDeps {
  /** Returns a conservative rule cutoff when recovering an unknown completion time. */
  refreshSource: (ref: LoyaltyOrderRef) => Promise<string | null | void>
  loadFact: (ref: LoyaltyOrderRef) => Promise<CustomerOrderFact | null>
  loadFlags: (tenantId: string) => Promise<LoyaltyTenantFlags>
  loadPrograms: (tenantId: string, at: string) => Promise<LoyaltyProgram[]>
  earning: LoyaltyEarningDeps
}
export type EarningRecoveryResult = 'credited' | 'already_credited' | 'reversed' | 'pending' | 'ineligible' | 'disabled' | 'missing_identity'

export async function recoverLoyaltyOrder(ref: LoyaltyOrderRef, deps: EarningRecoveryDeps): Promise<EarningRecoveryResult> {
  const flags = await deps.loadFlags(ref.tenantId)
  if (!flags.isEnabled || flags.isShadow) return 'disabled'
  const ruleCutoff = await deps.refreshSource(ref)
  const fact = await deps.loadFact(ref)
  if (!fact) throw new Error('Order projection is missing')
  const reversing = REVERSED_STATUSES.has(fact.status.trim().toLowerCase())
  if (!reversing && !fact.phoneE164) return 'missing_identity'
  if (!reversing && (!isQualifiedOrderFact(fact) || !fact.completedAt)) return 'pending'
  const at = ruleCutoff || fact.completedAt || fact.orderedAt
  const programs = reversing ? [] : await deps.loadPrograms(ref.tenantId, at)
  const outcome = await earnLoyaltyForFact(fact, { tenantId: ref.tenantId, isShadow: false }, {
    ...deps.earning,
    loadActivePrograms: async () => programs.filter(program => !ruleCutoff ||
      (program.activatesAt !== null && Date.parse(program.activatesAt) <= Date.parse(ruleCutoff))),
  })
  if (outcome.action === 'reversed') return 'reversed'
  if (outcome.action !== 'earned') return 'ineligible'
  return outcome.programs.some(program => program.applied) ? 'credited' : 'already_credited'
}
