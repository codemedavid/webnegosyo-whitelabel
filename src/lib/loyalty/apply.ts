/**
 * Earning orchestration: given ONE order fact, decide what every program does
 * with it and hand each decision to the database.
 *
 * Ports, not clients, so the rules are testable without Postgres. The real
 * implementation is `store.ts`; every write goes through
 * `apply_loyalty_earning`, whose unique index makes a replay a no-op — so this
 * module never reads before it writes, and never needs to.
 *
 * Reversal: an order that comes back cancelled/refunded reverses exactly what
 * it earned, program by program, by looking up its own earn row. An order that
 * later leaves the cancelled state does NOT earn again: the (program, order,
 * earn) row already exists, and the constraint says once. That is a known,
 * deliberate limit — a cancel/un-cancel bounce is rare, and paying a stamp
 * twice for one visit is worse than paying it once and reversing it.
 */

import type { CustomerOrderFact } from '@/lib/customer-order-facts'
import { planEarning } from './earn'
import type { LoyaltyEarnPlan, LoyaltyProgram } from './types'

const REVERSED = new Set(['cancelled', 'canceled', 'refunded', 'voided'])

export type LoyaltyLedgerKind = 'earn' | 'reverse' | 'redeem' | 'correction'

export interface LoyaltyLedgerEntryInput {
  tenantId: string
  programId: string
  versionId: string | null
  customerKey: string
  customerId: string | null
  kind: LoyaltyLedgerKind
  delta: number
  orderBackend: CustomerOrderFact['backend'] | null
  externalOrderId: string | null
  threshold: number | null
  rewardTerms: LoyaltyEarnPlan['rewardTerms'] | null
  rewardExpiresAt: string | null
  isShadow: boolean
  actor?: string | null
  note?: string | null
}

export interface LoyaltyApplyResult {
  applied: boolean
  /** 'duplicate' when the unique index refused a replay. */
  reason?: string
  entitlementsIssued?: number
  balance?: number
}

export interface LoyaltyEarningDeps {
  loadActivePrograms: (tenantId: string) => Promise<LoyaltyProgram[]>
  /** Original earns, including discontinued programs and historical identities. */
  loadOrderEarns: (
    tenantId: string,
    orderBackend: CustomerOrderFact['backend'],
    externalOrderId: string,
  ) => Promise<Array<Pick<LoyaltyLedgerEntryInput, 'programId' | 'versionId' | 'customerKey' | 'delta' | 'isShadow'>>>
  applyLedgerEntry: (entry: LoyaltyLedgerEntryInput) => Promise<LoyaltyApplyResult>
}

export interface LoyaltyEarningContext {
  tenantId: string
  isShadow: boolean
}

export interface LoyaltyProgramOutcome {
  programId: string
  kind: 'earn' | 'reverse'
  delta: number
  applied: boolean
  isDuplicate: boolean
  entitlementsIssued: number
}

export interface LoyaltyEarningOutcome {
  action: 'earned' | 'reversed' | 'skipped'
  reason?: 'anonymous' | 'no_programs' | 'not_qualified' | 'nothing_to_reverse'
  programs: LoyaltyProgramOutcome[]
}

/** The identity the ledger keys on. Same shape as voucher_redemptions.customer_key. */
export function customerKeyForFact(fact: CustomerOrderFact): string | null {
  return fact.phoneE164 ? `phone:${fact.phoneE164}` : null
}

function toOutcome(
  plan: { programId: string; delta: number },
  kind: 'earn' | 'reverse',
  result: LoyaltyApplyResult,
): LoyaltyProgramOutcome {
  return {
    programId: plan.programId,
    kind,
    delta: plan.delta,
    applied: result.applied,
    isDuplicate: !result.applied && result.reason === 'duplicate',
    entitlementsIssued: result.entitlementsIssued ?? 0,
  }
}

async function reverse(
  fact: CustomerOrderFact,
  ctx: LoyaltyEarningContext,
  deps: LoyaltyEarningDeps,
): Promise<LoyaltyEarningOutcome> {
  const outcomes: LoyaltyProgramOutcome[] = []
  const earns = await deps.loadOrderEarns(ctx.tenantId, fact.backend, fact.externalOrderId)
  for (const earn of earns) {
    if (earn.delta === 0) continue

    const result = await deps.applyLedgerEntry({
      tenantId: ctx.tenantId,
      programId: earn.programId,
      versionId: earn.versionId,
      customerKey: earn.customerKey,
      customerId: null,
      kind: 'reverse',
      delta: -earn.delta,
      orderBackend: fact.backend,
      externalOrderId: fact.externalOrderId,
      threshold: null,
      rewardTerms: null,
      rewardExpiresAt: null,
      isShadow: earn.isShadow,
    })
    outcomes.push(toOutcome({ programId: earn.programId, delta: -earn.delta }, 'reverse', result))
  }
  if (outcomes.length === 0) return { action: 'skipped', reason: 'nothing_to_reverse', programs: [] }
  return { action: 'reversed', programs: outcomes }
}

export async function earnLoyaltyForFact(
  fact: CustomerOrderFact,
  ctx: LoyaltyEarningContext,
  deps: LoyaltyEarningDeps,
): Promise<LoyaltyEarningOutcome> {
  if (REVERSED.has(fact.status.trim().toLowerCase())) {
    return reverse(fact, ctx, deps)
  }
  const customerKey = customerKeyForFact(fact)
  if (!customerKey) return { action: 'skipped', reason: 'anonymous', programs: [] }

  const programs = await deps.loadActivePrograms(ctx.tenantId)
  if (programs.length === 0) return { action: 'skipped', reason: 'no_programs', programs: [] }

  const plans = planEarning(programs, fact)
  if (plans.length === 0) return { action: 'skipped', reason: 'not_qualified', programs: [] }

  const outcomes: LoyaltyProgramOutcome[] = []
  for (const plan of plans) {
    const result = await deps.applyLedgerEntry({
      tenantId: ctx.tenantId,
      programId: plan.programId,
      versionId: plan.versionId,
      customerKey,
      customerId: fact.customerId,
      kind: 'earn',
      delta: plan.delta,
      orderBackend: fact.backend,
      externalOrderId: fact.externalOrderId,
      threshold: plan.threshold,
      rewardTerms: plan.rewardTerms,
      rewardExpiresAt: plan.rewardExpiresAt,
      isShadow: ctx.isShadow,
    })
    outcomes.push(toOutcome(plan, 'earn', result))
  }
  return { action: 'earned', programs: outcomes }
}
