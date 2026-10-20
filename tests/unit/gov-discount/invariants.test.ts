/**
 * Invariants over many generated sales — the arithmetic must add up for every
 * cart, not just the ones someone wrote down.
 */
import { describe, it, expect } from '@jest/globals'
import {
  computeGovDiscount,
  govDiscountLines,
  saleVatBreakdown,
  type GovClaimantInput,
  type GovDiscountKind,
  type GovLineInput,
  type VatStatus,
} from '@/lib/gov-discount'

/** Small deterministic PRNG so a failure reproduces. */
function rng(seed: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

const cents = (value: number) => Math.round(value * 100)
const KINDS: GovDiscountKind[] = ['senior', 'pwd', 'athlete', 'medal_of_valor']

function generateSale(random: () => number) {
  const lineCount = 1 + Math.floor(random() * 5)
  const lines: GovLineInput[] = Array.from({ length: lineCount }, (_, index) => {
    const quantity = 1 + Math.floor(random() * 4)
    return {
      key: `l${index}`,
      name: `Line ${index}`,
      quantity,
      amount: Math.round(random() * 90000 * quantity) / 100,
      eligible: random() > 0.15,
    }
  })
  const vatStatus: VatStatus = random() > 0.5 ? 'vat' : 'non_vat'
  const shared = random() > 0.6
  const claimantCount = 1 + Math.floor(random() * 2)
  const remaining = new Map(lines.map((line) => [line.key, line.quantity]))

  const claimants: GovClaimantInput[] = Array.from({ length: claimantCount }, (_, index) => {
    const kind = KINDS[Math.floor(random() * KINDS.length)]
    if (shared) {
      return { id: `c${index}`, kind, name: 'Ana Cruz', idNumber: `ID${index}23`, allocation: { mode: 'shared' } }
    }
    const units: Record<string, number> = {}
    for (const line of lines) {
      const left = remaining.get(line.key) ?? 0
      if (!line.eligible || left === 0 || random() > 0.6) continue
      const take = 1 + Math.floor(random() * left)
      units[line.key] = take
      remaining.set(line.key, left - take)
    }
    return { id: `c${index}`, kind, name: 'Ana Cruz', idNumber: `ID${index}23`, allocation: { mode: 'items', units } }
  })

  return {
    vatStatus,
    lines,
    claimants,
    diners: claimantCount + Math.floor(random() * 6),
    serviceCharge: random() > 0.5 ? Math.round(random() * 20000) / 100 : 0,
    serviceChargeMode: random() > 0.5 ? ('exempt_share' as const) : ('full' as const),
  }
}

describe('engine invariants over 2,000 generated sales', () => {
  const random = rng(20261012)
  const sales = Array.from({ length: 2000 }, () => generateSale(random))
  const priced = sales
    .map((input) => ({ input, result: computeGovDiscount(input) }))
    .filter((entry) => entry.result.ok)

  it('prices most generated sales (the rest are refusals the cashier would see)', () => {
    expect(priced.length).toBeGreaterThan(1000)
  })

  it('each claimant’s net + reduction equals their share (food) plus service VAT', () => {
    for (const { result } of priced) {
      if (!result.ok) continue
      for (const claimant of result.claimants) {
        expect(cents(claimant.netDue) + cents(claimant.reduction) - cents(claimant.serviceChargeVatRemoved)).toBe(
          cents(claimant.grossShare),
        )
      }
    }
  })

  it('never takes off more than a line is worth, and line shares sum to food reductions', () => {
    for (const { input, result } of priced) {
      if (!result.ok) continue
      for (const line of input.lines) {
        expect(cents(result.lineReductions[line.key] ?? 0)).toBeLessThanOrEqual(cents(line.amount))
      }
      const lineSum = Object.values(result.lineReductions).reduce((sum, value) => sum + cents(value), 0)
      const food = result.claimants.reduce(
        (sum, claimant) => sum + cents(claimant.reduction) - cents(claimant.serviceChargeVatRemoved),
        0,
      )
      expect(lineSum).toBe(food)
    }
  })

  it('prints discount lines that sum exactly to the reduction', () => {
    for (const { result } of priced) {
      if (!result.ok) continue
      const printed = govDiscountLines(result.claimants).reduce((sum, line) => sum + cents(line.amount), 0)
      expect(printed).toBe(cents(result.totalReduction))
    }
  })

  it('reconciles the VAT block to the amount due at every VAT store', () => {
    for (const { input, result } of priced) {
      if (!result.ok || input.vatStatus !== 'vat') continue
      const itemsTotal = input.lines.reduce((sum, line) => sum + cents(line.amount), 0) / 100
      const vat = saleVatBreakdown({
        vatStatus: 'vat',
        itemsTotal,
        serviceCharge: input.serviceCharge,
        claimants: result.claimants,
      })!
      const due = cents(itemsTotal) + cents(input.serviceCharge) - cents(result.totalReduction)
      expect(
        cents(vat.vatableSales) + cents(vat.vatAmount) + cents(vat.vatExemptSales) - cents(vat.lessDiscounts),
      ).toBe(due)
    }
  })
})
