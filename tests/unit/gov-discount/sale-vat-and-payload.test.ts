import { describe, it, expect } from '@jest/globals'
import {
  chooseDiscountRegime,
  claimantInputsFromStored,
  computeGovDiscount,
  govDiscountLines,
  maskIdNumber,
  readStoredGovDiscount,
  saleVatBreakdown,
  shortClaimantName,
  checkIdNumber,
  effectiveEnabledKinds,
  type GovClaimantResult,
} from '@/lib/gov-discount'

const platterSale = () => {
  const result = computeGovDiscount({
    vatStatus: 'vat',
    lines: [{ key: 'platter', name: 'Platter', quantity: 1, amount: 2000, eligible: true }],
    diners: 4,
    claimants: [
      { id: 'c1', kind: 'senior', name: 'Juan Dela Cruz', idNumber: '12345', allocation: { mode: 'shared' } },
    ],
  })
  if (!result.ok) throw new Error('expected a priced sale')
  return result
}

const cents = (value: number) => Math.round(value * 100)

describe('saleVatBreakdown', () => {
  it('prints the BIR breakdown for the shared-table example', () => {
    const sale = platterSale()

    const vat = saleVatBreakdown({ vatStatus: 'vat', itemsTotal: 2000, claimants: sale.claimants })

    expect(vat).toEqual({
      vatableSales: 1339.29,
      vatAmount: 160.71,
      vatExemptSales: 446.43,
      zeroRatedSales: 0,
      lessDiscounts: 89.29,
    })
  })

  it('always reconciles to the amount due, to the centavo', () => {
    const sale = platterSale()
    const due = cents(2000) - cents(sale.totalReduction)

    const vat = saleVatBreakdown({ vatStatus: 'vat', itemsTotal: 2000, claimants: sale.claimants })!

    expect(
      cents(vat.vatableSales) + cents(vat.vatAmount) + cents(vat.vatExemptSales) - cents(vat.lessDiscounts),
    ).toBe(due)
  })

  it('reconciles with a delivery fee, service charge and an athlete', () => {
    const sale = computeGovDiscount({
      vatStatus: 'vat',
      lines: [
        { key: 'a', name: 'A', quantity: 2, amount: 777.77, eligible: true },
        { key: 'b', name: 'B', quantity: 1, amount: 123.45, eligible: true },
      ],
      serviceCharge: 90.12,
      serviceChargeMode: 'exempt_share',
      claimants: [
        { id: 'c1', kind: 'senior', name: 'Ana Reyes', idNumber: '111', allocation: { mode: 'items', units: { a: 1 } } },
        { id: 'c2', kind: 'athlete', name: 'Ben Cruz', idNumber: '222', allocation: { mode: 'items', units: { b: 1 } } },
      ],
    })
    if (!sale.ok) throw new Error('expected a priced sale')
    const gross = cents(777.77) + cents(123.45) + cents(90.12) + cents(49)

    const vat = saleVatBreakdown({
      vatStatus: 'vat',
      itemsTotal: 901.22,
      serviceCharge: 90.12,
      deliveryFee: 49,
      claimants: sale.claimants,
    })!

    expect(
      cents(vat.vatableSales) + cents(vat.vatAmount) + cents(vat.vatExemptSales) - cents(vat.lessDiscounts),
    ).toBe(gross - cents(sale.totalReduction))
  })

  it('computes VAT on what a voucher left when there is no government discount', () => {
    const vat = saleVatBreakdown({ vatStatus: 'vat', itemsTotal: 1120, otherDiscount: 112 })

    expect(vat).toMatchObject({ vatableSales: 900, vatAmount: 108, vatExemptSales: 0 })
  })

  it('prints nothing for a non-VAT store', () => {
    expect(saleVatBreakdown({ vatStatus: 'non_vat', itemsTotal: 500 })).toBeNull()
  })
})

describe('govDiscountLines', () => {
  it('names the VAT exemption and the 20% separately, summing to the reduction', () => {
    const sale = platterSale()

    const lines = govDiscountLines(sale.claimants)

    expect(lines).toEqual([
      { label: 'SC VAT exemption · J. Dela Cruz', amount: 53.57 },
      { label: 'SC 20% · J. Dela Cruz', amount: 89.29 },
    ])
    expect(cents(lines[0].amount) + cents(lines[1].amount)).toBe(cents(sale.totalReduction))
  })

  it('uses one line at a non-VAT store', () => {
    const sale = computeGovDiscount({
      vatStatus: 'non_vat',
      lines: [{ key: 'm', name: 'M', quantity: 1, amount: 560, eligible: true }],
      claimants: [
        { id: 'c1', kind: 'pwd', name: 'Ana', idNumber: '13-7404-000-0001234', allocation: { mode: 'items', units: { m: 1 } } },
      ],
    })
    if (!sale.ok) throw new Error('expected a priced sale')

    expect(govDiscountLines(sale.claimants)).toEqual([{ label: 'PWD 20% · Ana', amount: 112 }])
  })
})

describe('readStoredGovDiscount', () => {
  const stored = () => ({
    version: 1,
    vatStatus: 'vat',
    serviceChargeMode: 'full',
    diners: 4,
    claimants: platterSale().claimants,
    vat: null,
    approval: { approvalId: 'a1', approverName: 'Maria' },
  })

  it('round-trips a stored block and gives back the inputs for an edit', () => {
    const block = readStoredGovDiscount(JSON.parse(JSON.stringify(stored())))

    expect(block?.diners).toBe(4)
    expect(block?.approval).toEqual({ approvalId: 'a1', approverName: 'Maria' })
    expect(claimantInputsFromStored(block!)).toEqual([
      { id: 'c1', kind: 'senior', name: 'Juan Dela Cruz', idNumber: '12345', allocation: { mode: 'shared' } },
    ])
  })

  it('rejects junk instead of trusting it', () => {
    expect(readStoredGovDiscount(null)).toBeNull()
    expect(readStoredGovDiscount({ ...stored(), version: 2 })).toBeNull()
    expect(readStoredGovDiscount({ ...stored(), claimants: [{ kind: 'student' }] })).toBeNull()
    const badUnits = {
      ...stored(),
      claimants: [{ ...(stored().claimants[0] as GovClaimantResult), allocation: { mode: 'items', units: { a: -1, b: 2 } } }],
    }
    expect(readStoredGovDiscount(badUnits)?.claimants[0].allocation).toEqual({ mode: 'items', units: { b: 2 } })
  })
})

describe('chooseDiscountRegime', () => {
  it('applies whichever saves the customer more, never both', () => {
    expect(chooseDiscountRegime(142.86, 50)).toEqual({ regime: 'government', advantage: 92.86 })
    expect(chooseDiscountRegime(100, 200)).toEqual({ regime: 'other', advantage: 100 })
  })

  it('prefers the government discount on a tie', () => {
    expect(chooseDiscountRegime(100, 100).regime).toBe('government')
  })
})

describe('claimant identity helpers', () => {
  it('masks all but the last four characters', () => {
    expect(maskIdNumber('13-7404-000-0001234')).toBe('••••1234')
    expect(maskIdNumber('123')).toBe('•••')
  })

  it('shortens names for the receipt', () => {
    expect(shortClaimantName('  juan   dela cruz ')).toBe('J. dela cruz')
    expect(shortClaimantName('Madonna')).toBe('Madonna')
  })

  it('checks the shape of an ID number', () => {
    expect(checkIdNumber('')).toBe('missing')
    expect(checkIdNumber('ab')).toBe('invalid')
    expect(checkIdNumber('NO-DIGITS')).toBe('invalid')
    expect(checkIdNumber('osca 2019-55')).toBe('ok')
  })

  it('always offers Senior and PWD, whatever the stored setting says', () => {
    expect(effectiveEnabledKinds([])).toEqual(['senior', 'pwd'])
    expect(effectiveEnabledKinds(['athlete', 'nonsense'])).toEqual(['senior', 'pwd', 'athlete'])
    expect(effectiveEnabledKinds(null)).toEqual(['senior', 'pwd'])
  })
})
