import type { SupabaseClient } from '@supabase/supabase-js'
import { fakeSupabaseTables } from '../../fixtures/fake-supabase-tables'
import { expenseRow } from './expense-row.fixture'

const TENANT = 'tenant-1'
const LPG = '11111111-1111-4111-8111-111111111111'
const ICE = '22222222-2222-4222-8222-222222222222'

async function load() {
  return import('@/lib/expenses/read/expenses-read')
}

/** The fake client plus an `rpc` the reads may call. */
type RpcAnswer = { data: unknown; error: { code?: string; message: string } | null }

function clientWith(
  tables: Record<string, object[]>,
  rpc: jest.Mock<Promise<RpcAnswer>, unknown[]> = jest.fn(async (): Promise<RpcAnswer> => ({ data: null, error: null })),
) {
  const fake = fakeSupabaseTables(tables)
  return { ...fake, rpc, client: { from: fake.client.from, rpc } as unknown as SupabaseClient }
}

function dayOffset(base: string, days: number): string {
  return new Date(Date.parse(`${base}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => undefined))
afterEach(() => jest.restoreAllMocks())

describe('listExpenses', () => {
  it('reads every recorded expense in the window past the 1000-row cap, newest first', async () => {
    const { listExpenses } = await load()
    const inWindow = Array.from({ length: 2_500 }, (_, index) =>
      expenseRow({ id: `exp-${String(index).padStart(5, '0')}`, spent_on: dayOffset('2026-10-01', index % 21) }),
    )
    const noise = [
      expenseRow({ id: 'other-store', tenant_id: 'tenant-2' }),
      expenseRow({ id: 'too-old', spent_on: '2026-09-30' }),
      expenseRow({ id: 'voided', status: 'void' }),
    ]
    const fake = clientWith({ expenses: [...inWindow, ...noise] })

    const result = await listExpenses(fake.client, { tenantId: TENANT, from: '2026-10-01', to: '2026-10-21' })

    expect(result.isTruncated).toBe(false)
    expect(result.expenses).toHaveLength(2_500)
    expect(new Set(result.expenses.map((expense) => expense.id)).size).toBe(2_500)
    expect(result.expenses[0].spentOn).toBe('2026-10-21')
    expect(fake.requests.filter((request) => request.table === 'expenses').length).toBeGreaterThan(1)
  })

  it('narrows to store-wide rows, a category and any status when asked', async () => {
    const { listExpenses } = await load()
    const fake = clientWith({
      expenses: [
        expenseRow({ id: 'store-wide', outlet_id: null, status: 'void', category_id: LPG }),
        expenseRow({ id: 'branch', outlet_id: 'out-1', category_id: LPG }),
        expenseRow({ id: 'other-category', category_id: ICE }),
      ],
    })
    const result = await listExpenses(fake.client, {
      tenantId: TENANT, from: '2026-10-01', to: '2026-10-21', outletId: null, categoryId: LPG, status: 'all',
    })
    expect(result.expenses.map((expense) => expense.id)).toEqual(['store-wide'])
  })

  it('refuses a window longer than 400 days before reading anything', async () => {
    const { listExpenses } = await load()
    const fake = clientWith({ expenses: [] })
    await expect(listExpenses(fake.client, { tenantId: TENANT, from: '2025-01-01', to: '2026-10-21' })).rejects.toThrow('400 days')
    expect(fake.requests).toHaveLength(0)
  })

  it('turns a read failure into a sentence', async () => {
    const { listExpenses } = await load()
    const fake = fakeSupabaseTables({}, { expenses: 'permission denied for table expenses' })
    await expect(
      listExpenses(fake.client, { tenantId: TENANT, from: '2026-10-01', to: '2026-10-21' }),
    ).rejects.toThrow("We couldn't load your expenses. Please try again.")
  })
})

describe('getExpense', () => {
  it('returns the expense, its receipts and every other version of it', async () => {
    const { getExpense } = await load()
    const fake = clientWith({
      expenses: [
        expenseRow({ id: 'v1', status: 'void', created_at: '2026-10-21T01:00:00Z' }),
        expenseRow({ id: 'v2', status: 'void', replaces_expense_id: 'v1', created_at: '2026-10-21T02:00:00Z' }),
        expenseRow({ id: 'v3', replaces_expense_id: 'v2', created_at: '2026-10-21T03:00:00Z' }),
      ],
      expense_receipts: [
        { id: 'r1', tenant_id: TENANT, expense_id: 'v2', mime: 'image/jpeg', bytes: 1000, uploaded_by: 'u', created_at: '2026-10-21T02:01:00Z', object_path: 'x' },
      ],
    })

    const detail = await getExpense(fake.client, TENANT, 'v2')

    expect(detail?.expense.id).toBe('v2')
    expect(detail?.expense.receiptCount).toBe(1)
    expect(detail?.receipts).toEqual([
      { id: 'r1', expenseId: 'v2', mime: 'image/jpeg', bytes: 1000, uploadedBy: 'u', createdAt: '2026-10-21T02:01:00Z' },
    ])
    expect(detail?.history.map((version) => version.id)).toEqual(['v3', 'v1'])
  })

  it('answers null for an expense the caller cannot see', async () => {
    const { getExpense } = await load()
    expect(await getExpense(clientWith({ expenses: [] }).client, TENANT, 'nope')).toBeNull()
  })
})

describe('listCategories', () => {
  const category = { id: 'c1', tenant_id: TENANT, system_key: 'lpg', name: 'Gas / LPG', icon: 'LP', grp: 'utilities', needs_note: false, sort_order: 110, archived_at: null }

  it('seeds an empty store once, then reads the seeded list', async () => {
    const { listCategories } = await load()
    const rows: object[] = []
    const rpc = jest.fn(async (): Promise<RpcAnswer> => {
      rows.push(category)
      return { data: null, error: null }
    })
    const fake = clientWith({ expense_categories: rows }, rpc)

    const categories = await listCategories(fake.client, TENANT)

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('ensure_expense_categories', { p_tenant_id: TENANT })
    expect(categories.map((entry) => entry.name)).toEqual(['Gas / LPG'])
  })

  it('does not seed a store that already has categories', async () => {
    const { listCategories } = await load()
    const fake = clientWith({ expense_categories: [category] })
    await listCategories(fake.client, TENANT)
    expect(fake.rpc).not.toHaveBeenCalled()
  })

  it("maps a refused seed to the access sentence", async () => {
    const { listCategories } = await load()
    const rpc = jest.fn(async (): Promise<RpcAnswer> => ({ data: null, error: { code: '42501', message: 'not a member' } }))
    await expect(listCategories(clientWith({ expense_categories: [] }, rpc).client, TENANT)).rejects.toThrow(
      "You don't have access to expenses.",
    )
  })
})

describe('listUnsortedPayouts', () => {
  const movement = (id: string, createdAt: string, amount: string | number = '150.50') => ({
    id, shift_id: 'shift-1', tenant_id: TENANT, outlet_id: 'out-1', kind: 'pay_out', amount, reason: 'yelo',
    recorded_by: 'u', recorded_by_name: 'Ben', created_at: createdAt,
  })

  it('returns pay-outs in the Manila window that no expense of any status links', async () => {
    const { listUnsortedPayouts } = await load()
    const fake = clientWith({
      shift_cash_movements: [
        movement('linked', '2026-10-21T03:00:00Z'),
        movement('unsorted', '2026-10-21T04:00:00Z'),
        // 00:30 on the 21st in Manila — inside.
        movement('just-after-midnight', '2026-10-20T16:30:00Z'),
        // 23:59 on the 20th in Manila — outside.
        movement('day-before', '2026-10-20T15:59:00Z'),
        { ...movement('pay-in', '2026-10-21T05:00:00Z'), kind: 'pay_in' },
        movement('voided', '2026-10-21T06:00:00Z'),
      ],
      expenses: [
        expenseRow({ id: 'e1', paid_from: 'drawer', shift_cash_movement_id: 'linked' }),
        expenseRow({ id: 'e2', paid_from: 'drawer', shift_cash_movement_id: 'voided', status: 'void' }),
      ],
    })

    const payouts = await listUnsortedPayouts(fake.client, TENANT, '2026-10-21', '2026-10-21')

    expect(payouts.map((payout) => payout.movementId)).toEqual(['unsorted', 'just-after-midnight'])
    expect(payouts[0]).toMatchObject({ amountCents: 15_050, shiftId: 'shift-1', recordedByName: 'Ben' })
  })

  it('refuses a reversed window', async () => {
    const { listUnsortedPayouts } = await load()
    await expect(listUnsortedPayouts(clientWith({}).client, TENANT, '2026-10-21', '2026-10-01')).rejects.toThrow('before the start')
  })
})
