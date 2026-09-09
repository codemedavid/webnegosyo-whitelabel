/**
 * Shadow reconciliation: what the engine says a tenant's customers SHOULD have
 * earned, against what the shadow ledger recorded.
 *
 * Shadow mode exists so a rules bug is caught here, on paper, before a single
 * customer sees a reward. Pure: the script feeds it facts and ledger rows.
 */

import type { CustomerOrderFact } from '@/lib/customer-order-facts'
import { customerKeyForFact } from './apply'
import { planEarning } from './earn'
import type { LoyaltyProgram } from './types'

export interface ShadowLedgerRow {
  programId: string
  customerKey: string
  kind: string
  delta: number
  orderBackend: string | null
  externalOrderId: string | null
}

export interface ShadowExpectation {
  programId: string
  customerKey: string
  orderBackend: string
  externalOrderId: string
  delta: number
}

export interface ShadowDiscrepancy extends ShadowExpectation {
  recordedDelta: number | null
}

export interface ShadowReconciliation {
  expectedEntries: number
  recordedEntries: number
  /** Expected but never recorded, or recorded with a different delta. */
  missing: ShadowDiscrepancy[]
  /** Recorded earn rows the engine would not have produced today. */
  unexpected: ShadowLedgerRow[]
}

function keyOf(row: { programId: string; orderBackend: string | null; externalOrderId: string | null }): string {
  return `${row.programId}|${row.orderBackend}|${row.externalOrderId}`
}

export function reconcileShadowEarning(
  facts: readonly CustomerOrderFact[],
  programs: readonly LoyaltyProgram[],
  ledger: readonly ShadowLedgerRow[],
): ShadowReconciliation {
  const expected: ShadowExpectation[] = []
  for (const fact of facts) {
    const customerKey = customerKeyForFact(fact)
    if (!customerKey) continue
    for (const plan of planEarning(programs, fact)) {
      expected.push({
        programId: plan.programId,
        customerKey,
        orderBackend: fact.backend,
        externalOrderId: fact.externalOrderId,
        delta: plan.delta,
      })
    }
  }

  const recordedEarns = ledger.filter((row) => row.kind === 'earn' && row.externalOrderId)
  const recordedByKey = new Map(recordedEarns.map((row) => [keyOf(row), row]))
  const expectedKeys = new Set(expected.map(keyOf))

  const missing: ShadowDiscrepancy[] = []
  for (const entry of expected) {
    const recorded = recordedByKey.get(keyOf(entry))
    if (!recorded || recorded.delta !== entry.delta) {
      missing.push({ ...entry, recordedDelta: recorded?.delta ?? null })
    }
  }

  const unexpected = recordedEarns.filter((row) => !expectedKeys.has(keyOf(row)))

  return {
    expectedEntries: expected.length,
    recordedEntries: recordedEarns.length,
    missing,
    unexpected,
  }
}
