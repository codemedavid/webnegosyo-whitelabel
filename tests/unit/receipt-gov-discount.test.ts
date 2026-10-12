import { describe, it, expect } from '@jest/globals'
import {
  computeGovDiscount,
  govDiscountLines,
  saleVatBreakdown,
  type StoredGovDiscount,
} from '@/lib/gov-discount'
import { defaultTaxProfile, NOT_AN_INVOICE_NOTICE, type TaxProfile } from '@/lib/gov-discount/tax-profile'
import {
  CLASSIC_RECEIPT_LAYOUT,
  COMPACT_RECEIPT_LAYOUT,
  MODERN_RECEIPT_LAYOUT,
  renderReceipt,
  renderReceiptBlocks,
  renderReceiptSegments,
  type ReceiptConfig,
  type ReceiptLayout,
  type ReceiptOrder,
} from '@/lib/receipt-layout'
import { receiptTaxIdentity } from '@/lib/receipt-tax'

/**
 * Senior/PWD sales on paper: the TIN header, the VAT block, the claimant's
 * name / ID / signature and the supplementary-document notice. The engine
 * builds the fixture, so the receipt is tested against real figures.
 *
 * 4 diners share a ₱2,000 platter at a VAT store; one is a senior.
 *   VATable 1,339.29 · VAT 160.71 · VAT-exempt 446.43 · less SC 89.29
 *   = 1,857.14
 */

function platterGovernment(): { government: StoredGovDiscount; reduction: number } {
  const result = computeGovDiscount({
    vatStatus: 'vat',
    lines: [{ key: 'line-0', name: 'Platter', quantity: 1, amount: 2000, eligible: true }],
    diners: 4,
    claimants: [
      { id: 'c1', kind: 'senior', name: 'Juan Dela Cruz', idNumber: '12345', allocation: { mode: 'shared' } },
    ],
  })
  if (!result.ok) throw new Error('expected a priced sale')
  return {
    reduction: result.totalReduction,
    government: {
      version: 1,
      vatStatus: 'vat',
      serviceChargeMode: 'full',
      diners: 4,
      claimants: result.claimants,
      vat: saleVatBreakdown({ vatStatus: 'vat', itemsTotal: 2000, claimants: result.claimants }),
      approval: null,
    },
  }
}

function govOrder(): ReceiptOrder {
  const { government, reduction } = platterGovernment()
  return {
    _id: 'order-0000abcd1234',
    _creationTime: Date.UTC(2026, 9, 12, 4, 30),
    customerName: 'Walk-in',
    customerContact: 'n/a',
    total: 1857.14,
    paymentMethod: 'Cash',
    items: [{ menuItemName: 'Platter', quantity: 1, subtotal: 2000 }],
    customerData: {
      discount: {
        total: reduction,
        deliveryDiscount: 0,
        lines: govDiscountLines(government.claimants).map((line) => ({ ...line, isGovernment: true })),
        allocationsByLine: { 'line-0': reduction },
        government,
      },
    },
  }
}

const plainOrder: ReceiptOrder = {
  _id: 'abcdef1234567890',
  _creationTime: Date.UTC(2026, 6, 26, 4, 30),
  customerName: 'Walk-in',
  customerContact: 'n/a',
  total: 327.5,
  items: [
    { menuItemName: 'Latte', quantity: 2, subtotal: 240 },
    { menuItemName: 'Croissant', quantity: 1, subtotal: 87.5 },
  ],
}

function vatProfile(overrides: Partial<TaxProfile> = {}): TaxProfile {
  return {
    ...defaultTaxProfile('vat'),
    registeredName: 'Kape Co Food Services Inc.',
    tin: '123-456-789',
    tinBranchCode: '00000',
    businessAddress: '24 Rizal St, Quezon City',
    ...overrides,
  }
}

function configFor(profile: TaxProfile | null, width = 32): ReceiptConfig {
  const tax = receiptTaxIdentity(profile)
  return { storeName: 'Kape Co', width, ...(tax ? { tax } : {}) }
}

const lines = (text: string) => text.split('\n')
const lineStarting = (text: string, start: string) => lines(text).find((line) => line.startsWith(start))

describe('a Senior/PWD sale at a VAT store — Classic', () => {
  const receipt = () => renderReceipt(govOrder(), configFor(vatProfile()), CLASSIC_RECEIPT_LAYOUT)

  it('prints the BIR VAT block, aligned with the totals', () => {
    const text = receipt()
    expect(lineStarting(text, 'VATable Sales:')).toBe(`VATable Sales:${' '.repeat(10)}P1339.29`)
    expect(lineStarting(text, 'VAT (12%):')?.endsWith(' P160.71')).toBe(true)
    expect(lineStarting(text, 'VAT-Exempt Sales:')?.endsWith(' P446.43')).toBe(true)
    expect(lineStarting(text, 'Zero-Rated Sales:')?.endsWith(' P0.00')).toBe(true)
    expect(lineStarting(text, 'Less: SC Discount:')?.endsWith(' -P89.29')).toBe(true)
    expect(lineStarting(text, 'TOTAL:')).toContain('P1857.14')
    for (const line of lines(text)) expect(line.length).toBeLessThanOrEqual(32)
  })

  it('carries the claimant name, the FULL ID number and a signature line', () => {
    const text = receipt()
    expect(text).toContain('SC Name: Juan Dela Cruz')
    expect(text).toContain('SC ID No: 12345')
    expect(lineStarting(text, 'Signature: ')).toBe(`Signature: ${'_'.repeat(21)}`)
  })

  it('prints the registered name, address and TIN under the business name', () => {
    const text = lines(receipt()).map((line) => line.trim())
    const name = text.indexOf('KAPE CO')
    expect(text.slice(name, name + 5)).toEqual([
      'KAPE CO',
      'Kape Co Food Services Inc.',
      '24 Rizal St, Quezon City',
      'VAT REG TIN 123-456-789-00000',
      '='.repeat(32),
    ])
  })

  it('says it is not an invoice, in bold, without ever calling itself an Official Receipt', () => {
    const segments = renderReceiptSegments(govOrder(), configFor(vatProfile()), CLASSIC_RECEIPT_LAYOUT)
    const markup = segments.map((segment) => (segment.type === 'text' ? segment.text : '')).join('\n')
    expect(markup).toContain('<B> THIS DOCUMENT IS NOT VALID FOR</B>')
    expect(markup).toContain('<B>      CLAIM OF INPUT TAX.</B>')
    expect(receipt()).toContain('This is not a sales invoice.')
    expect(receipt()).not.toMatch(/official receipt/i)
  })

  it('wraps a long NON-VAT TIN instead of clipping a digit off it', () => {
    const profile = vatProfile({ vatStatus: 'non_vat' })
    const text = lines(renderReceipt(plainOrder, configFor(profile), CLASSIC_RECEIPT_LAYOUT)).map((l) => l.trim())
    expect(text).toContain('NON-VAT REG TIN')
    expect(text).toContain('123-456-789-00000')
  })
})

describe('a Senior/PWD sale — Modern and wide paper', () => {
  it('prints the same block on Modern, labels without colons', () => {
    const text = renderReceipt(govOrder(), configFor(vatProfile()), MODERN_RECEIPT_LAYOUT)
    expect(lineStarting(text, 'VATable Sales')?.endsWith('P1339.29')).toBe(true)
    expect(lineStarting(text, 'Less: SC Discount')?.endsWith('-P89.29')).toBe(true)
    expect(text).toContain('SC ID No: 12345')
    expect(text).toContain(NOT_AN_INVOICE_NOTICE.slice(0, 20))
    expect(text).not.toMatch(/official receipt/i)
  })

  it('keeps every line within 48 columns and aligns the amounts to the edge', () => {
    const text = renderReceipt(govOrder(), configFor(vatProfile(), 48), CLASSIC_RECEIPT_LAYOUT)
    for (const line of lines(text)) expect(line.length).toBeLessThanOrEqual(48)
    expect(lineStarting(text, 'VAT-Exempt Sales:')?.length).toBe(48)
    expect(text).toContain(NOT_AN_INVOICE_NOTICE.slice(0, 40))
  })

  it('reconciles: VATable + VAT + exempt − less = the total printed', () => {
    const text = renderReceipt(govOrder(), configFor(vatProfile()), CLASSIC_RECEIPT_LAYOUT)
    const amount = (start: string) => Number(lineStarting(text, start)!.split('P').pop())
    const due =
      amount('VATable Sales:') + amount('VAT (12%):') + amount('VAT-Exempt Sales:') - amount('Less: SC Discount:')
    expect(due.toFixed(2)).toBe('1857.14')
  })
})

describe('without a tax profile', () => {
  it('a plain order prints Classic exactly as before', () => {
    const before = renderReceipt(plainOrder, { storeName: 'Kape Co', width: 32 }, CLASSIC_RECEIPT_LAYOUT)
    expect(renderReceipt(plainOrder, configFor(null), CLASSIC_RECEIPT_LAYOUT)).toBe(before)
    expect(before).not.toContain('VATable')
    expect(before).not.toContain('NOT VALID')
  })

  it('a Senior/PWD order still prints its VAT block and claimant — the sale was priced with them', () => {
    const text = renderReceipt(govOrder(), configFor(null), CLASSIC_RECEIPT_LAYOUT)
    expect(text).toContain('VAT-Exempt Sales:')
    expect(text).toContain('SC ID No: 12345')
    // No profile, no claim about what kind of document this is.
    expect(text).not.toContain('NOT VALID')
    expect(text).not.toContain('TIN')
  })
})

describe('an ordinary sale at a VAT store', () => {
  it('reads the VAT block off the total, with nothing exempt', () => {
    const text = renderReceipt(plainOrder, configFor(vatProfile()), CLASSIC_RECEIPT_LAYOUT)
    expect(lineStarting(text, 'VATable Sales:')?.endsWith(' P292.41')).toBe(true)
    expect(lineStarting(text, 'VAT (12%):')?.endsWith(' P35.09')).toBe(true)
    expect(lineStarting(text, 'VAT-Exempt Sales:')?.endsWith(' P0.00')).toBe(true)
    expect(text).not.toContain('Less:')
    expect(text).not.toContain('Signature')
  })

  it('prints no VAT block at a non-VAT store', () => {
    const text = renderReceipt(plainOrder, configFor(vatProfile({ vatStatus: 'non_vat' })), CLASSIC_RECEIPT_LAYOUT)
    expect(text).not.toContain('VATable')
    expect(text).toContain('NON-VAT REG TIN')
  })

  it('prints the permit lines instead of the notice on a BIR-registered POS', () => {
    const profile = vatProfile({
      isBirRegisteredPos: true,
      posMin: '12345678901234567',
      posSerialNo: 'SN-0001',
      posPtuNo: 'FP012026-123-0000001-00000',
    })
    const text = lines(renderReceipt(plainOrder, configFor(profile), CLASSIC_RECEIPT_LAYOUT)).map((l) => l.trim())
    expect(text).toContain('MIN: 12345678901234567')
    expect(text).toContain('S/N: SN-0001')
    // Too long for 32 columns: it wraps at the space, never clipped.
    expect(text).toContain('PTU No:')
    expect(text).toContain('FP012026-123-0000001-00000')
    expect(text.join('\n')).not.toContain('NOT VALID')
  })

  it('falls back to the registered address when the store has none, and keeps the TIN on a layout without one', () => {
    const text = lines(renderReceipt(plainOrder, configFor(vatProfile()), COMPACT_RECEIPT_LAYOUT)).map((l) => l.trim())
    const name = text.indexOf('KAPE CO')
    expect(text.slice(name + 1, name + 4)).toEqual([
      'Kape Co Food Services Inc.',
      '24 Rizal St, Quezon City',
      'VAT REG TIN 123-456-789-00000',
    ])
  })

  it('skips the registered name when it is the store name', () => {
    const text = renderReceipt(plainOrder, configFor(vatProfile({ registeredName: 'KAPE  co' })), CLASSIC_RECEIPT_LAYOUT)
    expect(text).not.toContain('KAPE  co')
  })
})

describe('the Studio maps the new lines back to their blocks', () => {
  it('per-block rendering still concatenates to the whole receipt', () => {
    const layout: ReceiptLayout = MODERN_RECEIPT_LAYOUT
    const config = configFor(vatProfile())
    const whole = renderReceiptSegments(govOrder(), config, layout)
    const byBlock = renderReceiptBlocks(govOrder(), config, layout)
    const flat = (segments: typeof whole) =>
      segments.map((s) => (s.type === 'text' ? s.text : s.type)).join('\n')
    expect(byBlock.filter((block) => block.segments.length > 0).map((block) => flat(block.segments)).join('\n')).toBe(flat(whole))
    // The footer rides on the last printing block, the thank-you line.
    const thankYou = byBlock[layout.blocks.findIndex((b) => b.kind === 'text')]!
    expect(flat(thankYou.segments)).toContain('NOT VALID FOR')
  })
})
