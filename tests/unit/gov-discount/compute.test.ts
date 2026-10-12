/**
 * The law's own worked examples, priced by the engine.
 *
 * Figures come from RR 7-2010, RR 5-2017 §5.1, RR 13-2020 and DSWD/NCMB
 * Res. 3-2009 — if one of these fails, the engine is wrong, not the test.
 */
import { describe, it, expect } from '@jest/globals'
import {
  computeGovDiscount,
  type GovClaimantInput,
  type GovDiscountInput,
  type GovLineInput,
} from '@/lib/gov-discount'

const meal = (amount: number, quantity = 1, key = 'meal'): GovLineInput => ({
  key,
  name: key,
  quantity,
  amount,
  eligible: true,
})

const senior = (overrides: Partial<GovClaimantInput> = {}): GovClaimantInput => ({
  id: 'c1',
  kind: 'senior',
  name: 'Juan Dela Cruz',
  idNumber: '12345',
  allocation: { mode: 'items', units: { meal: 1 } },
  ...overrides,
})

function priced(input: GovDiscountInput) {
  const result = computeGovDiscount(input)
  if (!result.ok) throw new Error(JSON.stringify(result.problems))
  return result
}

describe('a single ₱560 meal', () => {
  it('VAT store, Senior: removes ₱60 VAT, takes ₱100, charges ₱400', () => {
    const result = priced({ vatStatus: 'vat', lines: [meal(560)], claimants: [senior()] })
    const [claimant] = result.claimants

    expect(claimant.vatExemptSales).toBe(500)
    expect(claimant.vatRemoved).toBe(60)
    expect(claimant.discount).toBe(100)
    expect(claimant.netDue).toBe(400)
    expect(result.totalReduction).toBe(160)
  })

  it('non-VAT store, PWD: 20% off the price, charges ₱448', () => {
    const result = priced({
      vatStatus: 'non_vat',
      lines: [meal(560)],
      claimants: [senior({ kind: 'pwd', idNumber: '13-7404-000-0001234' })],
    })
    const [claimant] = result.claimants

    expect(claimant.vatRemoved).toBe(0)
    expect(claimant.discount).toBe(112)
    expect(claimant.netDue).toBe(448)
  })

  it('VAT store, athlete: 20% off the VAT-exclusive price, VAT on the rest → ₱448', () => {
    const result = priced({
      vatStatus: 'vat',
      lines: [meal(560)],
      claimants: [senior({ kind: 'athlete' })],
    })
    const [claimant] = result.claimants

    expect(claimant.discount).toBe(100)
    expect(claimant.netDue).toBe(448)
    expect(claimant.vatExemptSales).toBe(0)
    expect(claimant.reduction).toBe(112)
  })
})

describe('a shared table (DSWD/NCMB Res. 3-2009)', () => {
  const platter = { key: 'platter', name: 'Kamayan platter', quantity: 1, amount: 2000, eligible: true }

  it('4 diners, 1 senior, ₱2,000 at a VAT store → table pays ₱1,857.14', () => {
    const result = priced({
      vatStatus: 'vat',
      lines: [platter],
      diners: 4,
      claimants: [senior({ allocation: { mode: 'shared' } })],
    })
    const [claimant] = result.claimants

    expect(claimant.grossShare).toBe(500)
    expect(claimant.vatExemptSales).toBe(446.43)
    expect(claimant.discount).toBe(89.29)
    expect(claimant.netDue).toBe(357.14)
    expect(2000 - result.totalReduction).toBeCloseTo(1857.14, 2)
  })

  it('the same table at a non-VAT store → ₱1,900', () => {
    const result = priced({
      vatStatus: 'non_vat',
      lines: [platter],
      diners: 4,
      claimants: [senior({ allocation: { mode: 'shared' } })],
    })

    expect(2000 - result.totalReduction).toBe(1900)
  })

  it('two seniors at a table of 5 each take one diner’s part', () => {
    const result = priced({
      vatStatus: 'non_vat',
      lines: [platter],
      diners: 5,
      claimants: [
        senior({ allocation: { mode: 'shared' } }),
        senior({ id: 'c2', idNumber: '99999', allocation: { mode: 'shared' } }),
      ],
    })

    expect(result.claimants.map((c) => c.grossShare)).toEqual([400, 400])
    expect(result.totalReduction).toBe(160)
  })

  it('splits only what the item claims left over', () => {
    // The senior's own ₱300 dish plus a share of the ₱1,200 platter among 4.
    const result = priced({
      vatStatus: 'non_vat',
      lines: [meal(300, 1, 'own'), { ...platter, amount: 1200 }],
      diners: 4,
      claimants: [
        senior({ allocation: { mode: 'items', units: { own: 1 } } }),
        senior({ id: 'c2', idNumber: '99999', allocation: { mode: 'shared' } }),
      ],
    })

    expect(result.claimants[0].grossShare).toBe(300)
    // The own dish is fully claimed, so only the platter is shared: 1200 / 4.
    expect(result.claimants[1].grossShare).toBe(300)
  })
})

describe('their own items in a mixed order', () => {
  it('discounts only the units they ordered', () => {
    const result = priced({
      vatStatus: 'non_vat',
      lines: [meal(450, 3, 'adobo'), meal(100, 2, 'rice')],
      claimants: [senior({ allocation: { mode: 'items', units: { adobo: 1, rice: 1 } } })],
    })
    const [claimant] = result.claimants

    expect(claimant.grossShare).toBe(200)
    expect(claimant.discount).toBe(40)
    expect(result.lineReductions).toEqual({ adobo: 30, rice: 10 })
  })

  it('never lets two claimants share more units than the line has', () => {
    const result = computeGovDiscount({
      vatStatus: 'vat',
      lines: [meal(560)],
      claimants: [senior(), senior({ id: 'c2', idNumber: '99999' })],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems.map((p) => p.code)).toContain('units_exceed')
  })

  it('splits odd centavos so every unit of a line adds back exactly', () => {
    // ₱100 across 3 units = 33.34 + 33.33 + 33.33.
    const result = priced({
      vatStatus: 'non_vat',
      lines: [meal(100, 3)],
      claimants: [
        senior({ allocation: { mode: 'items', units: { meal: 1 } } }),
        senior({ id: 'c2', idNumber: '99999', allocation: { mode: 'items', units: { meal: 2 } } }),
      ],
    })

    const shares = result.claimants.map((c) => c.grossShare)
    expect(shares[0] + shares[1]).toBeCloseTo(100, 10)
  })
})

describe('what is and is not covered', () => {
  it('refuses an item the store excluded', () => {
    const result = computeGovDiscount({
      vatStatus: 'vat',
      lines: [{ ...meal(500, 1, 'mug'), eligible: false }, meal(560)],
      claimants: [senior({ allocation: { mode: 'items', units: { mug: 1 } } })],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems[0].code).toBe('ineligible_line')
  })

  it('never shares an excluded item across the table', () => {
    const result = priced({
      vatStatus: 'non_vat',
      lines: [{ ...meal(1000, 1, 'bucket'), eligible: false }, meal(400)],
      diners: 2,
      claimants: [senior({ allocation: { mode: 'shared' } })],
    })

    expect(result.claimants[0].grossShare).toBe(200)
  })

  it('keeps the service charge in full by default', () => {
    const result = priced({
      vatStatus: 'vat',
      lines: [meal(560)],
      serviceCharge: 56,
      claimants: [senior()],
    })

    expect(result.claimants[0].serviceChargeVatRemoved).toBe(0)
    expect(result.totalReduction).toBe(160)
  })

  it('takes VAT off their share of the service charge under exempt_share', () => {
    const result = priced({
      vatStatus: 'vat',
      lines: [meal(560)],
      serviceCharge: 56,
      serviceChargeMode: 'exempt_share',
      claimants: [senior()],
    })
    const [claimant] = result.claimants

    expect(claimant.serviceChargeShare).toBe(56)
    expect(claimant.serviceChargeVatRemoved).toBe(6)
    expect(result.totalReduction).toBe(166)
  })
})

describe('refusals a cashier can act on', () => {
  const base: GovDiscountInput = { vatStatus: 'vat', lines: [meal(560)], claimants: [] }

  it('requires the name and ID number BIR needs', () => {
    const result = computeGovDiscount({ ...base, claimants: [senior({ name: ' ', idNumber: '' })] })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.problems.map((p) => p.code)).toEqual(['name_missing', 'id_missing'])
    }
  })

  it('gives one person one 20%, even if they are both Senior and PWD', () => {
    const result = computeGovDiscount({
      ...base,
      lines: [meal(560, 2)],
      claimants: [
        senior(),
        senior({ id: 'c2', kind: 'pwd', idNumber: ' 12345 ' }),
      ],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems.map((p) => p.code)).toContain('id_duplicate')
  })

  it('refuses splitting a take-out order across a table', () => {
    const result = computeGovDiscount({
      ...base,
      diners: 2,
      allowShared: false,
      claimants: [senior({ allocation: { mode: 'shared' } })],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems[0].code).toBe('shared_not_allowed')
  })

  it('needs a headcount for a shared table, at least one per claimant', () => {
    const shared = senior({ allocation: { mode: 'shared' } })

    const missing = computeGovDiscount({ ...base, claimants: [shared] })
    const tooFew = computeGovDiscount({
      ...base,
      diners: 1,
      claimants: [shared, senior({ id: 'c2', idNumber: '777', allocation: { mode: 'shared' } })],
    })

    expect(missing.ok || missing.problems[0].code).toBe('diners_missing')
    expect(tooFew.ok || tooFew.problems[0].code).toBe('diners_too_few')
  })

  it('refuses a kind the store switched off', () => {
    const result = computeGovDiscount({
      ...base,
      enabledKinds: ['senior', 'pwd'],
      claimants: [senior({ kind: 'athlete' })],
    })

    expect(result.ok || result.problems[0].code).toBe('kind_disabled')
  })

  it('warns, but does not refuse, an unusual PWD ID', () => {
    const result = priced({ ...base, claimants: [senior({ kind: 'pwd', idNumber: 'PWD-001' })] })

    expect(result.warnings).toHaveLength(1)
  })
})
