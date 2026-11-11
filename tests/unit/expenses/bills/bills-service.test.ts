/**
 * Bills to pay — web service, reads and validation (bills-contract §4), over a
 * scripted session client. RLS refusals are silent, so the "no row back"
 * cases are the ones that matter most.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { EXPENSE_MESSAGES } from '@/lib/expenses/errors'
import { addDays, todayInManila } from '@/lib/expenses/manila-date'
import { expenseRow } from '../expense-row.fixture'

const TENANT = 'tenant-1'
const BILL = '55555555-5555-4555-8555-555555555555'
const EXPENSE = '33333333-3333-4333-8333-333333333333'
const CATEGORY = '11111111-1111-4111-8111-111111111111'

interface Settled {
  data: unknown
  error: { code?: string; message: string } | null
  count?: number | null
}

interface Call {
  table: string
  method: string
  args: unknown[]
}

const BUILDER_METHODS = ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'is', 'not', 'gte', 'lte', 'order', 'limit', 'range']

/** Every builder call is recorded; awaiting settles to the next queued answer for that table. */
function scriptedClient(answers: Record<string, Settled[]>) {
  const calls: Call[] = []
  const from = (table: string) => {
    const builder: Record<string, unknown> = {}
    for (const method of BUILDER_METHODS) {
      builder[method] = (...args: unknown[]) => {
        calls.push({ table, method, args })
        return builder
      }
    }
    const next = () => answers[table]?.shift() ?? { data: [], error: null }
    builder.maybeSingle = async () => {
      const answer = next()
      return { ...answer, data: Array.isArray(answer.data) ? (answer.data[0] ?? null) : answer.data }
    }
    builder.then = (resolve: (value: Settled) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(next()).then(resolve, reject)
    return builder
  }
  return { client: { from, rpc: jest.fn() } as unknown as SupabaseClient, calls }
}

function billRow(overrides: Record<string, unknown> = {}) {
  return {
    id: BILL,
    tenant_id: TENANT,
    outlet_id: null,
    name: 'Rent',
    category_id: CATEGORY,
    supplier_id: null,
    paid_to_name: 'Aling Nena',
    paid_from: 'bank',
    amount_cents: '1500000',
    repeat_kind: 'monthly',
    repeat_every: 1,
    repeat_days: [0],
    repeat_weekday: null,
    starts_on: '2026-10-01',
    ends_on: null,
    remind_days_before: 3,
    status: 'active',
    paused_until: null,
    paused_on: null,
    created_at: '2026-10-22T01:00:00.000Z',
    ...overrides,
  }
}

const today = todayInManila(new Date())

function draft(overrides: Record<string, unknown> = {}) {
  return {
    name: '  Rent  ',
    categoryId: CATEGORY,
    outletId: null,
    paidToName: ' Aling Nena ',
    paidFrom: 'bank',
    amountCents: 1_500_000,
    rule: { kind: 'monthly', day: 'last' },
    startsOn: today,
    endsOn: null,
    remindDaysBefore: 3,
    ...overrides,
  }
}

const loadService = () => import('@/lib/expenses/bills/bills-service')
const loadRead = () => import('@/lib/expenses/bills/bills-read')
const loadValidation = () => import('@/lib/expenses/bills/validation')

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => undefined))
afterEach(() => jest.restoreAllMocks())

describe('billDraftSchema', () => {
  it('accepts a monthly bill and trims its words', async () => {
    const { billDraftSchema } = await loadValidation()
    const parsed = billDraftSchema.parse(draft())
    expect(parsed).toMatchObject({ name: 'Rent', paidToName: 'Aling Nena', rule: { kind: 'monthly', day: 'last' } })
  })

  it.each([
    [{ rule: { kind: 'monthly', day: 32 } }, 'a day past 31'],
    [{ rule: { kind: 'weekly', every: 3, weekday: 1 } }, 'every 3 weeks'],
    [{ rule: { kind: 'months', every: 5, day: 10 } }, 'every 5 months'],
    [{ rule: { kind: 'after_days', every: 91 } }, 'after 91 days'],
    [{ rule: { kind: 'monthly', day: 5, extra: true } }, 'an unknown rule key'],
    [{ paidFrom: 'drawer' }, 'paid from the drawer'],
    [{ amountCents: 0 }, 'a zero amount'],
    [{ remindDaysBefore: 15 }, 'a reminder 15 days ahead'],
    [{ startsOn: addDays(today, -401) }, 'a start more than 400 days back'],
    [{ endsOn: addDays(today, -1) }, 'an end before the start'],
    [{ name: '   ' }, 'a blank name'],
    [{ surprise: 1 }, 'an unknown key'],
  ] as [Record<string, unknown>, string][])('refuses %j (%s)', async (overrides) => {
    const { billDraftSchema } = await loadValidation()
    expect(billDraftSchema.safeParse(draft(overrides)).success).toBe(false)
  })

  it("speaks the engine's words", async () => {
    const { billDraftSchema } = await loadValidation()
    const result = billDraftSchema.safeParse(draft({ name: '  ' }))
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.message).toBe('Give the bill a name.')
  })

  it('accepts "changes every time" (no amount)', async () => {
    const { billDraftSchema } = await loadValidation()
    expect(billDraftSchema.safeParse(draft({ amountCents: null, rule: { kind: 'after_days', every: 10 } })).success).toBe(true)
  })
})

describe('billPauseSchema (L7)', () => {
  it('pauses until a day still ahead, or until resumed', async () => {
    const { billPauseSchema } = await loadValidation()
    expect(billPauseSchema.safeParse({ billId: BILL, pausedUntil: addDays(today, 1) }).success).toBe(true)
    expect(billPauseSchema.safeParse({ billId: BILL, pausedUntil: null }).success).toBe(true)
    expect(billPauseSchema.safeParse({ billId: BILL }).success).toBe(true)
  })

  it.each([
    [0, 'today'],
    [-1, 'yesterday'],
  ])('refuses a pause that ends %s', async (offset) => {
    const { billPauseSchema } = await loadValidation()
    const result = billPauseSchema.safeParse({ billId: BILL, pausedUntil: addDays(today, offset as number) })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.message).toBe('Pick a day after today.')
  })
})

describe('billMarkSchema', () => {
  it('needs a reminder date to snooze, and none to skip', async () => {
    const { billMarkSchema } = await loadValidation()
    const base = { billId: BILL, dueOn: '2026-10-31' }
    expect(billMarkSchema.safeParse({ ...base, kind: 'snoozed' }).success).toBe(false)
    expect(billMarkSchema.safeParse({ ...base, kind: 'snoozed', snoozedUntil: '2026-11-01' }).success).toBe(true)
    expect(billMarkSchema.safeParse({ ...base, kind: 'skipped', snoozedUntil: '2026-11-01' }).success).toBe(false)
    expect(billMarkSchema.safeParse({ ...base, kind: 'skipped' }).success).toBe(true)
  })
})

describe('expenseDraftSchema bill link', () => {
  const expense = {
    amountCents: 1_500_000,
    categoryId: CATEGORY,
    spentOn: today,
    paidFrom: 'bank',
    outletId: null,
    clientRequestId: '44444444-4444-4444-8444-444444444444',
  }

  it('takes both bill fields or neither', async () => {
    const { expenseDraftSchema } = await import('@/lib/expenses/validation')
    expect(expenseDraftSchema.safeParse(expense).success).toBe(true)
    expect(expenseDraftSchema.safeParse({ ...expense, billId: BILL, billDueOn: '2026-10-31' }).success).toBe(true)
    expect(expenseDraftSchema.safeParse({ ...expense, billId: BILL }).success).toBe(false)
    expect(expenseDraftSchema.safeParse({ ...expense, billDueOn: '2026-10-31' }).success).toBe(false)
    expect(expenseDraftSchema.safeParse({ ...expense, billId: 'nope', billDueOn: '2026-10-31' }).success).toBe(false)
    expect(expenseDraftSchema.safeParse({ ...expense, billId: BILL, billDueOn: '2026-02-30' }).success).toBe(false)
  })

  it('records a payment with bill_id + bill_due_on', async () => {
    const { recordExpense } = await import('@/lib/expenses/expense-service')
    const db = scriptedClient({ expenses: [{ data: [expenseRow({ bill_id: BILL, bill_due_on: '2026-10-31' })], error: null }] })
    const saved = await recordExpense(db.client, TENANT, { ...expense, paidFrom: 'bank', billId: BILL, billDueOn: '2026-10-31' }, { displayName: 'Ana' })
    expect(saved).toMatchObject({ billId: BILL, billDueOn: '2026-10-31' })
    expect(db.calls.find((call) => call.method === 'insert')?.args[0]).toMatchObject({ bill_id: BILL, bill_due_on: '2026-10-31' })
  })
})

describe('bills', () => {
  it('creates a bill with the rule as columns', async () => {
    const [{ createBill }, { billDraftSchema }] = await Promise.all([loadService(), loadValidation()])
    const db = scriptedClient({ expense_bills: [{ data: [billRow()], error: null }] })

    const bill = await createBill(db.client, TENANT, billDraftSchema.parse(draft()))

    expect(bill).toMatchObject({ id: BILL, amountCents: 1_500_000, rule: { kind: 'monthly', day: 'last' }, paidFrom: 'bank' })
    expect(db.calls.find((call) => call.method === 'insert')?.args[0]).toMatchObject({
      tenant_id: TENANT,
      name: 'Rent',
      repeat_kind: 'monthly',
      repeat_every: 1,
      repeat_days: [0],
      repeat_weekday: null,
      amount_cents: 1_500_000,
    })
  })

  it('treats an insert that returns no row as refused', async () => {
    const [{ createBill }, { billDraftSchema }] = await Promise.all([loadService(), loadValidation()])
    const db = scriptedClient({ expense_bills: [{ data: [], error: null }] })
    await expect(createBill(db.client, TENANT, billDraftSchema.parse(draft()))).rejects.toThrow(EXPENSE_MESSAGES.noAccess)
  })

  it('says the bill is gone when an edit matches nothing', async () => {
    const { pauseBill } = await loadService()
    const db = scriptedClient({ expense_bills: [{ data: [], error: null }] })
    await expect(pauseBill(db.client, TENANT, { billId: BILL })).rejects.toThrow(EXPENSE_MESSAGES.billGone)
  })

  it('pauses and ends with the status columns only (the database stamps paused_on)', async () => {
    const { pauseBill, endBill } = await loadService()
    const db = scriptedClient({
      expense_bills: [
        { data: [billRow({ status: 'paused', paused_until: '2026-12-01', paused_on: '2026-10-22' })], error: null },
        { data: [billRow({ status: 'ended' })], error: null },
      ],
    })
    const paused = await pauseBill(db.client, TENANT, { billId: BILL, pausedUntil: '2026-12-01' })
    expect(paused).toMatchObject({ status: 'paused', pausedUntil: '2026-12-01', pausedOn: '2026-10-22' })
    expect((await endBill(db.client, TENANT, { billId: BILL })).status).toBe('ended')
    expect(db.calls.filter((call) => call.method === 'update').map((call) => call.args[0])).toEqual([
      { status: 'paused', paused_until: '2026-12-01' },
      { status: 'ended', paused_until: null },
    ])
  })

  it('resumes from the next due date on, so the paused months never come back as late (H2)', async () => {
    const { resumeBill } = await loadService()
    const paused = billRow({ status: 'paused', paused_on: '2026-08-20', repeat_days: [5], starts_on: '2026-08-01' })
    const db = scriptedClient({
      expense_bills: [{ data: [paused], error: null }, { data: [billRow({ repeat_days: [5], starts_on: '2026-11-05' })], error: null }],
    })
    const bill = await resumeBill(db.client, TENANT, { billId: BILL }, '2026-10-22')
    expect(bill.status).toBe('active')
    expect(db.calls.filter((call) => call.method === 'update').map((call) => call.args[0])).toEqual([
      { status: 'active', paused_until: null, starts_on: '2026-11-05' },
    ])
  })

  it('resuming a bill that is gone says so', async () => {
    const { resumeBill } = await loadService()
    const db = scriptedClient({ expense_bills: [{ data: null, error: null }] })
    await expect(resumeBill(db.client, TENANT, { billId: BILL }, '2026-10-22')).rejects.toThrow(EXPENSE_MESSAGES.billGone)
  })

  it('resuming a bill with no due date left before its end date asks for a later end date', async () => {
    const { resumeBill } = await loadService()
    const db = scriptedClient({
      expense_bills: [{ data: [billRow({ status: 'paused', repeat_days: [5], starts_on: '2026-08-01', ends_on: '2026-10-31' })], error: null }],
    })
    await expect(resumeBill(db.client, TENANT, { billId: BILL }, '2026-10-22')).rejects.toThrow(EXPENSE_MESSAGES.billNoDueLeft)
    expect(db.calls.some((call) => call.method === 'update')).toBe(false)
  })

  describe('updateBill (H1, L1)', () => {
    const update = async (stored: Record<string, unknown>, draftOverrides: Record<string, unknown>, extra: Record<string, Settled[]> = {}) => {
      const [{ updateBill }, { billUpdateSchema }] = await Promise.all([loadService(), loadValidation()])
      const db = scriptedClient({
        expense_bills: [{ data: [stored], error: null }, { data: [billRow()], error: null }],
        ...extra,
      })
      const input = billUpdateSchema.parse({ billId: BILL, draft: draft(draftOverrides) })
      const run = () => updateBill(db.client, TENANT, input, '2026-10-22')
      return { db, run, written: () => db.calls.find((call) => call.method === 'update')?.args[0] as Record<string, unknown> }
    }

    it('moving rent from the 1st to the 5th starts at the next 5th: no month turns late', async () => {
      const stored = billRow({ repeat_days: [1], starts_on: '2026-08-01' })
      const { db, run, written } = await update(stored, { rule: { kind: 'monthly', day: 5 }, startsOn: '2026-08-01' }, {
        expenses: [{ data: [{ id: EXPENSE, bill_id: BILL, bill_due_on: '2026-10-01', amount_cents: '1500000', spent_on: '2026-10-01' }], error: null }],
        expense_bill_marks: [{ data: [], error: null }],
      })
      await run()
      expect(written()).toMatchObject({ repeat_days: [5], starts_on: '2026-11-05' })
      // The settlement reads are bounded: one row each, newest first.
      const limits = db.calls.filter((call) => call.method === 'limit').map((call) => [call.table, call.args[0]])
      expect(limits).toEqual([['expenses', 1], ['expense_bill_marks', 1]])
    })

    it('starts after a due date already paid ahead', async () => {
      const stored = billRow({ repeat_days: [1], starts_on: '2026-08-01' })
      const { run, written } = await update(stored, { rule: { kind: 'monthly', day: 5 }, startsOn: '2026-08-01' }, {
        expenses: [{ data: [], error: null }],
        expense_bill_marks: [{ data: [{ id: 'm1', bill_id: BILL, due_on: '2026-11-05', kind: 'skipped', snoozed_until: null }], error: null }],
      })
      await run()
      expect(written()).toMatchObject({ starts_on: '2026-12-05' })
    })

    it('an edit that keeps the rule and start date writes the start date as it was (no reads)', async () => {
      const stored = billRow({ repeat_days: [0], starts_on: '2025-01-15' })
      const { db, run, written } = await update(stored, { startsOn: '2025-01-15', amountCents: 1_600_000 })
      await run()
      expect(written()).toMatchObject({ starts_on: '2025-01-15', amount_cents: 1_600_000 })
      expect(db.calls.some((call) => call.table === 'expenses' || call.table === 'expense_bill_marks')).toBe(false)
    })

    it('refuses a NEW start date more than 400 days back, against the stored one (L1)', async () => {
      const stored = billRow({ starts_on: '2026-10-01' })
      const { db, run } = await update(stored, { startsOn: '2025-09-01' })
      await expect(run()).rejects.toThrow(EXPENSE_MESSAGES.billStartTooOld)
      expect(db.calls.some((call) => call.method === 'update')).toBe(false)
    })

    it('says the bill is gone when it cannot be read', async () => {
      const [{ updateBill }, { billUpdateSchema }] = await Promise.all([loadService(), loadValidation()])
      const db = scriptedClient({ expense_bills: [{ data: null, error: null }] })
      const input = billUpdateSchema.parse({ billId: BILL, draft: draft() })
      await expect(updateBill(db.client, TENANT, input, '2026-10-22')).rejects.toThrow(EXPENSE_MESSAGES.billGone)
    })

    it('asks for a later end date when no due date is left before it', async () => {
      const stored = billRow({ repeat_days: [1], starts_on: '2026-08-01' })
      const { run } = await update(stored, { rule: { kind: 'monthly', day: 5 }, startsOn: '2026-08-01', endsOn: '2026-10-31' }, {
        expenses: [{ data: [], error: null }],
        expense_bill_marks: [{ data: [], error: null }],
      })
      await expect(run()).rejects.toThrow(EXPENSE_MESSAGES.billNoDueLeft)
    })
  })

  it('explains that a stopped bill stays as it is', async () => {
    const { endBill } = await loadService()
    const db = scriptedClient({
      expense_bills: [{ data: null, error: { code: '42501', message: 'This bill was stopped and cannot change' } }],
    })
    await expect(endBill(db.client, TENANT, { billId: BILL })).rejects.toThrow(EXPENSE_MESSAGES.billStopped)
  })

  it('explains a pause that would end on a day already gone', async () => {
    const { pauseBill } = await loadService()
    const db = scriptedClient({ expense_bills: [{ data: null, error: { code: '22023', message: 'pause_until_past' } }] })
    await expect(pauseBill(db.client, TENANT, { billId: BILL, pausedUntil: '2026-12-01' })).rejects.toThrow(EXPENSE_MESSAGES.billPauseInPast)
  })
})

describe('marks', () => {
  it('marks a due date with ONE upsert, so a failed write never loses the old mark (L3)', async () => {
    const { markBill } = await loadService()
    const db = scriptedClient({
      expense_bill_marks: [{ data: [{ bill_id: BILL, due_on: '2026-10-31', kind: 'snoozed', snoozed_until: '2026-11-01' }], error: null }],
    })
    const mark = await markBill(db.client, TENANT, { billId: BILL, dueOn: '2026-10-31', kind: 'snoozed', snoozedUntil: '2026-11-01' })
    expect(mark).toEqual({ billId: BILL, dueOn: '2026-10-31', kind: 'snoozed', snoozedUntil: '2026-11-01' })
    const writes = db.calls.filter((call) => ['delete', 'insert', 'upsert'].includes(call.method))
    expect(writes.map((call) => call.method)).toEqual(['upsert'])
    expect(writes[0].args).toEqual([
      { tenant_id: TENANT, bill_id: BILL, due_on: '2026-10-31', kind: 'snoozed', snoozed_until: '2026-11-01' },
      { onConflict: 'bill_id,due_on' },
    ])
  })

  it('refuses silently-refused marks', async () => {
    const { markBill } = await loadService()
    const db = scriptedClient({ expense_bill_marks: [{ data: [], error: null }] })
    await expect(markBill(db.client, TENANT, { billId: BILL, dueOn: '2026-10-31', kind: 'skipped' })).rejects.toThrow(EXPENSE_MESSAGES.billGone)
  })

  it('says an undo that deleted nothing was already undone', async () => {
    const { unmarkBill } = await loadService()
    const db = scriptedClient({ expense_bill_marks: [{ data: [], error: null }] })
    await expect(unmarkBill(db.client, TENANT, { billId: BILL, dueOn: '2026-10-31' })).rejects.toThrow(EXPENSE_MESSAGES.billMarkGone)
  })
})

describe('"I already recorded it"', () => {
  it('links a recorded expense to a due date', async () => {
    const { linkExpenseToBill } = await loadService()
    const db = scriptedClient({ expenses: [{ data: [expenseRow({ id: EXPENSE, bill_id: BILL, bill_due_on: '2026-10-31' })], error: null }] })
    const expense = await linkExpenseToBill(db.client, TENANT, { expenseId: EXPENSE, billId: BILL, dueOn: '2026-10-31' })
    expect(expense).toMatchObject({ id: EXPENSE, billId: BILL, billDueOn: '2026-10-31' })
    expect(db.calls.find((call) => call.method === 'update')?.args[0]).toMatchObject({ bill_id: BILL, bill_due_on: '2026-10-31' })
    expect(db.calls.some((call) => call.method === 'eq' && call.args[0] === 'status' && call.args[1] === 'recorded')).toBe(true)
  })

  it('says the due date is already paid on a unique conflict', async () => {
    const { linkExpenseToBill } = await loadService()
    const db = scriptedClient({
      expenses: [{ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "expenses_bill_due_recorded_uq"' } }],
    })
    await expect(linkExpenseToBill(db.client, TENANT, { expenseId: EXPENSE, billId: BILL, dueOn: '2026-10-31' })).rejects.toThrow(
      EXPENSE_MESSAGES.billDueAlreadyPaid,
    )
  })

  it('unlinks both columns, and a voided or invisible row is refused', async () => {
    const { unlinkExpenseFromBill } = await loadService()
    const db = scriptedClient({ expenses: [{ data: [], error: null }] })
    await expect(unlinkExpenseFromBill(db.client, TENANT, { expenseId: EXPENSE })).rejects.toThrow(EXPENSE_MESSAGES.goneOrVoided)
    expect(db.calls.find((call) => call.method === 'update')?.args[0]).toMatchObject({ bill_id: null, bill_due_on: null })
  })
})

describe('reads', () => {
  it('maps bill rows, including "changes every time" and twice a month', async () => {
    const { listBills } = await loadRead()
    const db = scriptedClient({
      expense_bills: [{
        data: [billRow(), billRow({ id: 'b2', amount_cents: null, repeat_kind: 'twice_monthly', repeat_days: [15, 0] })],
        error: null,
        count: 2,
      }],
    })
    const bills = await listBills(db.client, { tenantId: TENANT })
    expect(bills[0].pausedOn).toBeNull()
    expect(bills.map((bill) => [bill.amountCents, bill.rule])).toEqual([
      [1_500_000, { kind: 'monthly', day: 'last' }],
      [null, { kind: 'twice_monthly', days: [15, 'last'] }],
    ])
  })

  it('reads only recorded payments with a link, in the window', async () => {
    const { listBillPayments } = await loadRead()
    const db = scriptedClient({
      expenses: [{
        data: [{ id: EXPENSE, bill_id: BILL, bill_due_on: '2026-10-31', amount_cents: '1500000', spent_on: '2026-10-30' }],
        error: null,
        count: 1,
      }],
    })
    const payments = await listBillPayments(db.client, { tenantId: TENANT, from: '2026-07-01', to: '2026-12-31' })
    expect(payments).toEqual([{ billId: BILL, dueOn: '2026-10-31', expenseId: EXPENSE, amountCents: 1_500_000, spentOn: '2026-10-30' }])
    const filters = db.calls.filter((call) => ['eq', 'not', 'gte', 'lte'].includes(call.method)).map((call) => [call.method, ...call.args])
    expect(filters).toEqual(expect.arrayContaining([
      ['eq', 'status', 'recorded'],
      ['not', 'bill_id', 'is', null],
      ['gte', 'bill_due_on', '2026-07-01'],
      ['lte', 'bill_due_on', '2026-12-31'],
    ]))
  })

  it('refuses a window longer than 400 days', async () => {
    const { listBillMarks } = await loadRead()
    const db = scriptedClient({})
    await expect(listBillMarks(db.client, { tenantId: TENANT, from: '2025-01-01', to: '2026-12-31' })).rejects.toThrow('Pick at most 400 days.')
  })

  it('keeps only marks and payments of bills the caller can see', async () => {
    const { readBillBoard } = await loadRead()
    const db = scriptedClient({
      expense_bills: [{ data: [billRow()], error: null, count: 1 }],
      expense_bill_marks: [{
        data: [
          { id: 'm1', bill_id: BILL, due_on: '2026-11-30', kind: 'skipped', snoozed_until: null },
          { id: 'm2', bill_id: 'other', due_on: '2026-11-30', kind: 'skipped', snoozed_until: null },
        ],
        error: null,
        count: 2,
      }],
      expenses: [{ data: [], error: null, count: 0 }],
    })
    const board = await readBillBoard(db.client, TENANT, '2026-10-22')
    expect(board.bills).toHaveLength(1)
    expect(board.marks.map((mark) => mark.billId)).toEqual([BILL])
  })

  it('names a failed read in plain words', async () => {
    const { listBills } = await loadRead()
    const db = scriptedClient({ expense_bills: [{ data: null, error: { message: 'boom' } }] })
    await expect(listBills(db.client, { tenantId: TENANT })).rejects.toThrow(EXPENSE_MESSAGES.billsReadFailed)
  })
})
