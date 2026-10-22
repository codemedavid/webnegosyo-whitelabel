import {
  categorySaveSchema,
  dateWindowSchema,
  drawerExpenseDraftSchema,
  expenseDetailsUpdateSchema,
  expenseDraftSchema,
  expenseListFilterSchema,
  normalizeTin,
  replaceExpenseSchema,
  replacePatchSchema,
  sortDrawerPayoutSchema,
  spentOnProblem,
  supplierSaveSchema,
  voidExpenseSchema,
} from '@/lib/expenses/validation'

const CATEGORY = '11111111-1111-4111-8111-111111111111'
const REQUEST = '22222222-2222-4222-8222-222222222222'
const EXPENSE = '33333333-3333-4333-8333-333333333333'
const SHIFT = '44444444-4444-4444-8444-444444444444'
// 2026-10-21 10:00 in Manila.
const NOW = Date.parse('2026-10-21T02:00:00Z')

const draft = {
  amountCents: 125_000,
  categoryId: CATEGORY,
  spentOn: '2026-10-21',
  paidFrom: 'cash',
  outletId: null,
  clientRequestId: REQUEST,
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(NOW)
})
afterEach(() => jest.useRealTimers())

describe('spentOnProblem', () => {
  it('uses the Manila date, not the UTC one', () => {
    // 23:30 UTC on the 21st is already the 22nd in Manila: the 23rd is only one day ahead.
    expect(spentOnProblem('2026-10-23', Date.parse('2026-10-21T16:30:00Z'))).toBeNull()
  })

  it('accepts today, tomorrow (clock tolerance) and 400 days back', () => {
    expect(spentOnProblem('2026-10-21', NOW)).toBeNull()
    expect(spentOnProblem('2026-10-22', NOW)).toBeNull()
    expect(spentOnProblem('2025-09-16', NOW)).toBeNull()
  })

  it('refuses two days ahead, 401 days back and impossible dates', () => {
    expect(spentOnProblem('2026-10-23', NOW)).toMatch(/future/)
    expect(spentOnProblem('2025-09-15', NOW)).toMatch(/400 days/)
    expect(spentOnProblem('2026-02-30', NOW)).toMatch(/valid date/)
    expect(spentOnProblem('21/10/2026', NOW)).toMatch(/valid date/)
  })
})

describe('expenseDraftSchema', () => {
  it('accepts a minimal cash expense and nulls blank text', () => {
    const parsed = expenseDraftSchema.parse({ ...draft, note: '   ', paidToName: ' Aling Nena ' })
    expect(parsed.note).toBeNull()
    expect(parsed.paidToName).toBe('Aling Nena')
  })

  it.each([
    [{ amountCents: 0 }],
    [{ amountCents: 12.5 }],
    [{ amountCents: 1_000_000_001 }],
    [{ paidFrom: 'drawer' }],
    [{ paidFrom: 'crypto' }],
    [{ categoryId: 'nope' }],
    [{ spentOn: '2026-10-25' }],
    [{ clientRequestId: undefined }],
    [{ note: 'x'.repeat(201) }],
    [{ tenantId: CATEGORY }],
  ])('refuses %j', (override) => {
    expect(expenseDraftSchema.safeParse({ ...draft, ...override }).success).toBe(false)
  })

  it('keeps VAT and withholding below the amount', () => {
    expect(expenseDraftSchema.safeParse({ ...draft, vatCents: 13_392, ewtCents: 1_250 }).success).toBe(true)
    const vat = expenseDraftSchema.safeParse({ ...draft, vatCents: 125_000 })
    expect(vat.success).toBe(false)
    expect(vat.error?.issues[0].message).toBe('VAT must be less than the amount.')
    expect(expenseDraftSchema.safeParse({ ...draft, ewtCents: 200_000 }).success).toBe(false)
  })

  it('normalizes a typed TIN and refuses a short one', () => {
    expect(expenseDraftSchema.parse({ ...draft, supplierTin: '123-456-789-000' }).supplierTin).toBe('123456789000')
    expect(expenseDraftSchema.parse({ ...draft, supplierTin: '' }).supplierTin).toBeNull()
    expect(expenseDraftSchema.safeParse({ ...draft, supplierTin: '1234-5678' }).success).toBe(false)
  })
})

describe('drawerExpenseDraftSchema', () => {
  it('needs a shift and a request id', () => {
    const base = { shiftId: SHIFT, amountCents: 5_000, categoryId: CATEGORY, clientRequestId: REQUEST }
    expect(drawerExpenseDraftSchema.safeParse(base).success).toBe(true)
    expect(drawerExpenseDraftSchema.safeParse({ ...base, shiftId: undefined }).success).toBe(false)
    expect(drawerExpenseDraftSchema.safeParse({ ...base, spentOn: '2026-10-21' }).success).toBe(false)
  })
})

describe('void and replace', () => {
  it('needs a reason of 1–200 characters', () => {
    expect(voidExpenseSchema.safeParse({ expenseId: EXPENSE, reason: 'wrong category' }).success).toBe(true)
    expect(voidExpenseSchema.safeParse({ expenseId: EXPENSE, reason: '   ' }).success).toBe(false)
    expect(voidExpenseSchema.safeParse({ expenseId: EXPENSE, reason: 'x'.repeat(201) }).success).toBe(false)
  })

  it('accepts a patch of patchable keys only, and at least one', () => {
    expect(replacePatchSchema.safeParse({ amountCents: 99_00 }).success).toBe(true)
    expect(replacePatchSchema.safeParse({}).success).toBe(false)
    expect(replacePatchSchema.safeParse({ status: 'recorded' }).success).toBe(false)
    expect(replacePatchSchema.safeParse({ paidFrom: 'drawer' }).success).toBe(false)
    expect(replacePatchSchema.safeParse({ amountCents: 100, vatCents: 100 }).success).toBe(false)
  })

  it('wraps the patch with the expense and the reason', () => {
    const parsed = replaceExpenseSchema.parse({ expenseId: EXPENSE, reason: ' typo ', patch: { note: 'LPG 11kg' } })
    expect(parsed).toEqual({ expenseId: EXPENSE, reason: 'typo', patch: { note: 'LPG 11kg' } })
  })
})

describe('expenseDetailsUpdateSchema', () => {
  it('allows only editable fields, and at least one', () => {
    expect(expenseDetailsUpdateSchema.safeParse({ expenseId: EXPENSE, invoiceNo: 'SI-0042' }).success).toBe(true)
    expect(expenseDetailsUpdateSchema.safeParse({ expenseId: EXPENSE }).success).toBe(false)
    expect(expenseDetailsUpdateSchema.safeParse({ expenseId: EXPENSE, amountCents: 100 }).success).toBe(false)
    expect(expenseDetailsUpdateSchema.safeParse({ expenseId: EXPENSE, ewtRate: 101 }).success).toBe(false)
  })

  it('refuses the stock answer, VAT and withholding in place (they go through Fix)', () => {
    for (const field of [{ isStockPurchase: true }, { vatCents: 100 }, { ewtCents: 100 }, { ewtRate: 1 }]) {
      expect(expenseDetailsUpdateSchema.safeParse({ expenseId: EXPENSE, ...field }).success).toBe(false)
    }
  })

  it('lets Fix change the stock answer, VAT and withholding', () => {
    expect(replacePatchSchema.safeParse({ isStockPurchase: true, vatCents: 100, ewtCents: 50, ewtRate: 1 }).success).toBe(true)
  })
})

describe('sortDrawerPayoutSchema', () => {
  it('needs the movement and a category', () => {
    expect(sortDrawerPayoutSchema.safeParse({ movementId: SHIFT, categoryId: CATEGORY }).success).toBe(true)
    expect(sortDrawerPayoutSchema.safeParse({ movementId: SHIFT }).success).toBe(false)
  })
})

describe('categorySaveSchema', () => {
  it('trims the name and bounds name and badge', () => {
    expect(categorySaveSchema.parse({ name: '  Gas / LPG ', group: 'utilities' }).name).toBe('Gas / LPG')
    expect(categorySaveSchema.safeParse({ name: '', group: 'utilities' }).success).toBe(false)
    expect(categorySaveSchema.safeParse({ name: 'x'.repeat(61), group: 'utilities' }).success).toBe(false)
    expect(categorySaveSchema.safeParse({ name: 'Gas', group: 'utilities', icon: 'TOOLONGXX' }).success).toBe(false)
    expect(categorySaveSchema.safeParse({ name: 'Gas', group: 'fun' }).success).toBe(false)
  })
})

describe('supplierSaveSchema', () => {
  it('normalizes the TIN and bounds the name', () => {
    expect(supplierSaveSchema.parse({ name: 'Meralco', kind: 'utility', tin: '000 101 528 000' }).tin).toBe('000101528000')
    expect(supplierSaveSchema.safeParse({ name: 'Meralco', tin: '12345' }).success).toBe(false)
    expect(supplierSaveSchema.safeParse({ name: 'x'.repeat(81) }).success).toBe(false)
    expect(supplierSaveSchema.safeParse({ name: 'Meralco', kind: 'friend' }).success).toBe(false)
  })
})

describe('normalizeTin', () => {
  it('strips spaces and dashes only', () => {
    expect(normalizeTin(' 123-456 789 ')).toBe('123456789')
  })
})

describe('read windows', () => {
  it('accepts up to 400 days and refuses reversed or longer windows', () => {
    expect(dateWindowSchema.safeParse({ from: '2025-09-16', to: '2026-10-21' }).success).toBe(true)
    expect(dateWindowSchema.safeParse({ from: '2025-09-15', to: '2026-10-21' }).success).toBe(false)
    expect(dateWindowSchema.safeParse({ from: '2026-10-21', to: '2026-10-20' }).success).toBe(false)
  })

  it('validates list filters', () => {
    expect(expenseListFilterSchema.safeParse({ from: '2026-10-01', to: '2026-10-21', status: 'all' }).success).toBe(true)
    expect(expenseListFilterSchema.safeParse({ from: '2026-10-01', to: '2026-10-21', paidFrom: 'cheque' }).success).toBe(false)
  })
})
