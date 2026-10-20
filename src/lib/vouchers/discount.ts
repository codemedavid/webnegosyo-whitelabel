/**
 * What a voucher is worth, and which lines it comes off.
 *
 * Two decisions worth knowing about:
 *
 * 1. **Sequential, not parallel.** A second voucher discounts what the first
 *    one left behind. Two 50% vouchers on a ₱200 cart give ₱150 off, not ₱200.
 *    Computing both against the original price is how a merchant accidentally
 *    gives an order away.
 *
 * 2. **Allocation is computed once, at redemption.** When the order is edited
 *    or partly refunded weeks later, "how much of this discount belonged to the
 *    pasta" is the only way to work out what to hand back — and the cart that
 *    earned it is long gone by then.
 *
 * Pure: no clock of its own, no I/O, no mutation of anything the caller owns.
 */

import { getEligibleLines } from './eligibility'
import type { DiscountContext, DiscountLine, UnitPicks, Voucher } from './types'

const CENTAVO_PRECISION = 100

function roundMoney(value: number): number {
  return Math.round(value * CENTAVO_PRECISION) / CENTAVO_PRECISION
}

function toCents(value: number): number {
  return Math.round(value * CENTAVO_PRECISION)
}

export interface DiscountAllocation {
  lineId: string
  amount: number
  /** Units of the line this voucher discounted — unit-limited vouchers only. */
  units?: number
  /** Centavos off each unit of the line, by unit position (unit-limited only). */
  unitCents?: readonly number[]
}

export interface VoucherDiscountResult {
  /** Everything taken off: lines plus delivery. */
  amount: number
  lineAmount: number
  deliveryAmount: number
  allocations: readonly DiscountAllocation[]
}

/**
 * How much of each line — and of the delivery fee — is still discountable.
 * Threaded through a stack of vouchers so each one sees what is left.
 *
 * `byUnit` holds the same money per UNIT, in centavos, so a voucher that only
 * discounts some units ("one fries of five") can never push a single fries
 * below zero after another voucher already took from it.
 */
export interface RemainingAmounts {
  byLine: Readonly<Record<string, number>>
  byUnit: Readonly<Record<string, readonly number[]>>
  deliveryFee: number
}

/**
 * Splits `total` centavos in proportion to `weights` (largest remainder, ties
 * to the earlier part), so the parts always add back to the whole exactly.
 */
function allocateCents(total: number, weights: readonly number[]): number[] {
  const pool = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0)
  if (total <= 0 || pool <= 0) return weights.map(() => 0)
  const exact = weights.map((weight) => (Math.max(0, weight) * total) / pool)
  const parts = exact.map((value) => Math.floor(value))
  let left = total - parts.reduce((sum, part) => sum + part, 0)
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
  for (const { index } of order) {
    if (left <= 0) break
    parts[index] += 1
    left -= 1
  }
  return parts
}

/** A line's units, one per piece; a line with no whole unit counts as one. */
function unitCountOf(line: DiscountLine): number {
  return Math.max(1, Math.floor(line.quantity))
}

export function createRemainingAmounts(context: DiscountContext): RemainingAmounts {
  const byLine: Record<string, number> = {}
  const byUnit: Record<string, number[]> = {}
  for (const line of context.lines) {
    byLine[line.id] = line.subtotal
    const units = unitCountOf(line)
    byUnit[line.id] = allocateCents(Math.max(0, toCents(line.subtotal)), new Array<number>(units).fill(1))
  }
  return { byLine, byUnit, deliveryFee: context.deliveryFee }
}

/** The units left after `allocation`, never below zero. */
function unitsAfter(units: readonly number[], allocation: DiscountAllocation): number[] {
  const taken = allocation.unitCents ?? allocateCents(toCents(allocation.amount), units)
  return units.map((cents, index) => Math.max(0, cents - (taken[index] ?? 0)))
}

/** Returns a NEW remaining state with this voucher's take subtracted. */
export function applyDiscountToRemaining(
  remaining: RemainingAmounts,
  result: VoucherDiscountResult,
): RemainingAmounts {
  const byLine = { ...remaining.byLine }
  const byUnit: Record<string, readonly number[]> = { ...remaining.byUnit }
  for (const allocation of result.allocations) {
    byLine[allocation.lineId] = roundMoney((byLine[allocation.lineId] ?? 0) - allocation.amount)
    byUnit[allocation.lineId] = unitsAfter(byUnit[allocation.lineId] ?? [], allocation)
  }
  return {
    byLine,
    byUnit,
    deliveryFee: roundMoney(remaining.deliveryFee - result.deliveryAmount),
  }
}

const EMPTY_RESULT: VoucherDiscountResult = {
  amount: 0,
  lineAmount: 0,
  deliveryAmount: 0,
  allocations: [],
}

/**
 * Splits `total` across `lines` in proportion to what each still holds.
 *
 * The last line absorbs the rounding remainder so the parts always add back up
 * to the whole — a lost centavo here is a refund that never balances.
 */
function allocateProportionally(
  total: number,
  lines: readonly { id: string; remaining: number }[],
): DiscountAllocation[] {
  const pool = lines.reduce((sum, line) => sum + line.remaining, 0)
  if (pool <= 0 || total <= 0) return []

  const allocations: DiscountAllocation[] = []
  let assigned = 0

  lines.forEach((line, index) => {
    const isLast = index === lines.length - 1
    const amount = isLast
      ? roundMoney(total - assigned)
      : roundMoney((line.remaining / pool) * total)

    if (amount <= 0) return
    allocations.push({ lineId: line.id, amount })
    assigned = roundMoney(assigned + amount)
  })

  return allocations
}

/** One unit still worth discounting, in cart order. */
interface UnitCandidate {
  lineId: string
  unit: number
  cents: number
  order: number
}

function unitCandidates(
  lines: readonly DiscountLine[],
  remaining: RemainingAmounts,
): UnitCandidate[] {
  const candidates: UnitCandidate[] = []
  for (const line of lines) {
    const units = remaining.byUnit[line.id] ?? []
    units.forEach((cents, unit) => {
      if (cents > 0) candidates.push({ lineId: line.id, unit, cents, order: candidates.length })
    })
  }
  return candidates
}

/** The picks for this voucher's code, matched case-insensitively. */
function picksFor(voucher: Voucher, context: DiscountContext): UnitPicks | null {
  const all = context.unitPicks
  if (!all) return null
  const code = voucher.code.trim().toUpperCase()
  const key = Object.keys(all).find((candidate) => candidate.trim().toUpperCase() === code)
  return key === undefined ? null : all[key]
}

/**
 * The chosen units when the pick is valid for this cart, else null: every
 * picked line must be one the voucher covers, each count a whole number no
 * larger than the units left on that line, and the total within the limit.
 */
function pickedUnits(
  picks: UnitPicks | null,
  candidates: readonly UnitCandidate[],
  limit: number,
): UnitCandidate[] | null {
  if (!picks) return null
  const entries = Object.entries(picks).filter(([, units]) => units !== 0)
  if (entries.length === 0) return null
  let total = 0
  const chosen: UnitCandidate[] = []
  for (const [lineId, units] of entries) {
    const onLine = candidates.filter((candidate) => candidate.lineId === lineId)
    if (!Number.isInteger(units) || units < 1 || units > onLine.length) return null
    total += units
    chosen.push(...onLine.slice(0, units))
  }
  if (total > limit) return null
  return chosen.sort((a, b) => a.order - b.order)
}

/** The cheapest units still discountable, ties in cart order. */
function cheapestUnits(candidates: readonly UnitCandidate[], limit: number): UnitCandidate[] {
  return [...candidates]
    .sort((a, b) => a.cents - b.cents || a.order - b.order)
    .slice(0, limit)
    .sort((a, b) => a.order - b.order)
}

/**
 * A voucher limited to N units: the chosen (or cheapest) units only. Percent
 * comes off each unit; a fixed value comes off EACH unit, never more than the
 * unit is still worth; the peso cap applies to the lot.
 */
function computeUnitLimitedDiscount(
  voucher: Voucher,
  context: DiscountContext,
  remaining: RemainingAmounts,
  limit: number,
): VoucherDiscountResult {
  const lines = getEligibleLines(voucher, context.lines)
  const candidates = unitCandidates(lines, remaining)
  const chosen = pickedUnits(picksFor(voucher, context), candidates, limit) ?? cheapestUnits(candidates, limit)
  if (chosen.length === 0) return EMPTY_RESULT

  const isPercent = voucher.discountType === 'percent'
  const valueCents = toCents(voucher.discountValue)
  const wanted = chosen.map((unit) => (isPercent ? unit.cents : Math.min(valueCents, unit.cents)))
  const pool = wanted.reduce((sum, cents) => sum + cents, 0)
  let target = isPercent ? Math.round((pool * voucher.discountValue) / 100) : pool
  if (voucher.maxDiscountAmount != null) target = Math.min(target, toCents(voucher.maxDiscountAmount))
  target = Math.min(target, pool)
  if (!Number.isFinite(target) || target <= 0) return EMPTY_RESULT

  const perUnit = allocateCents(target, wanted)
  const allocations: DiscountAllocation[] = []
  for (const line of lines) {
    const unitCents = new Array<number>((remaining.byUnit[line.id] ?? []).length).fill(0)
    let units = 0
    chosen.forEach((unit, index) => {
      if (unit.lineId !== line.id || perUnit[index] <= 0) return
      unitCents[unit.unit] = perUnit[index]
      units += 1
    })
    const cents = unitCents.reduce((sum, value) => sum + value, 0)
    if (cents > 0) allocations.push({ lineId: line.id, amount: cents / CENTAVO_PRECISION, units, unitCents })
  }

  const lineAmount = target / CENTAVO_PRECISION
  return { amount: lineAmount, lineAmount, deliveryAmount: 0, allocations }
}

/** The unit limit as a whole number of units, or null for "every unit". */
export function unitLimitOf(voucher: Voucher): number | null {
  const limit = voucher.maxDiscountedUnits
  if (voucher.discountType === 'free_delivery' || limit == null) return null
  return Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : null
}

/**
 * Values `voucher` against `context`, respecting anything already discounted in
 * `remaining`. Assumes eligibility has been checked; an ineligible voucher
 * simply comes out worth zero.
 */
export function computeVoucherDiscount(
  voucher: Voucher,
  context: DiscountContext,
  remaining: RemainingAmounts = createRemainingAmounts(context),
): VoucherDiscountResult {
  if (voucher.discountType === 'free_delivery') {
    const deliveryAmount = roundMoney(Math.max(0, remaining.deliveryFee))
    if (deliveryAmount <= 0) return EMPTY_RESULT
    return { amount: deliveryAmount, lineAmount: 0, deliveryAmount, allocations: [] }
  }

  // A negative or non-finite value is a corrupt voucher, not a surcharge.
  if (!Number.isFinite(voucher.discountValue) || voucher.discountValue <= 0) return EMPTY_RESULT

  const limit = unitLimitOf(voucher)
  if (limit !== null) return computeUnitLimitedDiscount(voucher, context, remaining, limit)

  const eligible = getEligibleLines(voucher, context.lines)
    .map((line) => ({ id: line.id, remaining: Math.max(0, remaining.byLine[line.id] ?? 0) }))
    .filter((line) => line.remaining > 0)

  const eligibleAmount = roundMoney(eligible.reduce((sum, line) => sum + line.remaining, 0))
  if (eligibleAmount <= 0) return EMPTY_RESULT

  const raw =
    voucher.discountType === 'percent'
      ? (eligibleAmount * voucher.discountValue) / 100
      : voucher.discountValue

  if (!Number.isFinite(raw) || raw <= 0) return EMPTY_RESULT

  const capped = voucher.maxDiscountAmount != null
    ? Math.min(raw, voucher.maxDiscountAmount)
    : raw

  // Never give away more than the eligible lines are actually worth.
  const lineAmount = roundMoney(Math.min(capped, eligibleAmount))
  if (lineAmount <= 0) return EMPTY_RESULT

  return {
    amount: lineAmount,
    lineAmount,
    deliveryAmount: 0,
    allocations: allocateProportionally(lineAmount, eligible),
  }
}
