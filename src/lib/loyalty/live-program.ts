/**
 * Which program a customer-facing surface should talk about right now.
 *
 * Pure and explicit about "now" so the caller owns the clock. The rules mirror
 * `qualifyOrderForProgram`: a program that has not been switched on for earning
 * (no activation instant), has ended, or belongs to another branch cannot be
 * promised to anyone. A business-wide program wins whenever one is live — it
 * earns at every branch, so it is the safest thing to show a customer whose
 * branch is not yet known.
 */

import type { LoyaltyProgram } from './types'

export interface LiveProgramContext {
  nowMs: number
  /** The branch this surface is speaking for, when it knows one. */
  outletId?: string | null
}

function isLive(program: LoyaltyProgram, { nowMs, outletId }: LiveProgramContext): boolean {
  if (program.status !== 'active') return false

  const activatesMs = program.activatesAt ? Date.parse(program.activatesAt) : NaN
  if (!Number.isFinite(activatesMs) || activatesMs > nowMs) return false

  const endsMs = program.endsAt ? Date.parse(program.endsAt) : null
  if (endsMs !== null && Number.isFinite(endsMs) && endsMs < nowMs) return false

  if (program.scope === 'branch') return Boolean(outletId) && program.outletId === outletId
  return true
}

/** The one live program to describe, or null when the store has nothing to promise. */
export function selectLiveProgram(
  programs: LoyaltyProgram[],
  context: LiveProgramContext,
): LoyaltyProgram | null {
  const live = programs.filter((program) => isLive(program, context))
  return live.find((program) => program.scope === 'business') ?? live[0] ?? null
}
