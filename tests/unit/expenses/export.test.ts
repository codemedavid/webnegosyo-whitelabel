import {
  EXPORT_COLUMNS,
  MONTHLY_SUMMARY_COLUMNS,
  buildExportRows,
  buildMonthlySummary,
  exportRowsToCsv,
  monthlySummaryToCsv,
} from '@/lib/expenses/export'
import { makeCategory, makeExpense, makeSupplier, seededCategories } from './engine-fixtures'

const categories = seededCategories()
const outlets = [
  { id: 'out-1', name: 'Cubao' },
  { id: 'out-2', name: 'Marikina' },
]
const supplier = makeSupplier({ id: 'sup-1', name: 'Petron LPG Center', tin: '123456789000' })

describe('buildExportRows', () => {
  it('lays out the accountant columns in order', () => {
    expect(EXPORT_COLUMNS).toEqual([
      'Date',
      'Branch',
      'Category',
      'P&L line',
      'Paid to',
      'TIN',
      'Doc type',
      'Invoice no.',
      'Gross',
      'VATable',
      'Input VAT',
      'EWT rate',
      'EWT',
      'Net paid',
      'Paid from',
      'Status',
      'Void reason',
      'Recorded by',
      'Receipt',
      'Notes',
    ])
  })

  it('writes one row per expense with VAT and EWT split out', () => {
    const expense = makeExpense({
      spentOn: '2026-10-05',
      outletId: 'out-1',
      categoryId: 'cat-rent',
      supplierId: 'sup-1',
      docType: 'vat_invoice',
      invoiceNo: 'SI-0042',
      amountCents: 1_500_000,
      vatCents: 160_714,
      ewtCents: 75_000,
      ewtRate: 5,
      paidFrom: 'bank',
      receiptCount: 2,
      note: 'October rent',
      createdByName: 'Owner',
    })
    const [row] = buildExportRows([expense], categories, [supplier], outlets)
    expect(Object.keys(row)).toEqual(EXPORT_COLUMNS)
    expect(row).toEqual({
      Date: '2026-10-05',
      Branch: 'Cubao',
      Category: 'Rent (Upa)',
      'P&L line': 'Occupancy',
      'Paid to': 'Petron LPG Center',
      TIN: '123456789000',
      'Doc type': 'VAT invoice',
      'Invoice no.': 'SI-0042',
      Gross: '15000.00',
      VATable: '13392.86',
      'Input VAT': '1607.14',
      'EWT rate': '5',
      EWT: '750.00',
      'Net paid': '14250.00',
      'Paid from': 'Bank',
      Status: 'Recorded',
      'Void reason': '',
      'Recorded by': 'Owner',
      Receipt: 'yes',
      Notes: 'October rent',
    })
  })

  it('leaves VAT columns blank when VAT was not recorded, and fills the rest sensibly', () => {
    const expense = makeExpense({
      categoryId: 'cat-ice',
      paidToName: 'Yelo ni Mang Ben',
      supplierTin: '987654321',
      paidFrom: 'drawer',
      status: 'void',
      voidReason: 'wrong amount',
      voidedAt: '2026-10-21T03:00:00Z',
      amountCents: 12_050,
    })
    const [row] = buildExportRows([expense], categories, [], outlets)
    expect(row).toMatchObject({
      Branch: 'Store-wide',
      'P&L line': 'Cost of sales (ingredients)',
      'Paid to': 'Yelo ni Mang Ben',
      TIN: '987654321',
      'Doc type': '',
      Gross: '120.50',
      VATable: '',
      'Input VAT': '',
      'EWT rate': '',
      EWT: '',
      'Net paid': '120.50',
      'Paid from': 'Cash drawer',
      Status: 'Void',
      'Void reason': 'wrong amount',
      Receipt: 'no',
    })
  })

  it('a zero VAT is a real VAT figure: VATable is the whole amount', () => {
    const [row] = buildExportRows([makeExpense({ amountCents: 10_000, vatCents: 0 })], categories, [], outlets)
    expect(row).toMatchObject({ VATable: '100.00', 'Input VAT': '0.00' })
  })

  it('prefers the TIN typed on the expense over the supplier record; tolerates missing lookups', () => {
    const expense = makeExpense({ supplierId: 'sup-1', supplierTin: '111222333', categoryId: 'cat-nowhere', outletId: 'out-9' })
    const [row] = buildExportRows([expense], categories, [supplier], outlets)
    expect(row).toMatchObject({ TIN: '111222333', Category: '', 'P&L line': '', Branch: '' })
    const unknownSupplier = makeExpense({ supplierId: 'sup-x', paidToName: 'Typed name' })
    expect(buildExportRows([unknownSupplier], categories, [supplier], outlets)[0]['Paid to']).toBe('Typed name')
  })

  it('sorts by date, then time recorded, without touching the input', () => {
    const input = [
      makeExpense({ id: 'late', spentOn: '2026-10-02', createdAt: '2026-10-02T05:00:00Z' }),
      makeExpense({ id: 'early', spentOn: '2026-10-02', createdAt: '2026-10-02T01:00:00Z' }),
      makeExpense({ id: 'first', spentOn: '2026-10-01', createdAt: '2026-10-03T01:00:00Z', note: 'a' }),
    ]
    const notes = buildExportRows(input, categories, [], outlets).map((r) => r.Notes)
    expect(notes[0]).toBe('a')
    expect(input.map((e) => e.id)).toEqual(['late', 'early', 'first'])
  })

  it('labels every paid-from and doc type', () => {
    const paidFrom = ['drawer', 'cash', 'gcash', 'maya', 'bank', 'card', 'owner'] as const
    const rows = buildExportRows(
      paidFrom.map((p) => makeExpense({ paidFrom: p })),
      categories,
      [],
      outlets,
    )
    expect(rows.map((r) => r['Paid from'])).toEqual(['Cash drawer', 'Cash on hand', 'GCash', 'Maya', 'Bank', 'Card', "Owner's pocket"])
    const docs = (['vat_invoice', 'non_vat_invoice', 'acknowledgement', 'none'] as const).map((docType) =>
      buildExportRows([makeExpense({ docType })], categories, [], outlets)[0]['Doc type'],
    )
    expect(docs).toEqual(['VAT invoice', 'Non-VAT invoice', 'Acknowledgement receipt', 'None'])
  })
})

describe('exportRowsToCsv', () => {
  it('writes BOM, header, CRLF and guards typed text against formulas', () => {
    const rows = buildExportRows([makeExpense({ note: '=HYPERLINK("x")', paidToName: 'Ñora, Inc.' })], categories, [], outlets)
    const csv = exportRowsToCsv(rows)
    expect(csv.startsWith('﻿Date,Branch,Category,P&L line,')).toBe(true)
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
    expect(csv).toContain('"Ñora, Inc."')
    expect(csv.split('\r\n')).toHaveLength(3)
  })
})

describe('buildMonthlySummary', () => {
  it('totals recorded rows by month × category × branch, not-an-expense apart', () => {
    const custom = makeCategory({ id: 'cat-custom', name: 'Zz custom', group: 'operating', sortOrder: 999 })
    const all = [...categories, custom]
    const expenses = [
      makeExpense({ categoryId: 'cat-ice', amountCents: 12_000, outletId: 'out-1', spentOn: '2026-10-01' }),
      makeExpense({ categoryId: 'cat-ice', amountCents: 13_000, outletId: 'out-1', spentOn: '2026-10-20' }),
      makeExpense({ categoryId: 'cat-ice', amountCents: 9_000, outletId: 'out-2', spentOn: '2026-10-20' }),
      makeExpense({ categoryId: 'cat-ice', amountCents: 5_000, outletId: 'out-1', spentOn: '2026-09-30' }),
      makeExpense({ categoryId: 'cat-rent', amountCents: 1_500_000, outletId: null, spentOn: '2026-10-05' }),
      makeExpense({ categoryId: 'cat-custom', amountCents: 100, outletId: null, spentOn: '2026-10-05' }),
      makeExpense({ categoryId: 'cat-owner_draw', amountCents: 200_000, outletId: 'out-1', spentOn: '2026-10-06' }),
      makeExpense({ categoryId: 'cat-ice', amountCents: 99_999, status: 'void', voidReason: 'x', voidedAt: '2026-10-21T00:00:00Z' }),
    ]
    const summary = buildMonthlySummary(expenses, all, outlets)
    expect(summary.expenseRows.map((r) => [r.month, r.category, r.branch, r.totalCents, r.count, r.total])).toEqual([
      ['2026-09', 'Ice (Yelo)', 'Cubao', 5_000, 1, '50.00'],
      ['2026-10', 'Ice (Yelo)', 'Cubao', 25_000, 2, '250.00'],
      ['2026-10', 'Ice (Yelo)', 'Marikina', 9_000, 1, '90.00'],
      ['2026-10', 'Rent (Upa)', 'Store-wide', 1_500_000, 1, '15000.00'],
      ['2026-10', 'Zz custom', 'Store-wide', 100, 1, '1.00'],
    ])
    expect(summary.expenseRows[0]).toMatchObject({ categoryId: 'cat-ice', group: 'ingredients', plLine: 'Cost of sales (ingredients)', branchId: 'out-1' })
    expect(summary.notExpenseRows.map((r) => [r.category, r.totalCents])).toEqual([['Owner took cash (Kinuha ng may-ari)', 200_000]])
    expect(summary.expenseTotalCents).toBe(5_000 + 25_000 + 9_000 + 1_500_000 + 100)
    expect(summary.notExpenseTotalCents).toBe(200_000)
  })

  it('writes the summary as CSV with not-an-expense rows after a blank line', () => {
    const summary = buildMonthlySummary(
      [makeExpense({ categoryId: 'cat-ice' }), makeExpense({ categoryId: 'cat-bank_deposit', amountCents: 500_000 })],
      categories,
      outlets,
    )
    const csv = monthlySummaryToCsv(summary)
    const lines = csv.slice(1).split('\r\n')
    expect(lines[0]).toBe(MONTHLY_SUMMARY_COLUMNS.join(','))
    expect(lines).toContain('2026-10,Ice (Yelo),Cost of sales (ingredients),Store-wide,1,120.00')
    expect(lines).toContain('Total expenses,,,,1,120.00')
    expect(lines).toContain('2026-10,Bank deposit,Not an expense (cash flow only),Store-wide,1,5000.00')
    expect(lines).toContain('Total not an expense,,,,1,5000.00')
  })
})
