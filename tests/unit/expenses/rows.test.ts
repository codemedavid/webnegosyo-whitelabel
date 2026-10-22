import {
  categoryToRow,
  detailsUpdateToRow,
  expenseDraftToInsert,
  receiptCountOf,
  replacePatchToJson,
  supplierToRow,
  toExpense,
  toExpenseCategory,
  toExpenseReceipt,
  toInt,
  toSupplier,
  toUnsortedPayout,
} from '@/lib/expenses/rows'
import { expenseRow } from './expense-row.fixture'

const TENANT = 'tenant-1'
const NOW = '2026-10-21T02:00:00.000Z'


describe('toInt', () => {
  it('reads bigint numbers and strings exactly', () => {
    expect(toInt(125_000)).toBe(125_000)
    expect(toInt('1000000000')).toBe(1_000_000_000)
    expect(toInt('12.5')).toBe(0)
    expect(toInt(null)).toBe(0)
  })
})

describe('toExpense', () => {
  it('maps every column and the embedded receipt count', () => {
    const expense = toExpense(expenseRow({ vat_cents: '13392', ewt_rate: '1.00', expense_receipts: [{ count: 2 }] }))
    expect(expense).toMatchObject({
      id: 'exp-1',
      tenantId: TENANT,
      categoryId: 'cat-lpg',
      amountCents: 125_000,
      paidFrom: 'cash',
      vatCents: 13_392,
      ewtCents: null,
      ewtRate: 1,
      createdByName: 'Ana',
      receiptCount: 2,
      status: 'recorded',
    })
  })

  it('takes an explicit receipt count over the embed, and 0 when neither exists', () => {
    expect(toExpense(expenseRow({ expense_receipts: [{ count: 2 }] }), 5).receiptCount).toBe(5)
    expect(toExpense(expenseRow()).receiptCount).toBe(0)
    expect(receiptCountOf([])).toBe(0)
  })
})

describe('category, supplier, receipt, payout', () => {
  it('maps a category', () => {
    expect(
      toExpenseCategory({
        id: 'c', tenant_id: TENANT, system_key: 'lpg', name: 'Gas / LPG', icon: 'LP', grp: 'utilities',
        needs_note: false, sort_order: 110, archived_at: null,
      }),
    ).toEqual({
      id: 'c', tenantId: TENANT, systemKey: 'lpg', name: 'Gas / LPG', icon: 'LP', group: 'utilities',
      needsNote: false, sortOrder: 110, archivedAt: null,
    })
  })

  it('maps a supplier', () => {
    expect(
      toSupplier({
        id: 's', tenant_id: TENANT, name: 'Meralco', kind: 'utility', tin: null, default_category_id: 'c',
        phone: null, note: null, archived_at: null,
      }),
    ).toMatchObject({ name: 'Meralco', kind: 'utility', defaultCategoryId: 'c' })
  })

  it('maps a receipt without its object path', () => {
    const receipt = toExpenseReceipt({ id: 'r', expense_id: 'e', mime: 'image/jpeg', bytes: '2048', uploaded_by: 'u', created_at: NOW })
    expect(receipt).toEqual({ id: 'r', expenseId: 'e', mime: 'image/jpeg', bytes: 2048, uploadedBy: 'u', createdAt: NOW })
  })

  it('reads a pay-out amount (numeric pesos) to the centavo', () => {
    const payout = toUnsortedPayout({
      id: 'm', shift_id: 'sh', outlet_id: null, amount: '1250.10', reason: null, recorded_by_name: 'Ben', created_at: NOW,
    })
    expect(payout).toEqual({
      movementId: 'm', shiftId: 'sh', outletId: null, amountCents: 125_010, reason: '', recordedByName: 'Ben', createdAt: NOW,
    })
  })
})

describe('writes', () => {
  it('builds an insert without the stamped columns, and leaves unsent keys out', () => {
    const row = expenseDraftToInsert(
      {
        amountCents: 50_000, categoryId: 'c', spentOn: '2026-10-21', paidFrom: 'gcash', outletId: 'o',
        clientRequestId: 'req', note: null, vatCents: 5_357,
      },
      { tenantId: TENANT, createdByName: 'Ana' },
    )
    expect(row).toEqual({
      tenant_id: TENANT, outlet_id: 'o', category_id: 'c', amount_cents: 50_000, spent_on: '2026-10-21',
      paid_from: 'gcash', client_request_id: 'req', created_by_name: 'Ana', note: null, vat_cents: 5_357,
    })
    expect(row).not.toHaveProperty('status')
    expect(row).not.toHaveProperty('created_by')
  })

  it('updates editable fields only and stamps updated_at', () => {
    expect(detailsUpdateToRow({ expenseId: 'e', invoiceNo: 'SI-1', form2307Given: true }, NOW)).toEqual({
      invoice_no: 'SI-1', form_2307_given: true, updated_at: NOW,
    })
  })

  it('turns a replace patch into contract keys', () => {
    expect(replacePatchToJson({ amountCents: 99_00, categoryId: 'c2', note: null })).toEqual({
      amount_cents: 99_00, category_id: 'c2', note: null,
    })
  })

  it('maps a category and a supplier save', () => {
    expect(categoryToRow({ name: 'Ice', group: 'ingredients', icon: 'IC', needsNote: false })).toEqual({
      name: 'Ice', grp: 'ingredients', icon: 'IC', needs_note: false,
    })
    expect(supplierToRow({ name: 'Meralco', kind: 'utility', tin: '000101528000', archived: true }, NOW)).toEqual({
      name: 'Meralco', kind: 'utility', tin: '000101528000', archived_at: NOW,
    })
  })
})
