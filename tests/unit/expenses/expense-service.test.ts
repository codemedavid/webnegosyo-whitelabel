import type { SupabaseClient } from '@supabase/supabase-js'
import { expenseRow } from './expense-row.fixture'

const TENANT = 'tenant-1'
const EXPENSE = '33333333-3333-4333-8333-333333333333'
const CATEGORY = '11111111-1111-4111-8111-111111111111'

interface Settled {
  data: unknown
  error: { code?: string; message: string } | null
}

interface Call {
  table: string
  method: string
  args: unknown[]
}

/**
 * A chainable stand-in: every builder method is recorded and returns the
 * builder; awaiting it settles to the next queued answer for that table.
 */
function scriptedClient(answers: Record<string, Settled[]>, rpcAnswer: Settled = { data: null, error: null }) {
  const calls: Call[] = []
  const rpc = jest.fn(async () => rpcAnswer)
  const from = (table: string) => {
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'insert', 'update', 'eq', 'is', 'order', 'limit', 'range']) {
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
  return { client: { from, rpc } as unknown as SupabaseClient, calls, rpc }
}

async function load() {
  return import('@/lib/expenses/expense-service')
}

const draft = {
  amountCents: 125_000,
  categoryId: CATEGORY,
  spentOn: '2026-10-21',
  paidFrom: 'cash' as const,
  outletId: null,
  clientRequestId: '44444444-4444-4444-8444-444444444444',
}

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => undefined))
afterEach(() => jest.restoreAllMocks())

describe('recordExpense', () => {
  it('inserts with the actor name and returns the stored expense', async () => {
    const { recordExpense } = await load()
    const db = scriptedClient({ expenses: [{ data: [expenseRow({ id: EXPENSE })], error: null }] })

    const expense = await recordExpense(db.client, TENANT, draft, { displayName: '  Ana Cruz ' })

    expect(expense.id).toBe(EXPENSE)
    const insert = db.calls.find((call) => call.method === 'insert')
    expect(insert?.args[0]).toMatchObject({ tenant_id: TENANT, created_by_name: 'Ana Cruz', paid_from: 'cash', amount_cents: 125_000 })
  })

  it('treats an insert that returns no row as refused (RLS is silent)', async () => {
    const { recordExpense } = await load()
    const db = scriptedClient({ expenses: [{ data: [], error: null }] })
    await expect(recordExpense(db.client, TENANT, draft, { displayName: 'Ana' })).rejects.toThrow(
      "You don't have access to expenses.",
    )
  })

  it('returns the first expense when the same request arrives twice', async () => {
    const { recordExpense } = await load()
    const db = scriptedClient({
      expenses: [
        { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "expenses_tenant_client_request_id_key" (client_request_id)' } },
        { data: [expenseRow({ id: 'first' })], error: null },
      ],
    })
    expect((await recordExpense(db.client, TENANT, draft, { displayName: 'Ana' })).id).toBe('first')
  })

  it('maps a needs-note refusal and a check violation to sentences', async () => {
    const { recordExpense } = await load()
    const noteRefused = scriptedClient({ expenses: [{ data: null, error: { code: '22023', message: 'note_required' } }] })
    await expect(recordExpense(noteRefused.client, TENANT, draft, { displayName: 'Ana' })).rejects.toThrow('Add a note for this category.')
    const checkRefused = scriptedClient({ expenses: [{ data: null, error: { code: '23514', message: 'expenses_vat_cents_check' } }] })
    await expect(recordExpense(checkRefused.client, TENANT, draft, { displayName: 'Ana' })).rejects.toThrow("Some details don't add up")
  })

  it('falls back to "Staff" for a blank display name', async () => {
    const { actorName } = await load()
    expect(actorName({ displayName: '   ' })).toBe('Staff')
    expect(actorName({ displayName: 'x'.repeat(100) })).toHaveLength(80)
  })
})

describe('voidExpense / replaceExpense / sortDrawerPayout', () => {
  it('voids through the RPC', async () => {
    const { voidExpense } = await load()
    const db = scriptedClient({})
    await voidExpense(db.client, { expenseId: EXPENSE, reason: 'wrong category' }, { displayName: 'Ana' })
    expect(db.rpc).toHaveBeenCalledWith('void_expense', { p_expense_id: EXPENSE, p_reason: 'wrong category', p_actor_name: 'Ana' })
  })

  it.each([
    [{ code: 'P0002', message: 'no recorded expense' }, "That expense was already voided or doesn't exist."],
    [{ code: '42501', message: 'permission denied' }, "You don't have access to expenses."],
    [{ code: '22023', message: 'drawer_shift_closed' }, "This shift is closed, so the cash can't go back into the drawer. Use Fix to change the category instead."],
  ])('maps a void refusal %j', async (error, sentence) => {
    const { voidExpense } = await load()
    const db = scriptedClient({}, { data: null, error })
    await expect(voidExpense(db.client, { expenseId: EXPENSE, reason: 'x' }, { displayName: 'Ana' })).rejects.toThrow(sentence)
  })

  it('replaces with a snake_case patch and returns the new id', async () => {
    const { replaceExpense } = await load()
    const db = scriptedClient({}, { data: 'new-id', error: null })
    const id = await replaceExpense(db.client, { expenseId: EXPENSE, reason: 'typo', patch: { amountCents: 120_000 } })
    expect(id).toBe('new-id')
    expect(db.rpc).toHaveBeenCalledWith('replace_expense', { p_expense_id: EXPENSE, p_reason: 'typo', p_patch: { amount_cents: 120_000 } })
  })

  it('explains a drawer-locked replace', async () => {
    const { replaceExpense } = await load()
    const db = scriptedClient({}, { data: null, error: { code: '22023', message: 'drawer_locked' } })
    await expect(
      replaceExpense(db.client, { expenseId: EXPENSE, reason: 'typo', patch: { amountCents: 1 } }),
    ).rejects.toThrow('A drawer expense keeps its amount and date. Record a pay in on the drawer to correct the cash.')
  })

  it('sorts a pay-out with the actor as recorder', async () => {
    const { sortDrawerPayout } = await load()
    const db = scriptedClient({}, { data: 'exp-9', error: null })
    const id = await sortDrawerPayout(db.client, { movementId: 'm-1', categoryId: CATEGORY, note: 'yelo' }, { displayName: 'Owner' })
    expect(id).toBe('exp-9')
    expect(db.rpc).toHaveBeenCalledWith('sort_drawer_payout', {
      p_movement_id: 'm-1', p_category_id: CATEGORY, p_note: 'yelo', p_supplier_id: null, p_paid_to_name: null, p_recorded_by_name: 'Owner',
    })
  })

  it('refuses an RPC that answers without an id', async () => {
    const { sortDrawerPayout } = await load()
    const db = scriptedClient({}, { data: null, error: null })
    await expect(sortDrawerPayout(db.client, { movementId: 'm-1', categoryId: CATEGORY }, { displayName: 'Owner' })).rejects.toThrow(
      "We couldn't save that",
    )
  })
})

describe('updateExpenseDetails', () => {
  it('updates only recorded rows of the store and returns the result', async () => {
    const { updateExpenseDetails } = await load()
    const db = scriptedClient({ expenses: [{ data: [expenseRow({ id: EXPENSE, invoice_no: 'SI-1' })], error: null }] })
    const expense = await updateExpenseDetails(db.client, TENANT, { expenseId: EXPENSE, invoiceNo: 'SI-1' })
    expect(expense.invoiceNo).toBe('SI-1')
    const filters = db.calls.filter((call) => call.method === 'eq').map((call) => call.args)
    expect(filters).toEqual([['tenant_id', TENANT], ['id', EXPENSE], ['status', 'recorded']])
  })

  it('refuses when no row was affected (voided, or RLS)', async () => {
    const { updateExpenseDetails } = await load()
    const db = scriptedClient({ expenses: [{ data: [], error: null }] })
    await expect(updateExpenseDetails(db.client, TENANT, { expenseId: EXPENSE, note: 'x' })).rejects.toThrow(
      "That expense was already voided or doesn't exist.",
    )
  })
})

describe('categories and suppliers', () => {
  const categoryRow = { id: 'c1', tenant_id: TENANT, system_key: null, name: 'Yelo', icon: 'YL', grp: 'ingredients', needs_note: false, sort_order: 0, archived_at: null }
  const supplierRow = { id: 's1', tenant_id: TENANT, name: 'Meralco', kind: 'utility', tin: null, default_category_id: null, phone: null, note: null, archived_at: null }

  it('inserts a new category for the store', async () => {
    const { saveCategory } = await load()
    const db = scriptedClient({ expense_categories: [{ data: [categoryRow], error: null }] })
    const saved = await saveCategory(db.client, TENANT, { name: 'Yelo', group: 'ingredients', icon: 'YL' })
    expect(saved.name).toBe('Yelo')
    expect(db.calls.find((call) => call.method === 'insert')?.args[0]).toEqual({ name: 'Yelo', grp: 'ingredients', icon: 'YL', tenant_id: TENANT })
  })

  it('refuses an edit that touched no row, and a taken name', async () => {
    const { saveCategory } = await load()
    const none = scriptedClient({ expense_categories: [{ data: [], error: null }] })
    await expect(saveCategory(none.client, TENANT, { id: 'c1', name: 'Yelo', group: 'ingredients' })).rejects.toThrow(
      'That category is no longer available.',
    )
    const taken = scriptedClient({ expense_categories: [{ data: null, error: { code: '23505', message: 'expense_categories_name' } }] })
    await expect(saveCategory(taken.client, TENANT, { name: 'Yelo', group: 'ingredients' })).rejects.toThrow(
      'There is already a category with that name.',
    )
  })

  it('archives and restores a category', async () => {
    const { archiveCategory } = await load()
    const db = scriptedClient({ expense_categories: [{ data: [{ ...categoryRow, archived_at: 'now' }], error: null }, { data: [categoryRow], error: null }] })
    await archiveCategory(db.client, TENANT, { id: 'c1' })
    await archiveCategory(db.client, TENANT, { id: 'c1', archived: false })
    const updates = db.calls.filter((call) => call.method === 'update').map((call) => call.args[0] as { archived_at: string | null })
    expect(typeof updates[0].archived_at).toBe('string')
    expect(updates[1].archived_at).toBeNull()
  })

  it('refuses an archive that touched no row', async () => {
    const { archiveCategory } = await load()
    const db = scriptedClient({ expense_categories: [{ data: [], error: null }] })
    await expect(archiveCategory(db.client, TENANT, { id: 'c1' })).rejects.toThrow('That category is no longer available.')
  })

  it('saves a supplier and refuses a silent zero-row insert', async () => {
    const { saveSupplier } = await load()
    const ok = scriptedClient({ suppliers: [{ data: [supplierRow], error: null }] })
    expect((await saveSupplier(ok.client, TENANT, { name: 'Meralco', kind: 'utility' })).name).toBe('Meralco')
    const refused = scriptedClient({ suppliers: [{ data: [], error: null }] })
    await expect(saveSupplier(refused.client, TENANT, { name: 'Meralco' })).rejects.toThrow("You don't have access to expenses.")
    const taken = scriptedClient({ suppliers: [{ data: null, error: { code: '23505', message: 'suppliers_name' } }] })
    await expect(saveSupplier(taken.client, TENANT, { name: 'Meralco' })).rejects.toThrow('There is already someone with that name')
  })
})
