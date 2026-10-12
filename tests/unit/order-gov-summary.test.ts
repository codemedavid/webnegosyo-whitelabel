import { describe, it, expect } from '@jest/globals'
import { computeGovDiscount, saleVatBreakdown, type StoredGovDiscount } from '@/lib/gov-discount'
import { defaultTaxProfile } from '@/lib/gov-discount/tax-profile'
import { govOrderSummary, orderVatBreakdown, vatRows } from '@/lib/order-gov-summary'
import { receiptTaxIdentity } from '@/lib/receipt-tax'

function stored(vatStatus: 'vat' | 'non_vat'): StoredGovDiscount {
  const result = computeGovDiscount({
    vatStatus,
    lines: [
      { key: 'a', name: 'Platter', quantity: 1, amount: 2000, eligible: true },
      { key: 'b', name: 'Sisig', quantity: 1, amount: 560, eligible: true },
    ],
    diners: 4,
    claimants: [
      { id: 'c1', kind: 'senior', name: 'Juan Dela Cruz', idNumber: '12345', allocation: { mode: 'shared' } },
      { id: 'c2', kind: 'pwd', name: 'Ana Reyes', idNumber: '13-7404-000-0001234', allocation: { mode: 'items', units: { b: 1 } } },
    ],
  })
  if (!result.ok) throw new Error('expected a priced sale')
  return {
    version: 1,
    vatStatus,
    serviceChargeMode: 'full',
    diners: 4,
    claimants: result.claimants,
    vat: saleVatBreakdown({ vatStatus, itemsTotal: 2560, claimants: result.claimants }),
    approval: { approvalId: 'ap1', approverName: 'Liza (manager)' },
  }
}

describe('govOrderSummary', () => {
  it('lists each claimant with code, masked ID, share and reduction', () => {
    const summary = govOrderSummary(stored('vat'))!

    expect(summary.claimants).toEqual([
      expect.objectContaining({
        code: 'SC',
        kindLabel: 'Senior Citizen',
        name: 'Juan Dela Cruz',
        idNumber: '12345',
        maskedId: '••••2345',
        share: 500,
        reduction: 142.86,
        basis: 'Shared table · 4 diners',
      }),
      expect.objectContaining({
        code: 'PWD',
        maskedId: '••••1234',
        idNumber: '13-7404-000-0001234',
        share: 560,
        reduction: 160,
        basis: 'Own order',
      }),
    ])
    expect(summary.approverName).toBe('Liza (manager)')
  })

  it('prints all four VAT lines plus one "Less" line naming both kinds', () => {
    const summary = govOrderSummary(stored('vat'))!

    expect(summary.vatRows.map((row) => row.label)).toEqual([
      'VATable Sales',
      'VAT (12%)',
      'VAT-Exempt Sales',
      'Zero-Rated Sales',
      'Less: SC/PWD Discount',
    ])
  })

  it('has no VAT rows at a non-VAT store, and nothing at all without claimants', () => {
    expect(govOrderSummary(stored('non_vat'))!.vatRows).toEqual([])
    expect(govOrderSummary(null)).toBeNull()
    expect(govOrderSummary({ ...stored('vat'), claimants: [] })).toBeNull()
  })

  it('leaves the "Less" line out when nothing was discounted', () => {
    const rows = vatRows({ vatableSales: 100, vatAmount: 12, vatExemptSales: 0, zeroRatedSales: 0, lessDiscounts: 0 })
    expect(rows.map((row) => row.kind)).toEqual(['vatable', 'vat', 'vatExempt', 'zeroRated'])
  })
})

describe('orderVatBreakdown', () => {
  it('prints what a Senior/PWD sale was priced with, whatever the store says today', () => {
    const government = stored('vat')
    expect(orderVatBreakdown({ government, storeVatStatus: 'non_vat', total: 1 })).toEqual(government.vat)
    expect(orderVatBreakdown({ government: stored('non_vat'), storeVatStatus: 'vat', total: 1 })).toBeNull()
  })

  it('reads an ordinary VAT sale off its total', () => {
    expect(orderVatBreakdown({ storeVatStatus: 'vat', total: 112 })).toEqual({
      vatableSales: 100,
      vatAmount: 12,
      vatExemptSales: 0,
      zeroRatedSales: 0,
      lessDiscounts: 0,
    })
    expect(orderVatBreakdown({ storeVatStatus: 'non_vat', total: 112 })).toBeNull()
    expect(orderVatBreakdown({ total: 112 })).toBeNull()
  })
})

describe('receiptTaxIdentity', () => {
  it('is absent for a store with no profile', () => {
    expect(receiptTaxIdentity(null)).toBeUndefined()
  })

  it('carries the TIN line and the permit numbers', () => {
    const identity = receiptTaxIdentity({
      ...defaultTaxProfile('vat'),
      tin: '123-456-789',
      tinBranchCode: '00000',
      isBirRegisteredPos: true,
      posMin: 'MIN1',
    })
    expect(identity).toEqual(
      expect.objectContaining({
        vatStatus: 'vat',
        tinLine: 'VAT REG TIN 123-456-789-00000',
        isBirRegisteredPos: true,
        posMin: 'MIN1',
      }),
    )
  })
})
