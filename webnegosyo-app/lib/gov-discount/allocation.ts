/**
 * Which centavos of the bill belong to which claimant.
 *
 * Two ways a share is decided (see `GovAllocation`):
 *
 * - **Their own items.** A claimant owns whole units of a line. Each line's
 *   subtotal is first split into per-unit centavos (largest remainder), and a
 *   claimant takes the next unclaimed units — so if every unit of a line is
 *   claimed, the claims add up to the line exactly, never a centavo more.
 *
 * - **Shared table.** Whatever eligible food is left after the item claims is
 *   divided by the number of diners (DSWD/NCMB Res. 3-2009: "the total bill
 *   divided by the number of persons"), and each shared claimant takes one
 *   diner's part. The others at the table pay for the remaining parts.
 *
 * Ineligible lines are never shared and can never be claimed.
 */

import { allocateCents, toCents } from './money'
import type { GovClaimantInput, GovLineInput } from './types'

/** A claimant's share, line by line, in centavos. */
export interface ClaimantShare {
  byLine: Readonly<Record<string, number>>
  gross: number
}

function perUnitCents(line: GovLineInput): number[] {
  const units = Math.max(0, Math.floor(line.quantity))
  if (units === 0) return []
  return allocateCents(toCents(line.amount), new Array<number>(units).fill(1))
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function withLine(
  share: Record<string, number>,
  key: string,
  cents: number,
): Record<string, number> {
  if (cents <= 0) return share
  return { ...share, [key]: (share[key] ?? 0) + cents }
}

/**
 * Every claimant's share, keyed by claimant id. Assumes the input already
 * passed validation (units within range, diners set when needed).
 */
export function allocateShares(
  lines: readonly GovLineInput[],
  claimants: readonly GovClaimantInput[],
  diners: number,
): Map<string, ClaimantShare> {
  const unitsByLine = new Map(lines.map((line) => [line.key, perUnitCents(line)]))
  const nextUnit = new Map<string, number>()
  const shares = new Map<string, Record<string, number>>()

  // 1. Item claims, in claimant order, each taking the next unclaimed units.
  for (const claimant of claimants) {
    let share: Record<string, number> = {}
    if (claimant.allocation.mode === 'items') {
      for (const line of lines) {
        const wanted = Math.floor(claimant.allocation.units[line.key] ?? 0)
        if (!line.eligible || wanted <= 0) continue
        const units = unitsByLine.get(line.key) ?? []
        const start = nextUnit.get(line.key) ?? 0
        const taken = units.slice(start, start + wanted)
        nextUnit.set(line.key, start + taken.length)
        share = withLine(share, line.key, sum(taken))
      }
    }
    shares.set(claimant.id, share)
  }

  // 2. Shared claims split what the item claims left, one diner's part each.
  const sharedClaimants = claimants.filter((claimant) => claimant.allocation.mode === 'shared')
  if (sharedClaimants.length > 0 && diners > 0) {
    for (const line of lines) {
      if (!line.eligible) continue
      const units = unitsByLine.get(line.key) ?? []
      const leftover = sum(units.slice(nextUnit.get(line.key) ?? 0))
      const parts = allocateCents(leftover, new Array<number>(diners).fill(1))
      sharedClaimants.forEach((claimant, index) => {
        const current = shares.get(claimant.id) ?? {}
        shares.set(claimant.id, withLine(current, line.key, parts[index] ?? 0))
      })
    }
  }

  return new Map(
    claimants.map((claimant) => {
      const byLine = shares.get(claimant.id) ?? {}
      return [claimant.id, { byLine, gross: sum(Object.values(byLine)) }]
    }),
  )
}

/** Units of a line not yet claimed by `items` claimants (for the picker UI). */
export function unclaimedUnits(
  line: GovLineInput,
  claimants: readonly GovClaimantInput[],
  exceptClaimantId?: string,
): number {
  const claimed = claimants.reduce((total, claimant) => {
    if (claimant.id === exceptClaimantId || claimant.allocation.mode !== 'items') return total
    return total + Math.max(0, Math.floor(claimant.allocation.units[line.key] ?? 0))
  }, 0)
  return Math.max(0, Math.floor(line.quantity) - claimed)
}
