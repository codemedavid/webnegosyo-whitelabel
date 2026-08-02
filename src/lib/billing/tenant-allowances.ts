/**
 * What a tenant is entitled to, and how much of it they are using.
 *
 * Separate from `subscription-roster.ts` on purpose: that answers "who do I
 * chase for money today", this answers "what does this client's plan include".
 * They share a screen, not a question.
 *
 * The counting rules here are not this module's own opinion — they mirror the
 * enforcement exactly. Seats are counted PER BRANCH (`countStaffInBranch` in
 * `src/lib/staff-service.ts`) and the owner never occupies one. A column that
 * summed staff store-wide would report `6 / 3` for a three-branch business
 * sitting comfortably inside its plan, and the platform owner would go and
 * invoice them for it.
 */

import { resolveOutletLimit, resolveStaffLimit } from '@/lib/billing/subscription-status'

/** One staff account, reduced to what the seat count depends on. */
export interface AllowanceStaffMember {
  /** Branch the account is confined to. Null = a store-wide account. */
  outletId: string | null
  isOwner?: boolean | null
}

export interface AllowanceInput {
  tenantId: string
  maxOutlets?: number | null
  maxStaffPerBranch?: number | null
  /** The tenant's live branches. */
  outletIds: readonly string[]
  staff: readonly AllowanceStaffMember[]
}

export interface AllowanceRow {
  tenantId: string
  outletsUsed: number
  outletLimit: number
  /** Holding more branches than the plan allows — permitted, never blocked. */
  isOverOutlets: boolean
  /**
   * Seats filled in the fullest single pool.
   *
   * The fullest rather than the total, because the cap is per branch: this is
   * the number that decides whether the next hire is refused.
   */
  peakBranchStaff: number
  staffLimit: number
  isOverStaff: boolean
}

/**
 * Seats filled in the busiest pool.
 *
 * Each branch is a pool, and store-wide accounts form one more — a store-wide
 * manager must not consume a seat at Makati and at BGC at once.
 *
 * An account pointing at a branch the tenant no longer has is skipped. Those
 * are the orphans `store-people-card.tsx` lists for reassignment; they occupy
 * no live branch, so counting them would invent a pool out of a deleted one and
 * could flag a healthy store as over its allowance.
 */
function peakStaffInAnyBranch(input: AllowanceInput): number {
  const knownBranches = new Set(input.outletIds)
  const STORE_WIDE = '__store_wide__'
  const pools = new Map<string, number>()

  for (const member of input.staff) {
    if (member.isOwner) continue

    const outletId = member.outletId ?? null
    if (outletId !== null && !knownBranches.has(outletId)) continue

    const key = outletId ?? STORE_WIDE
    pools.set(key, (pools.get(key) ?? 0) + 1)
  }

  return pools.size === 0 ? 0 : Math.max(...pools.values())
}

function toRow(input: AllowanceInput): AllowanceRow {
  const outletsUsed = input.outletIds.length
  const outletLimit = resolveOutletLimit({ max_outlets: input.maxOutlets })
  const peakBranchStaff = peakStaffInAnyBranch(input)
  const staffLimit = resolveStaffLimit({ max_staff_per_branch: input.maxStaffPerBranch })

  return {
    tenantId: input.tenantId,
    outletsUsed,
    outletLimit,
    // Strictly over, so a store exactly at its plan limit is not painted as a
    // problem. Full is a healthy state; only above the line needs a second look.
    isOverOutlets: outletsUsed > outletLimit,
    peakBranchStaff,
    staffLimit,
    isOverStaff: peakBranchStaff > staffLimit,
  }
}

/** Usage against allowance, one row per tenant, input order preserved. */
export function buildAllowanceRows(inputs: readonly AllowanceInput[]): AllowanceRow[] {
  return inputs.map(toRow)
}

/**
 * The fewest branches worth selling.
 *
 * `resolveOutletLimit` accepts 0 — it guards against nonsense, not against a
 * number that is merely wrong — and the column carries no CHECK. So a mistyped
 * 0 stores cleanly and then refuses every branch the merchant tries to create,
 * while telling them their plan includes none. Nobody sells that plan, so the
 * one place a human types the number is where it gets caught.
 */
export const MIN_OUTLET_ALLOWANCE = 1

/** A branch allowance safe to store: at least one, whole, never nonsense. */
export function sanitizeOutletAllowance(value: number): number {
  return Math.max(MIN_OUTLET_ALLOWANCE, resolveOutletLimit({ max_outlets: value }))
}

/**
 * A seat allowance safe to store.
 *
 * No floor beyond zero, deliberately: an owner-only store that works its own
 * counter buys no seats, and rounding that up to one would hand out an account
 * nobody paid for.
 */
export function sanitizeStaffAllowance(value: number): number {
  return resolveStaffLimit({ max_staff_per_branch: value })
}
